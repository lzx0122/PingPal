import { ref } from "vue";
import { scalarMultBase } from "@stablelib/x25519";
import { encode } from "@stablelib/base64";
import { useAuth } from "./useAuth";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export interface VpnProfile {
  id: string;
  user_id: string;
  server_ip: string;
  device_name: string;
  public_key: string;
  allowed_ip: string;
  is_active: boolean;
  created_at: string;
}

export interface ServerInfo {
  ip: string;
  region: string;
  addedAt: string;
}

export function useVpnProfile() {
  const { getAuthHeaders } = useAuth();

  const profiles = ref<VpnProfile[]>([]);
  const servers = ref<ServerInfo[]>([]);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  // Generate WireGuard Key Pair (Base64 encoded)
  function generateKeys() {
    // Generate private key (32 bytes) using native crypto API
    const privateKeyBytes = new Uint8Array(32);
    crypto.getRandomValues(privateKeyBytes);

    // Clamp private key (standard for X25519/Curve25519)
    privateKeyBytes[0] &= 248;
    privateKeyBytes[31] &= 127;
    privateKeyBytes[31] |= 64;

    // Generate public key from private key
    const publicKeyBytes = scalarMultBase(privateKeyBytes);

    return {
      privateKey: encode(privateKeyBytes),
      publicKey: encode(publicKeyBytes),
    };
  }

  async function fetchServers() {
    isLoading.value = true;
    error.value = null;
    try {
      const response = await fetch(`${API_URL}/api/servers`, {
        headers: getAuthHeaders(),
      });
      if (response.status === 401) {
        useAuth().logout();
        throw new Error("Session expired. Please login again.");
      }
      if (!response.ok) throw new Error("Failed to fetch servers");
      servers.value = await response.json();
    } catch (e: any) {
      console.error("Fetch Servers Error:", e);
      error.value = e.message || "Unknown error";
    } finally {
      isLoading.value = false;
    }
  }

  async function fetchProfiles() {
    isLoading.value = true;
    error.value = null;
    try {
      const response = await fetch(`${API_URL}/api/vpn/profiles`, {
        headers: getAuthHeaders(),
      });
      if (response.status === 401) {
        useAuth().logout();
        throw new Error("Session expired. Please login again.");
      }
      if (!response.ok) throw new Error("Failed to fetch profiles");
      profiles.value = await response.json();
    } catch (e: any) {
      console.error("Fetch Profiles Error:", e);
      error.value = e.message || "Unknown error";
    } finally {
      isLoading.value = false;
    }
  }

  async function registerProfile(
    deviceName: string,
    _privateKey: string, // Not sent to server, caller should save this locally
    publicKey: string,
  ) {
    isLoading.value = true;
    error.value = null;
    try {
      const response = await fetch(`${API_URL}/api/vpn/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          publicKey,
          deviceName,
        }),
      });

      if (response.status === 401) {
        useAuth().logout();
        throw new Error("Session expired. Please login again.");
      }

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        console.error("Registration error response:", errData);
        throw new Error(errData.error || "Registration failed");
      }

      const result = await response.json();

      // Refresh profiles list
      await fetchProfiles();

      return result;
    } catch (e: any) {
      console.error("Register Profile Error:", e);
      error.value = e.message || "Unknown error";
      throw e;
    } finally {
      isLoading.value = false;
    }
  }

  async function connectToServer(profileId: string, serverIp: string) {
    isLoading.value = true;
    error.value = null;
    try {
      const response = await fetch(`${API_URL}/api/vpn/connect`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          profileId,
          serverIp,
        }),
      });

      if (response.status === 401) {
        useAuth().logout();
        throw new Error("Session expired. Please login again.");
      }

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Connection failed");
      }

      const result = await response.json();
      return result;
    } catch (e: any) {
      console.error("Connect to Server Error:", e);
      error.value = e.message || "Unknown error";
      throw e;
    } finally {
      isLoading.value = false;
    }
  }

  return {
    profiles,
    servers,
    isLoading,
    error,
    generateKeys,
    fetchServers,
    fetchProfiles,
    registerProfile,
    connectToServer,
  };
}
