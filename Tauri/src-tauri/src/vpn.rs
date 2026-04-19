use crate::privileges;
use std::sync::Mutex;
use std::fs::File;
use std::io::Write;
use std::path::PathBuf;
use std::process::Command;
use tauri::{AppHandle, Runtime};
use tauri_plugin_shell::ShellExt;

struct TempConfigGuard(PathBuf);
static ACTIVE_ROUTES: Mutex<Vec<(String, String)>> = Mutex::new(Vec::new());

impl Drop for TempConfigGuard {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

// Tunnel interface name (fixed to avoid clashes with other VPN software)
const INTERFACE_NAME: &str = "PingPalAdapter";

#[tracing::instrument(level = "info", skip(app, config_content), fields(ipv4_address = %ipv4_address, config_len = config_content.len()))]
#[tauri::command]
pub async fn connect_vpn<R: Runtime>(
    app: AppHandle<R>,
    config_content: String,
    ipv4_address: String,
) -> Result<String, String> {
    clean_vpn_routes();
    // Step 0: require elevated session (admin)
    let admin_check = Command::new("net")
        .args(["session"])
        .output()
        .map_err(|e| format!("failed to check admin session: {}", e))?;

    if !admin_check.status.success() {
        return Err(
            "Run this application as Administrator to establish a VPN connection.".to_string(),
        );
    }

    // Step 0.5: privileges WireGuard may need for protected named pipes
    if let Err(e) = privileges::enable_se_restore_privilege() {
        tracing::warn!(error = %e, "could not enable SeRestorePrivilege; continuing");
    } else {
        tracing::debug!("SeRestorePrivilege enabled for WireGuard");
    }

    // Step 1: write temp config (wg-tool only accepts a file path)
    let temp_dir = std::env::temp_dir();
    let config_path = temp_dir.join("pingpal.conf");

    // Filter out unsupported lines
    let filtered_config: String = config_content
        .lines()
        .filter(|line| {
            let trim = line.trim();
            !trim.starts_with("Address")
                && !trim.starts_with("DNS")
                && !trim.starts_with("MTU")
                && !trim.starts_with("PreUp")
                && !trim.starts_with("PostUp")
                && !trim.starts_with("PreDown")
                && !trim.starts_with("PostDown")
                && !trim.starts_with("Table")
                && !trim.starts_with("SaveConfig")
        })
        .collect::<Vec<&str>>()
        .join("\n");

    {
        let mut file =
            File::create(&config_path).map_err(|e| format!("failed to create config: {}", e))?;
        file.write_all(filtered_config.as_bytes())
            .map_err(|e| format!("failed to write config: {}", e))?;
    }

    let _config_guard = TempConfigGuard(config_path.clone());
    tracing::debug!(path = ?config_path, "wrote temp WireGuard config");

    // Step 2: Windows service runs wg-engine as SYSTEM
    tracing::debug!("configuring Windows service for wg-engine");

    let exe_dir = std::env::current_exe()
        .map_err(|e| format!("failed to resolve executable path: {}", e))?
        .parent()
        .ok_or("failed to resolve executable directory")?
        .to_path_buf();

    let engine_path = if cfg!(debug_assertions) {
        exe_dir
            .parent()
            .ok_or("failed to resolve target directory")?
            .parent()
            .ok_or("failed to resolve src-tauri directory")?
            .join("bin")
            .join("wg-engine-x86_64-pc-windows-msvc.exe")
    } else {
        exe_dir.join("wg-engine-x86_64-pc-windows-msvc.exe")
    };

    let wrapper_path = exe_dir.join("wg_service.exe");

    let engine_path_str = engine_path
        .to_str()
        .ok_or("engine path is not valid UTF-8")?
        .to_string();

    let wrapper_path_str = wrapper_path
        .to_str()
        .ok_or("wrapper path is not valid UTF-8")?
        .to_string();

    tracing::debug!(%engine_path_str, %wrapper_path_str, "wg sidecar paths");

    if !engine_path.exists() {
        return Err(format!("wg-engine not found at: {}", engine_path_str));
    }
    if !wrapper_path.exists() {
        return Err(format!(
            "wg_service not found at: {} (build the wg_service binary)",
            wrapper_path_str
        ));
    }

    tracing::debug!("resetting Windows service");
    let _ = crate::service_manager::delete_service();

    crate::service_manager::create_service(&wrapper_path_str, &engine_path_str, INTERFACE_NAME)?;

    tracing::debug!("starting Windows service (SYSTEM)");
    crate::service_manager::start_service()?;

    crate::service_manager::wait_for_service_running(10)?;

    tracing::debug!("waiting for tunnel adapter");
    std::thread::sleep(std::time::Duration::from_secs(2));

    let mut interface_verified = false;
    for i in 0..10 {
        let check_output = Command::new("netsh")
            .args([
                "interface",
                "show",
                "interface",
                &format!("name=\"{}\"", INTERFACE_NAME),
            ])
            .output();

        if let Ok(output) = check_output {
            if output.status.success() {
                interface_verified = true;
                tracing::debug!(attempt = i + 1, "tunnel adapter present");
                break;
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(500));
    }

    if !interface_verified {
        return Err(
            "Service started but the tunnel adapter did not appear. Check that WireGuard is installed."
                .to_string(),
        );
    }

    // Step 3: wg setconf
    tracing::debug!("applying wg setconf");
    let wg_tool = app.shell().sidecar("wg-tool").map_err(|e| e.to_string())?;
    let output = wg_tool
        .args(["setconf", INTERFACE_NAME, config_path.to_str().unwrap()])
        .output()
        .await
        .map_err(|e| format!("wg-tool setconf failed: {}", e))?;

    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr);
        return Err(format!("wg-tool error: {}", err_msg));
    }

