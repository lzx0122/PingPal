//! Network monitoring module for detecting game server connections.
//!
//! This module provides functionality to monitor process-level network connections
//! on Windows using the IP Helper API. It can detect both TCP and UDP connections,
//! filter public IPs, and automatically identify game servers based on traffic patterns.
//!
//! For UDP game servers (like PUBG), it uses a raw socket sniffer to detect
//! remote endpoints since standard Windows APIs don't provide this for UDP.

use crate::error::{to_cmd_err, AppError};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::mem;
use std::net::Ipv4Addr;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::sync::Mutex as AsyncMonitorMutex;

// Configuration constants
const MONITORING_INTERVAL_SECS: u64 = 2;
const UDP_CACHE_TIMEOUT_SECS: u64 = 30;
const GEOIP_API_URL: &str = "http://ip-api.com/json/";
use windows::Win32::NetworkManagement::IpHelper::{
    GetExtendedUdpTable, MIB_UDPTABLE_OWNER_PID, UDP_TABLE_OWNER_PID,
};
use windows::Win32::Networking::WinSock::{
    bind, closesocket, ioctlsocket, recv, socket, WSAStartup, AF_INET, IPPROTO_IP, SEND_RECV_FLAGS,
    SIO_RCVALL, SOCKADDR, SOCKADDR_IN, SOCK_RAW, WSADATA,
};

/// Network connection information including protocol, endpoints, and traffic rates.

/// Detected server information with metadata for display and routing.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectedServer {
    pub ip: String,
    pub port: u16,
    pub protocol: String,
    pub send_rate: u64,
    pub recv_rate: u64,
    pub country: Option<String>,
    pub detected_at: String,
    /// True if UDP (actual game server), false if TCP (lobby server)
    pub is_game_server: bool,
}

/// Statistics for a detected UDP endpoint
#[derive(Debug, Clone)]
pub struct TrafficStats {
    pub last_seen: Instant,
    pub total_sent: u64,
    pub total_recv: u64,
}

impl Default for TrafficStats {
    fn default() -> Self {
        Self {
            last_seen: Instant::now(),
            total_sent: 0,
            total_recv: 0,
        }
    }
}

/// State for network monitoring.
///
/// Wrapped in [`tokio::sync::Mutex`] and managed via Tauri `State` in commands.
#[derive(Default)]
pub struct MonitorState {
    is_monitoring: bool,
    process_name: Option<String>,
    detected_servers: Vec<DetectedServer>,
    cancel_token: Option<tokio::sync::watch::Sender<bool>>,
    // Shared set of ports we are interested in (belonging to the game process)
    interesting_ports: Arc<Mutex<HashSet<u16>>>,
    // Cache of detected UDP remote endpoints from the sniffer with traffic stats
    udp_detected_cache: Arc<Mutex<HashMap<String, TrafficStats>>>,
    // Cache for IP location lookups: IP -> "City, Country"
    geo_cache: Arc<Mutex<HashMap<String, Option<String>>>>,
}

impl MonitorState {
    /// Create a new MonitorState instance.
    pub fn new() -> Self {
        Self::default()
    }
}

/// IPv4 Header structure for raw socket parsing
#[repr(C, packed)]
#[derive(Debug, Copy, Clone)]
struct Ipv4Header {
    version_ihl: u8,
    tos: u8,
    total_len: u16,
    id: u16,
    flags_frag_offset: u16,
    ttl: u8,
    protocol: u8,
    checksum: u16,
    src_addr: u32,
    dst_addr: u32,
}

/// UDP Header structure for raw socket parsing
#[repr(C, packed)]
#[derive(Debug, Copy, Clone)]
struct UdpHeader {
    src_port: u16,
    dst_port: u16,
    len: u16,
    checksum: u16,
}

