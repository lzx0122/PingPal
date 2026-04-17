import { onUnmounted, ref } from "vue";
import { apiFetch } from "@/lib/apiClient";
import { useTrafficMonitorStore } from "@/stores/trafficMonitorStore";
import {
  addDetectedIpToRoutes,
  getDetectedServers,
  startMonitoring as tauriStartMonitoring,
  stopMonitoring as tauriStopMonitoring,
  type DetectedServerPayload,
} from "@/lib/tauriCommands";

type MonitorStatusType = "info" | "success" | "error";
type MonitorActivityType = "info" | "success";

type UseGameTrafficMonitorOptions = {
  getProcessName: () => string;
  getGameId?: () => string | undefined;
  getKnownRanges?: () => Set<string> | undefined;
  onNewRangeDetected?: (ip: string) => void;
  pollIntervalMs?: number;
};

const startMonitorTimeoutMs = 15000;
const ipv4Regex =
  /^(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)$/;

function parseRange(value: string): { ip: string; prefix: number | null } | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parts = trimmed.split("/");
  if (parts.length > 2) return null;

  const [ip, prefixRaw] = parts;
  if (!ip || !ipv4Regex.test(ip)) return null;

  if (prefixRaw === undefined) {
    return { ip, prefix: null };
  }

  const prefix = Number(prefixRaw);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
    return null;
  }

  return { ip, prefix };
}

function getRangeKeys(value: string): { routeKey: string; postRange: string } | null {
  const parsed = parseRange(value);
  if (!parsed) return null;

  if (parsed.prefix === null) {
    return {
      routeKey: parsed.ip,
      postRange: `${parsed.ip}/32`,
    };
  }

  return {
    routeKey: parsed.prefix === 32 ? parsed.ip : `${parsed.ip}/${parsed.prefix}`,
    postRange: `${parsed.ip}/${parsed.prefix}`,
  };
}