    // Step 4: set interface IP via netsh (no wg-quick on Windows)
    tracing::debug!(%ipv4_address, "setting interface IP via netsh");
    let netsh_output = Command::new("netsh")
        .args([
            "interface",
            "ip",
            "set",
            "address",
            &format!("name=\"{}\"", INTERFACE_NAME),
            "static",
            &ipv4_address,
            "255.255.255.255",
        ])
        .output()
        .map_err(|e| format!("netsh failed: {}", e))?;

    if !netsh_output.status.success() {
        let err_msg = String::from_utf8_lossy(&netsh_output.stderr);
        return Err(format!(
            "failed to set IP (admin rights required): {}",
            err_msg
        ));
    }

    // Step 5: split-tunnel routes from AllowedIPs
    tracing::debug!("adding split-tunnel routes");
    let allowed_ips_line = config_content
        .lines()
        .find(|line| line.trim().starts_with("AllowedIPs"))
        .unwrap_or("");

    if !allowed_ips_line.is_empty() {
        let ips: Vec<&str> = allowed_ips_line
            .split('=')
            .nth(1)
            .unwrap_or("")
            .split(',')
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .collect();

        let if_index_output = Command::new("netsh")
            .args(["interface", "ipv4", "show", "interfaces"])
            .output()
            .map_err(|e| format!("failed to list interfaces: {}", e))?;

        let if_output_text = String::from_utf8_lossy(&if_index_output.stdout);
        let mut interface_idx = None;

        for line in if_output_text.lines() {
            if line.contains(INTERFACE_NAME) {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if !parts.is_empty() {
                    if let Ok(idx) = parts[0].parse::<u32>() {
                        interface_idx = Some(idx);
                        tracing::debug!(idx, "resolved interface index");
                        break;
                    }
                }
            }
        }

        let if_idx = interface_idx.ok_or("could not resolve VPN interface index")?;
        
        if ips.len() == 1 && ips[0] == "0.0.0.0/0" {
            
            let endpoint_ip = config_content
                .lines()
                .find(|l| l.trim().starts_with("Endpoint"))
                .and_then(|l| l.split('=').nth(1))
                .and_then(|s| s.trim().split(':').next())
                .map(|s| s.trim().to_string());
            let gw_output = Command::new("route")
                .args(["print", "0.0.0.0"])
                .output();
          
            let current_gateway: Option<String> = gw_output.ok().and_then(|o| {
                String::from_utf8_lossy(&o.stdout)
                    .lines()
                    .find(|l| l.trim().starts_with("0.0.0.0") && l.contains("0.0.0.0"))
                    .and_then(|l| l.split_whitespace().nth(2))
                    .map(|s| s.to_string())
            });
            if let (Some(ep_ip), Some(gateway)) = (endpoint_ip, current_gateway) {
                let _ = Command::new("route")
                    .args(["add", &ep_ip, "mask", "255.255.255.255", &gateway, "METRIC", "1"])
                    .output();
                
                if let Ok(mut routes) = ACTIVE_ROUTES.lock() {
                    routes.push((ep_ip.clone(), "255.255.255.255".to_string()));
                }
            }
            
            let parts: Vec<&str> = ipv4_address.split('.').collect();
            let vpn_peer = if parts.len() == 4 {
                format!("{}.{}.{}.1", parts[0], parts[1], parts[2])
            } else {
                "10.0.0.1".to_string()
            };

            let subnet_parts: Vec<&str> = ipv4_address.split('.').collect();
            let vpn_subnet = if subnet_parts.len() == 4 {
                format!("{}.{}.{}.0", subnet_parts[0], subnet_parts[1], subnet_parts[2])
            } else {
                "10.0.0.0".to_string()
            };
            let _ = Command::new("route")
                .args(["add", &vpn_subnet, "mask", "255.255.255.0", &ipv4_address])
                .output();
            if let Ok(mut routes) = ACTIVE_ROUTES.lock() {
                routes.push((vpn_subnet.clone(), "255.255.255.0".to_string()));
            }

            for &(net, mask) in &[("0.0.0.0", "128.0.0.0"), ("128.0.0.0", "128.0.0.0")] {
                let _ = Command::new("route")
                    .args([
                        "add",
                        net,
                        "mask",
                        mask,
                        &vpn_peer,
                        "IF",
                        &if_idx.to_string(),
                        "METRIC",
                        "1",
                    ])
                    .output();
                
                if let Ok(mut routes) = ACTIVE_ROUTES.lock() {
                    routes.push((net.to_string(), mask.to_string()));
                }
            }
        } else {

            for ip_cidr in ips {
                let parts: Vec<&str> = ip_cidr.split('/').collect();
                if parts.len() != 2 {
                    tracing::warn!(%ip_cidr, "skip invalid CIDR");
                    continue;
                }
    
                let network = parts[0];
                let prefix_len: u32 = match parts[1].parse() {
                    Ok(p) => p,
                    Err(_) => {
                        tracing::warn!(prefix = %parts[1], "invalid prefix length");
                        continue;
                    }
                };
    
                let netmask = prefix_to_netmask(prefix_len);
    
                tracing::debug!(%network, %netmask, "route add");
    
                let route_output = Command::new("route")
                    .args([
                        "add",
                        network,
                        "mask",
                        &netmask,
                        "0.0.0.0",
                        "IF",
                        &if_idx.to_string(),
                        "METRIC",
                        "1",
                    ])
                    .output()
                    .map_err(|e| format!("route add failed for {}: {}", ip_cidr, e))?;
    
                if !route_output.status.success() {
                    let err_msg = String::from_utf8_lossy(&route_output.stderr);
                    tracing::warn!(%ip_cidr, stderr = %err_msg, "route add failed (may already exist)");
                } else {
                    tracing::debug!(%ip_cidr, "route added");
                    if let Ok(mut routes) = ACTIVE_ROUTES.lock() {
                        routes.push((network.to_string(), netmask.clone()));
                    }
                }
            }
        }
       
    } else {
        tracing::warn!("no AllowedIPs in config; split tunnel routes skipped");
    }