/// Convert a u32 IP address (network byte order) to dotted-decimal string.
fn ip_to_string(ip: u32) -> String {
    let bytes = ip.to_ne_bytes();
    format!("{}.{}.{}.{}", bytes[0], bytes[1], bytes[2], bytes[3])
}

/// Convert a u32 port (network byte order) to host byte order u16.
///
/// Windows API stores ports as u32 but only uses the lower 16 bits.
fn port_to_host(port: u32) -> u16 {
    u16::from_be(port as u16)
}

/// Check if an IP address is public (not private/loopback/link-local).
fn is_public_ip(ip: &str) -> bool {
    if let Ok(addr) = ip.parse::<Ipv4Addr>() {
        let octets = addr.octets();

        // Exclude private ranges
        if octets[0] == 10
            || (octets[0] == 172 && (16..=31).contains(&octets[1]))
            || (octets[0] == 192 && octets[1] == 168)
            || octets[0] == 127
            || (octets[0] == 169 && octets[1] == 254)
            // Exclude multicast
            || (octets[0] >= 224 && octets[0] <= 239)
        {
            return false;
        }

        return true;
    }
    false
}

/// Find the local IP address that routes to the internet (e.g. Google DNS).
/// This helps us bind the raw socket to the correct interface.
fn get_local_ip() -> Option<Ipv4Addr> {
    let socket = std::net::UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    if let Ok(addr) = socket.local_addr() {
        if let std::net::SocketAddr::V4(addr_v4) = addr {
            return Some(*addr_v4.ip());
        }
    }
    None
}

