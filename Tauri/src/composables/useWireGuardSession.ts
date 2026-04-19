import { ref } from "vue";
import { connectVpn, disconnectVpn } from "@/lib/tauriCommands";
import { useVpnStore } from "@/stores/vpnStore";
import { useVpnProfile } from "@/composables/useVpnProfile";
import { apiFetch } from "@/lib/apiClient";
import type { Server } from "@/data/games";

const status = ref("Ready");
const isConnected = ref(false);
const isLoading = ref(false);
const currentPing = ref(0);
const gameIpRanges = ref<string[]>([]);
const currentGameId = ref<string | null>(null);
const UDP_DYNAMIC_ONLY_GAMES = new Set<string>();
const FULL_TUNNEL_TEST_GAMES = new Set<string>();

export function useWireGuardSession() {
  const vpnStore = useVpnStore();
  const { connectToServer } = useVpnProfile();

  async function fetchGameRanges(gameId: string) {
    currentGameId.value = gameId;
    try {
      const response = await apiFetch(`/api/games/${gameId}/ranges`);
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      const ranges = (await response.json()) as string[];
      gameIpRanges.value = [...new Set(ranges)];
    } catch (error) {
      console.error(`Failed to fetch IP ranges for ${gameId}:`, error);
    }
  }

  function getWgConfig(serverConfig: {
    assigned_ip: string;
    server_public_key: string;
    server_endpoint: string;
  }) {
    const cfg = vpnStore.getVpnConfig();
    if (!cfg.privateKey) {
      throw new Error("No VPN configuration found. Please register first.");
    }

    const gameId = currentGameId.value ?? "";
    const useFullTunnelTest = FULL_TUNNEL_TEST_GAMES.has(gameId);
    const useUdpDynamicOnly = UDP_DYNAMIC_ONLY_GAMES.has(gameId);
    const effectiveRanges = [...new Set(gameIpRanges.value)];
    const routeIps = "0.0.0.0/0";
    const dnsLine = "DNS = 1.1.1.1\n";

    //     const routeIps = useFullTunnelTest
    //   ? "0.0.0.0/0"
    //   : useUdpDynamicOnly
    //     ? "10.0.0.0/24"
    //     : effectiveRanges.join(", ") || "10.0.0.0/24";
    // const dnsLine = useFullTunnelTest ? "DNS = 1.1.1.1\n" : "";
    return `
[Interface]
PrivateKey = ${cfg.privateKey}
Address = ${serverConfig.assigned_ip}
${dnsLine}MTU = 1280

[Peer]
PublicKey = ${serverConfig.server_public_key}
AllowedIPs = ${routeIps}
Endpoint = ${serverConfig.server_endpoint}
PersistentKeepalive = 25
`;
  }

  async function connect(selectedServer: Server) {
    const cfg = vpnStore.getVpnConfig();
    if (!cfg.profileId) {
      status.value = "Please register a VPN profile first.";
      return;
    }

    isLoading.value = true;
    status.value = "Connecting...";

    try {
      const serverConfig = await connectToServer(
        cfg.profileId,
        selectedServer.endpoint.split(":")[0],
      );

      const configContent = getWgConfig(serverConfig);
      const ipv4 = serverConfig.assigned_ip.split("/")[0];

      await connectVpn({
        configContent,
        ipv4Address: ipv4,
      });

      if (cfg.profileId && cfg.privateKey) {
        await vpnStore.saveConfig(
          cfg.profileId,
          cfg.privateKey,
          serverConfig.server_endpoint,
          serverConfig.assigned_ip,
        );
      }

      status.value = `Connected - ${serverConfig.server_endpoint}`;
      isConnected.value = true;
      currentPing.value = Math.floor(Math.random() * 10) + 20;
    } catch (error) {
      console.error(error);
      status.value = "Connection failed: " + error;
    } finally {
      isLoading.value = false;
    }
  }

  async function disconnect() {
    isLoading.value = true;
    status.value = "Disconnecting...";

    try {
      await disconnectVpn();
      status.value = "Ready";
      isConnected.value = false;
      currentPing.value = 0;
    } catch (error) {
      status.value = "Disconnect failed: " + error;
    } finally {
      isLoading.value = false;
    }
  }

  return {
    status,
    isConnected,
    isLoading,
    currentPing,
    gameIpRanges,
    fetchGameRanges,
    connect,
    disconnect,
  };
}
