import { invoke } from "@tauri-apps/api/core";

export const TAURI_CMD = {
  getDeviceName: "get_device_name",
  connectVpn: "connect_vpn",
  disconnectVpn: "disconnect_vpn",
  startMonitoring: "start_monitoring",
  stopMonitoring: "stop_monitoring",
  getDetectedServers: "get_detected_servers",
  getAllSessionIps: "get_all_session_ips",
  addDetectedIpToRoutes: "add_detected_ip_to_routes",
} as const;

export type DetectedServerPayload = {
  ip: string;
  port: number;
  protocol: string;
  send_rate: number;
  recv_rate: number;
  country: string | null;
  detected_at: string;
  is_game_server: boolean;
};

export function getDeviceName(): Promise<string> {
  return invoke<string>(TAURI_CMD.getDeviceName);
}

export function connectVpn(args: {
  configContent: string;
  ipv4Address: string;
}): Promise<string> {
  return invoke<string>(TAURI_CMD.connectVpn, args);
}

export function disconnectVpn(): Promise<string> {
  return invoke<string>(TAURI_CMD.disconnectVpn);
}

export function startMonitoring(args: {
  processName: string;
}): Promise<string> {
  return invoke<string>(TAURI_CMD.startMonitoring, args);
}

export function stopMonitoring(): Promise<string> {
  return invoke<string>(TAURI_CMD.stopMonitoring);
}

export function getDetectedServers(): Promise<DetectedServerPayload[]> {
  return invoke<DetectedServerPayload[]>(TAURI_CMD.getDetectedServers);
}

export function getAllSessionIps(): Promise<string[]> {
  return invoke<string[]>(TAURI_CMD.getAllSessionIps);
}

export function addDetectedIpToRoutes(ip: string): Promise<string> {
  return invoke<string>(TAURI_CMD.addDetectedIpToRoutes, { ip });
}