/// Get all process IDs for a given process name using Windows tasklist.
fn get_all_process_ids(process_name: &str) -> Vec<u32> {
    use std::process::Command;

    let output = match Command::new("tasklist")
        .args([
            "/FI",
            &format!("IMAGENAME eq {}", process_name),
            "/FO",
            "CSV",
            "/NH",
        ])
        .output()
    {
        Ok(output) => output,
        Err(_) => return Vec::new(),
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut pids = Vec::new();

    for line in stdout.lines() {
        let parts: Vec<&str> = line.split(',').collect();
        if parts.len() >= 2 {
            let pid_str = parts[1].trim_matches('"');
            if let Ok(pid) = pid_str.parse::<u32>() {
                pids.push(pid);
            }
        }
    }

    pids
}

/// Find the most likely game process PID by checking which one has network connections.
fn find_game_process_pid(process_name: &str) -> Option<u32> {
    let pids = get_all_process_ids(process_name);

    if pids.is_empty() {
        tracing::debug!(process = %process_name, "no matching processes");
        return None;
    }

    tracing::debug!(count = pids.len(), process = %process_name, pids = ?pids, "process candidates");

    if pids.len() == 1 {
        tracing::debug!(pid = pids[0], "single process selected");
        return Some(pids[0]);
    }

    tracing::debug!("multiple processes, scoring by UDP ports");

    let mut best_pid = None;
    let mut max_connections = 0;

    for &pid in &pids {
        let udp_count = get_udp_ports(pid).len();
        let total = udp_count;

        tracing::debug!(pid, udp_ports = udp_count, "pid udp port count");

        if total > max_connections {
            max_connections = total;
            best_pid = Some(pid);
        }
    }

    // If no process has connections yet, just use the first one
    let selected_pid = best_pid.unwrap_or(pids[0]);

    if max_connections > 0 {
        tracing::debug!(
            selected_pid,
            max_connections,
            "selected pid by connection count"
        );
    } else {
        tracing::debug!(selected_pid, "no connections yet, defaulting to first pid");
    }

    Some(selected_pid)
}

/// Get UDP connections for a specific process ID using Windows API.
/// Note: This only returns local bindings.

/// Returns a set of local ports used by the given PID for UDP.
fn get_udp_ports(pid: u32) -> HashSet<u16> {
    let mut ports = HashSet::new();

    unsafe {
        let mut size: u32 = 0;
        // First call
        let _ = GetExtendedUdpTable(
            None,
            &mut size,
            false,
            AF_INET.0 as u32,
            UDP_TABLE_OWNER_PID,
            0,
        );

        if size == 0 {
            return ports;
        }

        let mut buffer = vec![0u8; size as usize];
        // Second call
        let result = GetExtendedUdpTable(
            Some(buffer.as_mut_ptr() as *mut _),
            &mut size,
            false,
            AF_INET.0 as u32,
            UDP_TABLE_OWNER_PID,
            0,
        );

        if result == 0 {
            let table = &*(buffer.as_ptr() as *const MIB_UDPTABLE_OWNER_PID);
            let entries =
                std::slice::from_raw_parts(table.table.as_ptr(), table.dwNumEntries as usize);

            for entry in entries {
                if entry.dwOwningPid == pid {
                    ports.insert(port_to_host(entry.dwLocalPort));
                }
            }
        }
    }
    ports
}

/// Structure for IP-API response
#[derive(Deserialize)]
struct GeoIpResponse {
    status: String,
    country: Option<String>,
    city: Option<String>,
}

/// Resolve IP location using ip-api.com
async fn resolve_ip_location(ip: &str) -> Option<String> {
    // Only query public IPs to avoid wasting quotas
    if !is_public_ip(ip) {
        return None;
    }

    let url = format!("{}{}", GEOIP_API_URL, ip);
    match reqwest::get(&url).await {
        Ok(resp) => {
            if let Ok(json) = resp.json::<GeoIpResponse>().await {
                if json.status == "success" {
                    let country = json.country.unwrap_or_default();
                    let city = json.city.unwrap_or_default();
                    if !country.is_empty() {
                        return Some(format!("{}, {}", city, country));
                    }
                }
            }
        }
        Err(e) => tracing::warn!(error = %e, "geoip lookup failed"),
    }
    None
}

/// Sniffer thread that captures all UDP traffic and filters for game ports.
fn start_sniffer(
    bind_ip: Ipv4Addr,
    interesting_ports: Arc<Mutex<HashSet<u16>>>,
    udp_cache: Arc<Mutex<HashMap<String, TrafficStats>>>,
    cancel_rx: tokio::sync::watch::Receiver<bool>,
) {
    tracing::debug!(%bind_ip, "sniffer starting");

    // Manual definition if missing from windows crate
    const RCVALL_ON: u32 = 1;

    unsafe {
        // Initialize Winsock
        let mut wsa_data: WSADATA = mem::zeroed();
        if WSAStartup(0x0202, &mut wsa_data) != 0 {
            tracing::warn!("winsock init failed");
            return;
        }

        // Create Raw Socket
        // socket() returns Result<SOCKET>
        let sock = match socket(AF_INET.0 as i32, SOCK_RAW, IPPROTO_IP.0) {
            Ok(s) => s,
            Err(e) => {
                tracing::warn!(error = %e, "raw socket create failed");
                return;
            }
        };

        // Bind to local interface
        let addr = SOCKADDR_IN {
            sin_family: AF_INET,
            sin_port: 0,
            sin_addr: windows::Win32::Networking::WinSock::IN_ADDR {
                S_un: windows::Win32::Networking::WinSock::IN_ADDR_0 {
                    S_addr: u32::from_ne_bytes(bind_ip.octets()),
                },
            },
            sin_zero: [0; 8],
        };

        // bind() returns i32
        if bind(
            sock,
            &addr as *const _ as *const SOCKADDR,
            std::mem::size_of::<SOCKADDR_IN>() as i32,
        ) != 0
        {
            tracing::warn!(
                code = windows::Win32::Networking::WinSock::WSAGetLastError().0,
                "raw socket bind failed"
            );
            let _ = closesocket(sock);
            return;
        }

        // Enable RCVALL (Promiscuous mode for this socket)
        let mut one: u32 = RCVALL_ON;

        // ioctlsocket returns i32
        if ioctlsocket(sock, SIO_RCVALL as i32, &mut one) != 0 {
            tracing::warn!(
                code = windows::Win32::Networking::WinSock::WSAGetLastError().0,
                "SIO_RCVALL failed"
            );
            let _ = closesocket(sock);
            return;
        }

        tracing::debug!("sniffer listening");

        let mut buffer = [0u8; 65536];

        loop {
            if *cancel_rx.borrow() {
                break;
            }

            // recv returns i32 (bytes read)
            let bytes_read = recv(sock, &mut buffer, SEND_RECV_FLAGS(0));

            if bytes_read > 0 {
                let len = bytes_read as usize;

                if len < mem::size_of::<Ipv4Header>() {
                    continue;
                }

                let ip_header = &*(buffer.as_ptr() as *const Ipv4Header);
                let ip_header_len = (ip_header.version_ihl & 0x0F) as usize * 4;

                if ip_header.protocol == 17 {
                    // UDP
                    if len < ip_header_len + mem::size_of::<UdpHeader>() {
                        continue;
                    }

                    let udp_header = &*(buffer.as_ptr().add(ip_header_len) as *const UdpHeader);
                    let src_port = u16::from_be(udp_header.src_port);
                    let dst_port = u16::from_be(udp_header.dst_port);
                    let payload_len = len - ip_header_len - mem::size_of::<UdpHeader>();

                    let src_ip = ip_to_string(ip_header.src_addr);
                    let dst_ip = ip_to_string(ip_header.dst_addr);

                    let ports = interesting_ports.lock().unwrap();

                    if ports.contains(&src_port) {
                        // Outgoing packet: Game (Src) -> Server (Dst)
                        if is_public_ip(&dst_ip) {
                            let key = format!("{}:{}", dst_ip, dst_port);
                            let mut cache = udp_cache.lock().unwrap();
                            let entry = cache.entry(key).or_default();
                            entry.last_seen = Instant::now();
                            entry.total_sent += payload_len as u64;
                            // We count packet details + headers or just payload?
                            // Usually "network traffic" includes headers, but len here is total bytes read.
                            // Let's count total bytes read on wire (len) for accuracy of "bandwidth".
                            // entry.total_sent += len as u64; // Wait, len includes IP header. Correct.
                        }
                    } else if ports.contains(&dst_port) {
                        // Incoming packet: Server (Src) -> Game (Dst)
                        if is_public_ip(&src_ip) {
                            let key = format!("{}:{}", src_ip, src_port);
                            let mut cache = udp_cache.lock().unwrap();
                            let entry = cache.entry(key).or_default();
                            entry.last_seen = Instant::now();
                            entry.total_recv += len as u64; // Count full packet size
                        }
                    }
                }
            }
        }

        let _ = closesocket(sock);
    }
}

/// Background monitoring loop that checks process connections periodically.
async fn monitoring_loop(
    process_name: String,
    mut cancel_rx: tokio::sync::watch::Receiver<bool>,
    state: Arc<AsyncMonitorMutex<MonitorState>>,
) {
    let mut interval = tokio::time::interval(Duration::from_secs(MONITORING_INTERVAL_SECS));

    // Store previous traffic stats to calculate rate: key -> (total_sent, total_recv)
    let mut prev_stats: HashMap<String, (u64, u64)> = HashMap::new();
    let mut last_check = Instant::now();

    // Attempt to find local IP for sniffing
    let local_ip = get_local_ip();
    if let Some(ip) = local_ip {
        tracing::debug!(%ip, "local interface for sniffer");

        // Clone state for sniffer thread
        let (interesting_ports, udp_cache) = {
            let guard = state.lock().await;
            (
                guard.interesting_ports.clone(),
                guard.udp_detected_cache.clone(),
            )
        };
        let sniffer_cancel = cancel_rx.clone();

        use std::thread;
        // Run sniffer in a separate OS thread (recv is blocking)
        thread::spawn(move || {
            start_sniffer(ip, interesting_ports, udp_cache, sniffer_cancel);
        });
    } else {
        tracing::warn!("could not determine local IP; UDP sniffing disabled");
    }

    loop {
        tokio::select! {
            _ = interval.tick() => {
                if *cancel_rx.borrow() {
                    break;
                }

                let now = Instant::now();
                let time_diff = now.duration_since(last_check).as_secs_f64();
                last_check = now;

                // Get process ID - select the one with network activity
                if let Some(pid) = find_game_process_pid(&process_name) {
                    // Get UDP ports bound by the process (standard API)
                    let udp_ports = get_udp_ports(pid);

                    // Pre-fetch Arcs to avoid holding state lock
                    let (interesting_ports_arc, udp_detected_cache_arc, geo_cache_arc) = {
                        let guard = state.lock().await;
                        (
                            guard.interesting_ports.clone(),
                            guard.udp_detected_cache.clone(),
                            guard.geo_cache.clone(),
                        )
                    };

                    // Update interesting ports for the sniffer to filter
                    {
                        let mut ports_lock = interesting_ports_arc.lock().unwrap();
                        ports_lock.clear();
                        ports_lock.extend(udp_ports.iter());
                    }

                    // Collect detected servers
                    let mut detected = Vec::new();

                    // 2. Add UDP connections from sniffer cache
                    {
                        let mut cache_lock = udp_detected_cache_arc.lock().unwrap();
                        // Remove old entries (> 30 seconds inactivity)
                        cache_lock.retain(|_, stats| stats.last_seen.elapsed() < Duration::from_secs(UDP_CACHE_TIMEOUT_SECS));

                        for (key, stats) in cache_lock.iter() {
                            let parts: Vec<&str> = key.split(':').collect();
                            if parts.len() == 2 {
                                let ip = parts[0].to_string();
                                let port = parts[1].parse().unwrap_or(0);

                                // Calculate rates
                                let (prev_sent, prev_recv) = prev_stats.get(key).unwrap_or(&(0, 0));

                                // Handle counter restart or first seen
                                let sent_diff = if stats.total_sent >= *prev_sent { stats.total_sent - *prev_sent } else { stats.total_sent };
                                let recv_diff = if stats.total_recv >= *prev_recv { stats.total_recv - *prev_recv } else { stats.total_recv };

                                let send_rate = (sent_diff as f64 / time_diff) as u64;
                                let recv_rate = (recv_diff as f64 / time_diff) as u64;

                                // Update previous stats
                                prev_stats.insert(key.clone(), (stats.total_sent, stats.total_recv));

                                detected.push(DetectedServer {
                                    ip: ip.clone(),
                                    port,
                                    protocol: "UDP".to_string(),
                                    send_rate,
                                    recv_rate,
                                    country: {
                                        geo_cache_arc.lock().unwrap().get(&ip).cloned().flatten()
                                    },
                                    detected_at: chrono::Local::now().to_rfc3339(),
                                    is_game_server: true,
                                });
                                tracing::trace!(%ip, port, send_rate, recv_rate, "udp endpoint rates");
                            }
                        }
                    }

                    // Update global state
                    {
                        let mut st = state.lock().await;
                        st.detected_servers = detected.clone();
                    }

                    // Trigger GeoIP lookups
                    let geo_cache = state.lock().await.geo_cache.clone();

                    for server in detected {
                        if !is_public_ip(&server.ip) { continue; }
                        let ip = server.ip.clone();

                        // GeoIP
                        let should_lookup_geo = {
                            let cache = geo_cache.lock().unwrap();
                            !cache.contains_key(&server.ip)
                        };
                        if should_lookup_geo {
                           let cache_clone = geo_cache.clone();
                           let ip_clone = ip.clone();
                           tokio::spawn(async move {
                               if let Some(loc) = resolve_ip_location(&ip_clone).await {
                                   cache_clone.lock().unwrap().insert(ip_clone, Some(loc));
                               } else {
                                   cache_clone.lock().unwrap().insert(ip_clone, None);
                               }
                           });
                        }
                    }
                } else {
                    tracing::debug!(process = %process_name, "process not found this tick");
                }
            }
            _ = cancel_rx.changed() => {
                if *cancel_rx.borrow() {
                    break;
                }
            }
        }
    }

    tracing::debug!("monitoring loop stopped");
}

/// Start monitoring network connections for a specific process.
///
/// # Errors
///
/// Returns an error if:
/// - Already monitoring another process
/// - The target process cannot be found
/// - Failed to acquire state lock
#[tauri::command]
pub async fn start_monitoring(
    process_name: String,
    state: tauri::State<'_, Arc<AsyncMonitorMutex<MonitorState>>>,
) -> Result<String, String> {
    let mut monitor_state = state.lock().await;

    if monitor_state.is_monitoring {
        return Err(to_cmd_err(AppError::AlreadyMonitoring));
    }

    if find_game_process_pid(&process_name).is_none() {
        return Err(to_cmd_err(AppError::ProcessNotFound(process_name.clone())));
    }

    let (cancel_tx, cancel_rx) = tokio::sync::watch::channel(false);

    monitor_state.is_monitoring = true;
    monitor_state.process_name = Some(process_name.clone());
    monitor_state.cancel_token = Some(cancel_tx);
    monitor_state.detected_servers.clear();
    monitor_state.interesting_ports = Arc::new(Mutex::new(HashSet::new()));
    monitor_state.udp_detected_cache = Arc::new(Mutex::new(HashMap::new()));
    monitor_state.geo_cache = Arc::new(Mutex::new(HashMap::new()));

    let state_clone = Arc::clone(&state.inner());

    drop(monitor_state); // Release lock before spawning

    // Spawn monitoring task
    tokio::spawn(async move {
        monitoring_loop(process_name, cancel_rx, state_clone).await;
    });

    Ok("Monitoring started successfully".to_string())
}

/// Get the list of detected servers from the monitoring session.
///
/// # Errors
///
/// Returns an error if the state lock cannot be acquired.
#[tauri::command]
pub async fn get_detected_servers(
    state: tauri::State<'_, Arc<AsyncMonitorMutex<MonitorState>>>,
) -> Result<Vec<DetectedServer>, String> {
    let monitor_state = state.lock().await;
    Ok(monitor_state.detected_servers.clone())
}

/// Stop the active monitoring session.
///
/// # Errors
///
/// Returns an error if:
/// - No monitoring session is active
/// - Failed to acquire state lock
#[tauri::command]
pub async fn stop_monitoring(
    state: tauri::State<'_, Arc<AsyncMonitorMutex<MonitorState>>>,
) -> Result<String, String> {
    let mut monitor_state = state.lock().await;

    if !monitor_state.is_monitoring {
        return Err(to_cmd_err(AppError::NoActiveMonitoring));
    }

    if let Some(cancel_tx) = &monitor_state.cancel_token {
        let _ = cancel_tx.send(true);
    }

    monitor_state.is_monitoring = false;
    monitor_state.process_name = None;
    monitor_state.cancel_token = None;

    Ok("Monitoring stopped successfully".to_string())
}

/// Add a detected server IP to VPN routing table.
///
/// # Errors
///
/// Returns an error if:
/// - IP address is invalid or private
/// - Failed to add route (see `vpn::add_route_to_vpn` for details)
#[tauri::command]
pub fn add_detected_ip_to_routes(ip: String) -> Result<String, String> {
    if !is_public_ip(&ip) {
        return Err(to_cmd_err(AppError::Msg(format!(
            "invalid or private IP address: {}",
            ip
        ))));
    }
    crate::vpn::add_route_to_vpn(&ip).map_err(|e| to_cmd_err(AppError::Msg(e)))
}