    Ok("VPN connected successfully.".to_string())
}

fn wg_dump_first_peer(dump: &str) -> Option<(String, String)> {
    for line in dump.lines() {
        let cols: Vec<&str> = line.split('\t').collect();
        if cols.len() >= 8 {
            return Some((cols[0].to_string(), cols[3].to_string()));
        }
    }
    None
}

fn wg_allowed_covers_all_ipv4(allowed: &str) -> bool {
    allowed.split(',').any(|s| {
        matches!(s.trim(), "0.0.0.0/0" | "0.0.0.0/1" | "128.0.0.0/1")
    })
}

fn wg_merge_host32(existing: &str, host: &str) -> String {
    let entry = format!("{}/32", host);
    let trimmed = existing.trim();
    if trimmed.is_empty() || trimmed == "(none)" {
        return entry;
    }
    let mut parts: Vec<String> = trimmed
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    if !parts.iter().any(|p| p == &entry) {
        parts.push(entry);
    }
    parts.join(", ")
}

/// Ensures WireGuard will encapsulate traffic to `ip`, then adds a Windows /32 route via the tunnel.
pub async fn append_allowed_ip_and_route<R: Runtime>(
    app: &AppHandle<R>,
    ip: &str,
) -> Result<String, String> {
    let dump_out = app
        .shell()
        .sidecar("wg-tool")
        .map_err(|e| e.to_string())?
        .args(["show", INTERFACE_NAME, "dump"])
        .output()
        .await
        .map_err(|e| format!("wg-tool show dump failed: {}", e))?;

    if !dump_out.status.success() {
        let stderr = String::from_utf8_lossy(&dump_out.stderr);
        return Err(format!(
            "wg-tool show dump failed (is the tunnel up?): {}",
            stderr
        ));
    }

    let dump = String::from_utf8_lossy(&dump_out.stdout);
    let (pubkey, allowed) = wg_dump_first_peer(&dump).ok_or_else(|| {
        "WireGuard dump had no peer row; is the tunnel up and configured?"
            .to_string()
    })?;
    if pubkey.is_empty() {
        return Err("WireGuard peer public key missing in dump.".to_string());
    }
    if !wg_allowed_covers_all_ipv4(&allowed) {
        let merged = wg_merge_host32(&allowed, ip);
        if merged != allowed.trim() {
            let set_out = app
                .shell()
                .sidecar("wg-tool")
                .map_err(|e| e.to_string())?
                .args([
                    "set",
                    INTERFACE_NAME,
                    "peer",
                    &pubkey,
                    "allowed-ips",
                    &merged,
                ])
                .output()
                .await
                .map_err(|e| format!("wg-tool set allowed-ips failed: {}", e))?;

            if !set_out.status.success() {
                let stderr = String::from_utf8_lossy(&set_out.stderr);
                return Err(format!("wg-tool set allowed-ips: {}", stderr));
            }
            tracing::info!(target = %ip, "merged host into WireGuard AllowedIPs");
        }
    }

    add_route_to_vpn(ip)
}

