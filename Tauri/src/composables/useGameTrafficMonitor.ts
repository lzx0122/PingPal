import { onUnmounted, ref } from "vue";
import { apiFetch } from "@/lib/apiClient";
import { useTrafficMonitorStore } from "@/stores/trafficMonitorStore";
import {
  getAllSessionIps,
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

function toPostRange(value: string): string | null {
  const parsed = parseRange(value);
  if (!parsed) return null;
  return parsed.prefix === null ? `${parsed.ip}/32` : `${parsed.ip}/${parsed.prefix}`;
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

  // 統一以 postRange（含前綴，如 "1.2.3.4/32"）作為所有去重 key
  const autoRoutedRanges = ref(new Set<string>());
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
    autoRoutedRanges.value.clear();
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

  function initializeAutoCaches() {
    const knownRanges = options.getKnownRanges?.() ?? new Set<string>();
    autoRoutedRanges.value = new Set<string>();
    autoPostedRanges.value = new Set<string>();
    autoPostingRanges.value.clear();

    knownRanges.forEach((value) => {
      const postRange = toPostRange(value);
      if (!postRange) return;
      autoPostedRanges.value.add(postRange);
      autoRoutedRanges.value.add(postRange);
    });
  }

  function queueAutoPostRange(ip: string) {
    const gameId = options.getGameId?.();
    if (!gameId) return;

    const postRange = toPostRange(ip);
    if (!postRange) return;
    if (autoPostedRanges.value.has(postRange)) return;
    if (autoPostingRanges.value.has(postRange)) return;

    autoPostingRanges.value.add(postRange);
    void apiFetch(`/api/vpn/games/${gameId}/ranges/learn`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ipRange: postRange }),
    })
      .then(async (response) => {
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || `HTTP ${response.status}`);
        }
        autoPostedRanges.value.add(postRange);
        setActivity(`Learned: ${postRange}`, "success");
        console.log(`[TrafficMonitor] Learned range persisted: ${postRange}`);
      })
      .catch((error) => {
        console.warn(`Auto range post failed for ${postRange}:`, error);
      })
      .finally(() => {
        autoPostingRanges.value.delete(postRange);
      });
  }

  function queueAutoRoute(ip: string) {
    if (!ip) return;
    const postRange = toPostRange(ip);
    if (!postRange) return;
    if (autoRoutedRanges.value.has(postRange)) return;
    autoRoutedRanges.value.add(postRange);
    options.onNewRangeDetected?.(ip);
    queueAutoPostRange(ip);
  }

  async function learnSessionIpsFromSidecar() {
    if (!isMonitoring.value || !options.getGameId?.()) return;
    let ips: string[];
    try {
      ips = await getAllSessionIps();
    } catch {
      return;
    }
    for (const ip of ips) {
      queueAutoPostRange(ip);
    }
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

    // 獨立 try/catch，確保 TCP learn 不被上方錯誤影響
    try {
      await learnSessionIpsFromSidecar();
    } catch (error) {
      console.error("Failed to learn session IPs:", error);
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
    const postRange = toPostRange(ip);
    if (!postRange) {
      addingRoute.value = null;
      return;
    }

    const gameId = options.getGameId?.();
    if (!gameId) {
      autoRoutedRanges.value.add(postRange);
      options.onNewRangeDetected?.(ip);
      setActivity(`Learned: ${postRange}`, "success");
      addingRoute.value = null;
      return;
    }

    if (autoPostedRanges.value.has(postRange)) {
      setActivity(`Already learned: ${postRange}`, "success");
      addingRoute.value = null;
      return;
    }

    try {
      const response = await apiFetch(`/api/vpn/games/${gameId}/ranges/learn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ipRange: postRange }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `HTTP ${response.status}`);
      }
      autoPostedRanges.value.add(postRange);
      autoRoutedRanges.value.add(postRange);
      options.onNewRangeDetected?.(ip);
      setActivity(`Learned: ${postRange}`, "success");
    } catch (error) {
      console.warn(`Manual learn failed for ${postRange}:`, error);
      setActivity(`Failed to learn: ${postRange}`, "info");
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
