use crate::error::{to_cmd_err, AppError};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::mem;
use std::net::Ipv4Addr;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::sync::Mutex as AsyncMonitorMutex;

const MONITORING_INTERVAL_SECS: u64 = 2;
const UDP_CACHE_TIMEOUT_SECS: u64 = 30;
const GEOIP_API_URL: &str = "http://ip-api.com/json/";
const SNIFFER_RECV_TIMEOUT_MS: u32 = 500;

use windows::Win32::NetworkManagement::IpHelper::{
    GetExtendedTcpTable, GetExtendedUdpTable, MIB_TCP_STATE_ESTAB, MIB_TCPTABLE_OWNER_PID,
    MIB_UDPTABLE_OWNER_PID, TCP_TABLE_OWNER_PID_ALL, UDP_TABLE_OWNER_PID,
};
use windows::Win32::Networking::WinSock::{
    bind, closesocket, ioctlsocket, recv, setsockopt, socket, WSAStartup, AF_INET, IPPROTO_IP,
    SEND_RECV_FLAGS, SIO_RCVALL, SO_RCVTIMEO, SOCKADDR, SOCKADDR_IN, SOL_SOCKET, SOCK_RAW,
    WSADATA,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectedServer {
    pub ip: String,
    pub port: u16,
    pub protocol: String,
    pub send_rate: u64,
    pub recv_rate: u64,
    pub country: Option<String>,
    pub detected_at: String,
    pub is_game_server: bool,
}

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

pub struct MonitorState {
    is_monitoring: bool,
    process_name: Option<String>,
    detected_servers: Vec<DetectedServer>,
    tcp_session_ips: HashMap<String, Instant>,
    cancel_token: Option<tokio::sync::watch::Sender<bool>>,
    interesting_ports: Arc<Mutex<HashSet<u16>>>,
    udp_detected_cache: Arc<Mutex<HashMap<String, TrafficStats>>>,
    geo_cache: Arc<Mutex<HashMap<String, Option<String>>>>,
}

impl Default for MonitorState {
    fn default() -> Self {
        Self {
            is_monitoring: false,
            process_name: None,
            detected_servers: Vec::new(),
            tcp_session_ips: HashMap::new(),
            cancel_token: None,
            interesting_ports: Arc::new(Mutex::new(HashSet::new())),
            udp_detected_cache: Arc::new(Mutex::new(HashMap::new())),
            geo_cache: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

impl MonitorState {
    pub fn new() -> Self {
        Self::default()
    }
}

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

#[repr(C, packed)]
#[derive(Debug, Copy, Clone)]
struct UdpHeader {
    src_port: u16,
    dst_port: u16,
    len: u16,
    checksum: u16,
}

fn ip_to_string(ip: u32) -> String {
    let bytes = ip.to_ne_bytes();
    format!("{}.{}.{}.{}", bytes[0], bytes[1], bytes[2], bytes[3])
}

fn port_to_host(port: u32) -> u16 {
    u16::from_be(port as u16)
}

fn is_public_ip(ip: &str) -> bool {
    if let Ok(addr) = ip.parse::<Ipv4Addr>() {
        let octets = addr.octets();

        if octets[0] == 10
            || (octets[0] == 172 && (16..=31).contains(&octets[1]))
            || (octets[0] == 192 && octets[1] == 168)
            || octets[0] == 127
            || (octets[0] == 169 && octets[1] == 254)
            || (octets[0] >= 224 && octets[0] <= 239)
        {
            return false;
        }

        return true;
    }
    false
}

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

fn is_safe_process_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 260
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-' | ' '))
}

fn get_all_process_ids(process_name: &str) -> Vec<u32> {
    use std::process::Command;

    if !is_safe_process_name(process_name) {
        tracing::warn!(process = %process_name, "rejected unsafe process name");
        return Vec::new();
    }

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

fn get_udp_ports(pid: u32) -> HashSet<u16> {
    let mut ports = HashSet::new();

    unsafe {
        let mut size: u32 = 0;
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

const TCP_IP_TIMEOUT_SECS: u64 = 120;
const ERROR_INSUFFICIENT_BUFFER: u32 = 122;

fn get_tcp_remote_ips(pid: u32) -> HashSet<String> {
    let mut ips = HashSet::new();

    unsafe {
        let mut size: u32 = 0;
        let mut buffer: Vec<u8> = Vec::new();

        loop {
            let result = GetExtendedTcpTable(
                if buffer.is_empty() { None } else { Some(buffer.as_mut_ptr() as *mut _) },
                &mut size,
                false,
                AF_INET.0 as u32,
                TCP_TABLE_OWNER_PID_ALL,
                0,
            );

            if result == ERROR_INSUFFICIENT_BUFFER || buffer.is_empty() {
                if size == 0 { return ips; }
                buffer.resize(size as usize, 0);
                continue;
            }

            if result != 0 { return ips; }

            let table = &*(buffer.as_ptr() as *const MIB_TCPTABLE_OWNER_PID);
            let entries =
                std::slice::from_raw_parts(table.table.as_ptr(), table.dwNumEntries as usize);

            for entry in entries {
                if entry.dwOwningPid == pid && entry.dwState == MIB_TCP_STATE_ESTAB.0 as u32 {
                    let remote_ip = ip_to_string(entry.dwRemoteAddr);
                    if is_public_ip(&remote_ip) {
                        ips.insert(remote_ip);
                    }
                }
            }
            break;
        }
    }
    ips
}

#[derive(Deserialize)]
struct GeoIpResponse {
    status: String,
    country: Option<String>,
    city: Option<String>,
}

async fn resolve_ip_location(ip: &str) -> Option<String> {
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

fn start_sniffer(
    bind_ip: Ipv4Addr,
    interesting_ports: Arc<Mutex<HashSet<u16>>>,
    udp_cache: Arc<Mutex<HashMap<String, TrafficStats>>>,
    cancel_rx: tokio::sync::watch::Receiver<bool>,
) {
    tracing::debug!(%bind_ip, "sniffer starting");

    const RCVALL_ON: u32 = 1;

    unsafe {
        let mut wsa_data: WSADATA = mem::zeroed();
        if WSAStartup(0x0202, &mut wsa_data) != 0 {
            tracing::warn!("winsock init failed");
            return;
        }

        let sock = match socket(AF_INET.0 as i32, SOCK_RAW, IPPROTO_IP.0) {
            Ok(s) => s,
            Err(e) => {
                tracing::warn!(error = %e, "raw socket create failed");
                return;
            }
        };

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

        let mut one: u32 = RCVALL_ON;

        if ioctlsocket(sock, SIO_RCVALL as i32, &mut one) != 0 {
            tracing::warn!(
                code = windows::Win32::Networking::WinSock::WSAGetLastError().0,
                "SIO_RCVALL failed"
            );
            let _ = closesocket(sock);
            return;
        }

        let timeout_ms = SNIFFER_RECV_TIMEOUT_MS;
        if setsockopt(
            sock,
            SOL_SOCKET as i32,
            SO_RCVTIMEO as i32,
            Some(std::slice::from_raw_parts(
                &timeout_ms as *const u32 as *const u8,
                std::mem::size_of::<u32>(),
            )),
        ) != 0
        {
            tracing::warn!(
                code = windows::Win32::Networking::WinSock::WSAGetLastError().0,
                "SO_RCVTIMEO failed; cancel signal may be delayed"
            );
        }

        tracing::debug!("sniffer listening");

        let mut buffer = [0u8; 65536];

        loop {
            if *cancel_rx.borrow() {
                break;
            }

            let bytes_read = recv(sock, &mut buffer, SEND_RECV_FLAGS(0));

            if bytes_read > 0 {
                let len = bytes_read as usize;

                if len < mem::size_of::<Ipv4Header>() {
                    continue;
                }

                let ip_header = &*(buffer.as_ptr() as *const Ipv4Header);
                let ip_header_len = (ip_header.version_ihl & 0x0F) as usize * 4;

                if ip_header.protocol == 17 {
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
                        if is_public_ip(&dst_ip) {
                            let key = format!("{}:{}", dst_ip, dst_port);
                            let mut cache = udp_cache.lock().unwrap();
                            let entry = cache.entry(key).or_default();
                            entry.last_seen = Instant::now();
                            entry.total_sent += payload_len as u64;
                        }
                    } else if ports.contains(&dst_port) {
                        if is_public_ip(&src_ip) {
                            let key = format!("{}:{}", src_ip, src_port);
                            let mut cache = udp_cache.lock().unwrap();
                            let entry = cache.entry(key).or_default();
                            entry.last_seen = Instant::now();
                            entry.total_recv += payload_len as u64;
                        }
                    }
                }
            }
        }

        let _ = closesocket(sock);
    }
}


#[tracing::instrument(level = "debug", skip(cancel_rx, state), fields(process_name = %process_name))]
async fn monitoring_loop(
    process_name: String,
    mut cancel_rx: tokio::sync::watch::Receiver<bool>,
    state: Arc<AsyncMonitorMutex<MonitorState>>,
) {
    let mut interval = tokio::time::interval(Duration::from_secs(MONITORING_INTERVAL_SECS));

    let mut prev_stats: HashMap<String, (u64, u64)> = HashMap::new();
    let mut last_check = Instant::now();

    let local_ip = get_local_ip();
    if let Some(ip) = local_ip {
        tracing::debug!(%ip, "local interface for sniffer");

        let (interesting_ports, udp_cache) = {
            let guard = state.lock().await;
            (
                guard.interesting_ports.clone(),
                guard.udp_detected_cache.clone(),
            )
        };
        let sniffer_cancel = cancel_rx.clone();

        use std::thread;
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

                if let Some(pid) = find_game_process_pid(&process_name) {
                    let udp_ports = get_udp_ports(pid);
                    let tcp_ips = get_tcp_remote_ips(pid);

                    let (interesting_ports_arc, udp_detected_cache_arc, geo_cache_arc) = {
                        let mut guard = state.lock().await;
                        let now = Instant::now();
                        for ip in &tcp_ips {
                            guard.tcp_session_ips.insert(ip.clone(), now);
                        }
                        guard.tcp_session_ips.retain(|_, last_seen| {
                            last_seen.elapsed() < Duration::from_secs(TCP_IP_TIMEOUT_SECS)
                        });
                        (
                            guard.interesting_ports.clone(),
                            guard.udp_detected_cache.clone(),
                            guard.geo_cache.clone(),
                        )
                    };

                    {
                        let mut ports_lock = interesting_ports_arc.lock().unwrap();
                        ports_lock.clear();
                        ports_lock.extend(udp_ports.iter());
                    }

                    let mut detected = Vec::new();

                    {
                        let mut cache_lock = udp_detected_cache_arc.lock().unwrap();
                        cache_lock.retain(|_, stats| stats.last_seen.elapsed() < Duration::from_secs(UDP_CACHE_TIMEOUT_SECS));

                        for (key, stats) in cache_lock.iter() {
                            let parts: Vec<&str> = key.split(':').collect();
                            if parts.len() == 2 {
                                let ip = parts[0].to_string();
                                let port = parts[1].parse().unwrap_or(0);

                                let (prev_sent, prev_recv) = prev_stats.get(key).unwrap_or(&(0, 0));

                                let sent_diff = if stats.total_sent >= *prev_sent { stats.total_sent - *prev_sent } else { stats.total_sent };
                                let recv_diff = if stats.total_recv >= *prev_recv { stats.total_recv - *prev_recv } else { stats.total_recv };

                                let send_rate = (sent_diff as f64 / time_diff) as u64;
                                let recv_rate = (recv_diff as f64 / time_diff) as u64;

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

                    let geo_cache = {
                        let mut st = state.lock().await;
                        st.detected_servers = detected.clone();
                        st.geo_cache.clone()
                    };

                    for server in detected {
                        if !is_public_ip(&server.ip) {
                            continue;
                        }

                        let should_spawn = {
                            let mut cache = geo_cache.lock().unwrap();
                            if cache.contains_key(&server.ip) {
                                false
                            } else {
                                cache.insert(server.ip.clone(), None);
                                true
                            }
                        };

                        if should_spawn {
                            let cache_clone = geo_cache.clone();
                            let ip_clone = server.ip.clone();
                            tokio::spawn(async move {
                                let loc = resolve_ip_location(&ip_clone).await;
                                cache_clone.lock().unwrap().insert(ip_clone, loc);
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

#[tracing::instrument(level = "info", skip(state), fields(process_name = %process_name))]
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
    monitor_state.tcp_session_ips.clear();
    monitor_state.interesting_ports = Arc::new(Mutex::new(HashSet::new()));
    monitor_state.udp_detected_cache = Arc::new(Mutex::new(HashMap::new()));
    monitor_state.geo_cache = Arc::new(Mutex::new(HashMap::new()));

    let state_clone = Arc::clone(&state.inner());

    drop(monitor_state);

    tokio::spawn(async move {
        monitoring_loop(process_name, cancel_rx, state_clone).await;
    });

    Ok("Monitoring started successfully".to_string())
}

#[tracing::instrument(level = "debug", skip(state))]
#[tauri::command]
pub async fn get_detected_servers(
    state: tauri::State<'_, Arc<AsyncMonitorMutex<MonitorState>>>,
) -> Result<Vec<DetectedServer>, String> {
    let monitor_state = state.lock().await;
    Ok(monitor_state.detected_servers.clone())
}

#[tracing::instrument(level = "info", skip(state))]
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

#[tracing::instrument(level = "debug", skip(state))]
#[tauri::command]
pub async fn get_all_session_ips(
    state: tauri::State<'_, Arc<AsyncMonitorMutex<MonitorState>>>,
) -> Result<Vec<String>, String> {
    let monitor_state = state.lock().await;
    let mut ips: HashSet<String> = monitor_state
        .detected_servers
        .iter()
        .filter(|s| s.is_game_server)
        .map(|s| s.ip.clone())
        .collect();
    for ip in monitor_state.tcp_session_ips.keys() {
        ips.insert(ip.clone());
    }
    Ok(ips.into_iter().collect())
}

#[tracing::instrument(level = "info", skip(app), fields(ip = %ip))]
#[tauri::command]
pub async fn add_detected_ip_to_routes(
    app: tauri::AppHandle,
    ip: String,
) -> Result<String, String> {
    if !is_public_ip(&ip) {
        return Err(to_cmd_err(AppError::Msg(format!(
            "invalid or private IP address: {}",
            ip
        ))));
    }
    crate::vpn::append_allowed_ip_and_route(&app, &ip)
        .await
        .map_err(|e| to_cmd_err(AppError::Msg(e)))
}