/// Add a /32 route for a single IP through the VPN adapter (used by network monitor).
pub fn add_route_to_vpn(ip: &str) -> Result<String, String> {
    let if_index_output = Command::new("netsh")
        .args(["interface", "ipv4", "show", "interfaces"])
        .output()
        .map_err(|e| format!("failed to list interfaces: {}", e))?;

    let if_output_text = String::from_utf8_lossy(&if_index_output.stdout);
    let mut interface_idx = None;

    for line in if_output_text.lines() {
        if line.contains(INTERFACE_NAME) {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if !parts.is_empty() {
                if let Ok(idx) = parts[0].parse::<u32>() {
                    interface_idx = Some(idx);
                    break;
                }
            }
        }
    }

    let if_idx = interface_idx
        .ok_or("VPN interface not found; connect VPN first".to_string())?;

    let route_output = Command::new("route")
        .args([
            "add",
            ip,
            "mask",
            "255.255.255.255",
            "0.0.0.0",
            "IF",
            &if_idx.to_string(),
            "METRIC",
            "1",
        ])
        .output()
        .map_err(|e| format!("route add failed: {}", e))?;

    if !route_output.status.success() {
        let err_msg = String::from_utf8_lossy(&route_output.stderr);
        return Err(format!("route add failed: {}", err_msg));
    }

    Ok(format!("Added {} to VPN routes", ip))
}

#[tracing::instrument(level = "info")]
#[tauri::command]
pub fn disconnect_vpn() -> Result<String, String> {
    tracing::debug!("disconnecting VPN");
    crate::service_manager::stop_service()?;
    clean_vpn_routes();
    tracing::info!("VPN disconnected");
    Ok("VPN disconnected.".to_string())
}


fn clean_vpn_routes() {
    let routes = match ACTIVE_ROUTES.lock() {
        Ok(r) => r.clone(),
        Err(_) => return,
    };
    for (network, netmask) in &routes {
        let _ = Command::new("route")
            .args(["delete", network, "mask", netmask])
            .output();
        tracing::debug!(%network, "route deleted");
    }
    if let Ok(mut r) = ACTIVE_ROUTES.lock() {
        r.clear();
    }
}

fn prefix_to_netmask(prefix: u32) -> String {
    if prefix > 32 {
        return "255.255.255.255".to_string();
    }

    let mask: u32 = if prefix == 0 {
        0
    } else {
        0xFFFFFFFF << (32 - prefix)
    };

    format!(
        "{}.{}.{}.{}",
        (mask >> 24) & 0xFF,
        (mask >> 16) & 0xFF,
        (mask >> 8) & 0xFF,
        mask & 0xFF
    )
}