export function useGameTrafficMonitor(options: UseGameTrafficMonitorOptions) {
  const trafficMonitorStore = useTrafficMonitorStore();
  const localOwnerId = trafficMonitorStore.nextOwnerId();
  const isMonitoring = ref(false);
  const isLoading = ref(false);
  const detectedServers = ref<DetectedServerPayload[]>([]);
  const statusMessage = ref("");
  const statusType = ref<MonitorStatusType>("info");
  const activityMessage = ref("");
  const activityType = ref<MonitorActivityType>("info");
  const addingRoute = ref<string | null>(null);

  const autoRoutedIps = ref(new Set<string>());
  const autoRoutingIps = ref(new Set<string>());
  const autoPostedRanges = ref(new Set<string>());
  const autoPostingRanges = ref(new Set<string>());

  const intervalMs = options.pollIntervalMs ?? 2000;
  let pollInterval: number | null = null;

  function parseErrorMessage(error: unknown): string {
    if (typeof error === "string") return error;
    if (error instanceof Error) return error.message;
    return String(error);
  }

  function isAlreadyMonitoringError(error: unknown): boolean {
    const message = parseErrorMessage(error).toLowerCase();
    return message.includes("already monitoring");
  }

  function isNoActiveMonitoringError(error: unknown): boolean {
    const message = parseErrorMessage(error).toLowerCase();
    return message.includes("no active monitoring");
  }

  function clearPollingTimer() {
    if (pollInterval !== null) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  }

  function setActivity(message: string, type: MonitorActivityType = "info") {
    activityMessage.value = message;
    activityType.value = type;
  }

  function applyLocalStoppedState() {
    isMonitoring.value = false;
    clearPollingTimer();
    detectedServers.value = [];
    autoRoutingIps.value.clear();
    autoPostingRanges.value.clear();
  }

  async function beginLocalMonitoringSession() {
    isMonitoring.value = true;
    statusMessage.value = "Scanning...";
    statusType.value = "info";
    setActivity("Monitoring active", "info");
    clearPollingTimer();
    pollInterval = window.setInterval(fetchServers, intervalMs);
    await fetchServers();
  }

  function getKnownRanges() {
    return options.getKnownRanges?.() ?? new Set<string>();
  }

  function initializeAutoCaches() {
    const knownRanges = getKnownRanges();
    autoRoutedIps.value = new Set<string>();
    autoPostedRanges.value = new Set<string>();
    autoRoutingIps.value.clear();
    autoPostingRanges.value.clear();

    knownRanges.forEach((value) => {
      const keys = getRangeKeys(value);
      if (!keys) return;
      autoPostedRanges.value.add(keys.postRange);
      autoRoutedIps.value.add(keys.routeKey);
    });
  }

  function queueAutoPostRange(ip: string) {
    const gameId = options.getGameId?.();
    if (!gameId) return;

    const keys = getRangeKeys(ip);
    if (!keys) return;

    const ipRange = keys.postRange;
    if (autoPostedRanges.value.has(ipRange)) return;
    if (autoPostingRanges.value.has(ipRange)) return;

    autoPostingRanges.value.add(ipRange);
    void apiFetch(`/api/vpn/games/${gameId}/ranges/learn`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ipRange }),
    })
      .then(async (response) => {
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || `HTTP ${response.status}`);
        }
        setActivity(`Learned: ${ipRange}`, "success");
        console.log(`[TrafficMonitor] Learned range persisted: ${ipRange}`);
        autoPostedRanges.value.add(ipRange);
      })
      .catch((error) => {
        console.warn(`Auto range post failed for ${ipRange}:`, error);
      })
      .finally(() => {
        autoPostingRanges.value.delete(ipRange);
      });
  }

  function queueAutoRoute(ip: string) {
    if (!ip) return;
    if (autoRoutedIps.value.has(ip)) return;
    if (autoRoutingIps.value.has(ip)) return;

    autoRoutingIps.value.add(ip);
    void addDetectedIpToRoutes(ip)
      .then(() => {
        autoRoutedIps.value.add(ip);
        options.onNewRangeDetected?.(ip);
        // When gameId exists, successful post flow will emit a "Learned: ..." activity.
        // Only show "Auto routed" when posting is not applicable.
        const hasGameId = Boolean(options.getGameId?.());
        queueAutoPostRange(ip);
        if (!hasGameId) {
          setActivity(`Auto routed: ${ip}`, "success");
        }
      })
      .catch((error) => {
        console.warn(`Auto route failed for ${ip}:`, error);
      })
      .finally(() => {
        autoRoutingIps.value.delete(ip);
      });
  }

  async function fetchServers() {
    try {
      const servers = await getDetectedServers();
      detectedServers.value = servers;

      if (servers.length > 0 && isMonitoring.value) {
        const gameServers = servers.filter((s) => s.is_game_server);
        if (gameServers.length > 0) {
          gameServers.forEach((server) => queueAutoRoute(server.ip));
          statusMessage.value = "Connected";
          statusType.value = "success";
        } else {
          statusMessage.value = "Scanning...";
          statusType.value = "info";
        }
      } else if (isMonitoring.value) {
        statusMessage.value = "Scanning...";
        statusType.value = "info";
      }
    } catch (error) {
      console.error("Failed to fetch servers:", error);
    }
  }

  async function startMonitoring() {
    if (trafficMonitorStore.startInFlight) {
      statusMessage.value = "Monitoring switch in progress...";
      statusType.value = "info";
      return;
    }

    const processName = options.getProcessName().trim();
    if (!processName) {
      statusMessage.value = "Process name is empty";
      statusType.value = "error";
      return;
    }

    isLoading.value = true;
    statusMessage.value = "Starting...";
    statusType.value = "info";
    initializeAutoCaches();
    trafficMonitorStore.setStartInFlight(true);
    const inFlightResetTimer = window.setTimeout(() => {
      if (trafficMonitorStore.startInFlight) {
        trafficMonitorStore.setStartInFlight(false);
      }
    }, startMonitorTimeoutMs);

    try {
      try {
        await tauriStartMonitoring({ processName });
      } catch (error) {
        if (!isAlreadyMonitoringError(error)) {
          throw error;
        }

        await tauriStopMonitoring().catch((stopError) => {
          if (!isNoActiveMonitoringError(stopError)) {
            throw stopError;
          }
        });

        await tauriStartMonitoring({ processName });
      }

      trafficMonitorStore.claimOwner(localOwnerId);
      await beginLocalMonitoringSession();
    } catch (error) {
      statusMessage.value = `Failed: ${parseErrorMessage(error)}`;
      statusType.value = "error";
      console.error("Failed to start monitoring:", error);
    } finally {
      clearTimeout(inFlightResetTimer);
      trafficMonitorStore.setStartInFlight(false);
      isLoading.value = false;
    }
  }

  async function stopMonitoring() {
    isLoading.value = true;

    const isOwner = trafficMonitorStore.monitorOwner === localOwnerId;
    try {
      if (isOwner) {
        await tauriStopMonitoring().catch((error) => {
          if (!isNoActiveMonitoringError(error)) {
            throw error;
          }
        });
        trafficMonitorStore.releaseOwner();
      }

      statusMessage.value = "Stopped";
      statusType.value = "info";
      setActivity("Monitoring stopped", "info");
      applyLocalStoppedState();
    } catch (error) {
      statusMessage.value = `Stop failed: ${parseErrorMessage(error)}`;
      statusType.value = "error";
      console.error("Failed to stop monitoring:", error);
    } finally {
      isLoading.value = false;
    }
  }

  async function addToRoutes(ip: string) {
    addingRoute.value = ip;
    try {
      await addDetectedIpToRoutes(ip);
      autoRoutedIps.value.add(ip);
      options.onNewRangeDetected?.(ip);
      queueAutoPostRange(ip);
      setActivity(`Route added: ${ip}`, "success");
    } catch (error) {
      console.warn(`Manual route add failed for ${ip}:`, error);
    } finally {
      addingRoute.value = null;
    }
  }

  onUnmounted(() => {
    clearPollingTimer();
    if (trafficMonitorStore.monitorOwner === localOwnerId && isMonitoring.value) {
      trafficMonitorStore.releaseOwner();
      void tauriStopMonitoring()
        .catch((error) => {
          if (!isNoActiveMonitoringError(error)) {
            console.warn("[TrafficMonitor] stopMonitoring on unmount failed:", error);
          }
        });
    }
  });

  return {
    isMonitoring,
    isLoading,
    detectedServers,
    statusMessage,
    statusType,
    activityMessage,
    activityType,
    addingRoute,
    startMonitoring,
    stopMonitoring,
    addToRoutes,
  };
}
