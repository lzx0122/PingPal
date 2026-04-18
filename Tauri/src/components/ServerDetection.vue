<template>
  <div
    class="flex flex-col w-full rounded-lg border border-zinc-800 bg-zinc-950/50 backdrop-blur-sm overflow-hidden shadow-sm"
  >
    <div
      class="flex items-center justify-between p-5 border-b border-zinc-800 bg-zinc-900/20"
    >
      <div class="flex items-center gap-3">
        <div
          class="w-8 h-8 flex items-center justify-center rounded bg-zinc-900 border border-zinc-800 text-white shadow-sm"
        >
          <Activity
            :class="{
              'animate-pulse text-white': isMonitoring,
              'text-zinc-500': !isMonitoring,
            }"
            class="w-4 h-4"
          />
        </div>
        <div class="flex flex-col">
          <h3
            class="text-base font-bold text-white tracking-tight leading-none"
          >
            Server Detection
          </h3>
        </div>
      </div>

      <button
        @click="toggleMonitoring"
        :disabled="isLoading"
        class="flex items-center gap-2 px-4 py-2 rounded text-sm font-medium transition-all duration-200 border"
        :class="[
          isMonitoring
            ? 'bg-white text-black border-white hover:bg-zinc-200 hover:border-zinc-200 shadow-sm'
            : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:bg-zinc-800 hover:text-white hover:border-zinc-700',
        ]"
      >
        <Zap v-if="isMonitoring" class="w-3 h-3 fill-current" />
        <Power v-else class="w-3 h-3" />
        <span>{{ isMonitoring ? "Monitoring" : "Start" }}</span>
      </button>
    </div>

    <!-- Status Banner (Compact) -->
    <div
      v-if="statusMessage"
      class="flex items-center gap-2 px-5 py-2 border-b border-zinc-800/50 text-sm font-medium"
      :class="{
        'bg-zinc-900/50 text-zinc-300': statusType === 'info',
        'bg-zinc-900/50 text-white': statusType === 'success',
        'bg-red-950/20 text-red-400': statusType === 'error',
      }"
    >
      <div
        class="w-1.5 h-1.5 rounded-full shrink-0"
        :class="
          statusType === 'success'
            ? 'bg-green-500'
            : statusType === 'error'
              ? 'bg-red-500'
              : 'bg-zinc-500'
        "
      ></div>
      <span class="truncate opacity-90">{{ statusMessage }}</span>
    </div>

    <!-- Detected Servers List (Compact) -->
    <div v-if="detectedServers.length > 0" class="p-5 flex flex-col gap-3">
      <!-- Primary Server (Compact Layout) -->
      <div v-if="primaryServer" class="flex flex-col gap-2">
        <div
          class="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-zinc-500 px-1"
        >
          <span class="flex items-center gap-1.5"
            ><Trophy class="w-4 h-4" /> Main Server</span
          >
          <span class="font-mono">{{ primaryServer.protocol }}</span>
        </div>

        <div
          class="group relative flex flex-col p-5 rounded bg-zinc-900/40 border border-zinc-800 hover:border-zinc-600 hover:bg-zinc-900/60 transition-all gap-4"
        >
          <!-- Top Row: IP & Info -->
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-4 overflow-hidden">
              <div
                class="w-10 h-10 rounded bg-zinc-800 flex items-center justify-center border border-zinc-700 shrink-0"
              >
                <Globe class="w-5 h-5 text-zinc-300" />
              </div>
              <div class="flex flex-col overflow-hidden">
                <div class="flex items-baseline gap-1.5">
                  <span
                    class="text-lg font-mono font-bold text-white truncate"
                    >{{ primaryServer.ip }}</span
                  >
                  <span class="text-xs font-mono text-zinc-500"
                    >:{{ primaryServer.port }}</span
                  >
                </div>
                <div class="flex items-center gap-2 text-xs text-zinc-400">
                  <span
                    v-if="primaryServer.country"
                    class="truncate flex items-center gap-1"
                    ><MapPin class="w-3.5 h-3.5" />{{
                      primaryServer.country
                    }}</span
                  >
                </div>
              </div>
            </div>

            <button
              @click="addToRoutes(primaryServer.ip)"
              :disabled="addingRoute === primaryServer.ip"
              class="flex items-center justify-center w-7 h-7 rounded bg-white text-black hover:bg-zinc-200 transition-colors disabled:opacity-50"
              title="Add Route"
            >
              <Plus v-if="addingRoute !== primaryServer.ip" class="w-4 h-4" />
              <Loader2 v-else class="w-4 h-4 animate-spin" />
            </button>
          </div>

          <!-- Middle: Chart Visualization -->
          <div
            class="h-24 w-full bg-zinc-950/50 rounded border border-zinc-800/50 relative overflow-hidden flex items-end"
          >
            <!-- Max Value Indicator -->
            <div
              class="absolute top-1 left-1 text-[9px] font-mono text-zinc-600 bg-zinc-900/80 px-1 rounded z-10"
            >
              {{ formatBytes(maxChartValue) }}/s
            </div>

            <svg
              class="w-full h-full"
              preserveAspectRatio="none"
              viewBox="0 0 100 100"
            >
              <defs>
                <!-- Upload Gradient (Purple) -->
                <linearGradient id="gradSend" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stop-color="#a855f7" stop-opacity="0.5" />
                  <stop offset="100%" stop-color="#a855f7" stop-opacity="0" />
                </linearGradient>
                <!-- Download Gradient (Cyan) -->
                <linearGradient id="gradRecv" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stop-color="#06b6d4" stop-opacity="0.5" />
                  <stop offset="100%" stop-color="#06b6d4" stop-opacity="0" />
                </linearGradient>
              </defs>

              <!-- Grid Lines -->
              <line
                x1="0"
                y1="50%"
                x2="100%"
                y2="50%"
                stroke="#27272a"
                stroke-width="1"
                stroke-dasharray="4 4"
              />
              <line
                x1="0"
                y1="25%"
                x2="100%"
                y2="25%"
                stroke="#27272a"
                stroke-width="1"
                stroke-dasharray="4 4"
                opacity="0.5"
              />
              <line
                x1="0"
                y1="75%"
                x2="100%"
                y2="75%"
                stroke="#27272a"
                stroke-width="1"
                stroke-dasharray="4 4"
                opacity="0.5"
              />

              <!-- Send Rate Area (Bottom layer) -->
              <path :d="sendPathArea" fill="url(#gradSend)" stroke="none" />
              <path
                :d="sendPathLine"
                fill="none"
                stroke="#a855f7"
                stroke-width="1.5"
                vector-effect="non-scaling-stroke"
              />

              <!-- Recv Rate Area (Top layer) -->
              <path :d="recvPathArea" fill="url(#gradRecv)" stroke="none" />
              <path
                :d="recvPathLine"
                fill="none"
                stroke="#06b6d4"
                stroke-width="1.5"
                vector-effect="non-scaling-stroke"
              />
            </svg>

            <div
              class="absolute top-2 right-2 text-[10px] font-mono text-zinc-600 bg-zinc-950/80 px-1.5 rounded"
            >
              traffic history
            </div>
          </div>

          <!-- Bottom Row: Stats Grid (Upload & Download only) -->
          <div class="grid grid-cols-2 gap-2 pt-1 border-t border-zinc-800/50">
            <div class="flex flex-col">
              <div class="flex items-center gap-1.5 mb-0.5">
                <div class="w-1.5 h-1.5 rounded-full bg-purple-500"></div>
                <span class="text-[10px] text-zinc-500 uppercase font-bold"
                  >Upload</span
                >
              </div>
              <span class="text-sm font-mono text-purple-200"
                >{{ formatBytes(primaryServer.send_rate) }}/s</span
              >
            </div>
            <div class="flex flex-col">
              <div class="flex items-center gap-1.5 mb-0.5">
                <div
                  class="w-1.5 h-1.5 rounded-full bg-cyan-500 shadow-[0_0_4px_cyan]"
                ></div>
                <span class="text-[10px] text-zinc-500 uppercase font-bold"
                  >Download</span
                >
              </div>
              <span class="text-sm font-mono text-cyan-200"
                >{{ formatBytes(primaryServer.recv_rate) }}/s</span
              >
            </div>
          </div>
        </div>
      </div>

      <!-- Removed "Other Connections" section as per user request -->
    </div>

    <!-- Empty State (Compact) -->
    <div
      v-else-if="isMonitoring"
      class="flex flex-col items-center justify-center py-8 px-4 text-center"
    >
      <Loader2 class="w-5 h-5 text-zinc-600 animate-spin mb-2" />
      <p class="text-zinc-400 text-xs font-medium">Scanning...</p>
    </div>

    <div
      v-else
      class="flex flex-col items-center justify-center py-8 px-4 text-center"
    >
      <div
        class="w-8 h-8 rounded-full bg-zinc-900/50 flex items-center justify-center mb-2 border border-zinc-800/50"
      >
        <Target class="w-4 h-4 text-zinc-600" />
      </div>
      <p class="text-zinc-500 text-xs text-center leading-tight">
        Ready to Monitor
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useGameTrafficMonitor } from "@/composables/useGameTrafficMonitor";
import {
  Activity,
  Zap,
  Power,
  Globe,
  MapPin,
  Plus,
  Loader2,
  Target,
  Trophy,
} from "lucide-vue-next";

// Props
interface Props {
  processName: string; // e.g., "TslGame.exe"
  gameId?: string;
  knownRanges?: Set<string>;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: "new-range-detected", ip: string): void;
}>();

const {
  isMonitoring,
  isLoading,
  detectedServers,
  statusMessage,
  statusType,
  addingRoute,
  startMonitoring,
  stopMonitoring,
  addToRoutes,
} = useGameTrafficMonitor({
  getProcessName: () => props.processName,
  getGameId: () => props.gameId,
  getKnownRanges: () => props.knownRanges,
  onNewRangeDetected: (ip) => emit("new-range-detected", ip),
});

// History State
const MAX_HISTORY = 60; // Keep last 60 data points

// Note: original code had strict DataPoint interface, simplifying for replacement/merge
const history = ref<any[]>([]);

// Computed for Primary vs Others
const sortedServers = computed(() => {
  // 1. Filter only Game Servers (UDP)
  const udpServers = detectedServers.value.filter((s) => s.is_game_server);
  // 2. Sort by total traffic rate descending
  return udpServers.sort((a, b) => {
    const rateA = a.send_rate + a.recv_rate;
    const rateB = b.send_rate + b.recv_rate;
    return rateB - rateA;
  });
});

const primaryServer = computed(() => {
  if (sortedServers.value.length === 0) return null;
  // The top one is the primary
  return sortedServers.value[0];
});

// Watch primary server to push history
watch(primaryServer, (newVal) => {
  if (newVal) {
    history.value.push({
      time: Date.now(),
      send: newVal.send_rate,
      recv: newVal.recv_rate,
    });
    // Limit history size
    if (history.value.length > MAX_HISTORY) {
      history.value.shift();
    }
  }
});

// Chart Helpers
const maxChartValue = computed(() => {
  if (history.value.length < 2) return 1024;
  return Math.max(
    ...history.value.map((d) => Math.max(d.send, d.recv)),
    1024, // Min 1KB
  );
});

// Separate Line and Area paths
const sendPathLine = computed(() => createPath("send", false));
const sendPathArea = computed(() => createPath("send", true));
const recvPathLine = computed(() => createPath("recv", false));
const recvPathArea = computed(() => createPath("recv", true));

function createPath(key: "send" | "recv", isArea: boolean) {
  if (history.value.length < 2) return "";

  const width = 100;
  const height = 100;
  const maxVal = maxChartValue.value;

  const points = history.value.map((d, i) => {
    const x = (i / (history.value.length - 1)) * width;
    const y = height - (d[key] / maxVal) * height; // Invert Y
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  if (isArea) {
    // Start at bottom-left, go to first point, follow points, go to bottom-right, close
    const firstX = points[0].split(",")[0];
    const lastX = points[points.length - 1].split(",")[0];
    return `M ${firstX},${height} L ${points.join(" L ")} L ${lastX},${height} Z`;
  } else {
    // Just the line
    return `M ${points.join(" L ")}`;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function toggleMonitoring() {
  if (isMonitoring.value) {
    await stopMonitoring();
    history.value = [];
  } else {
    history.value = [];
    await startMonitoring();
  }
}
</script>

<style scoped>
@import url("https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&display=swap");
</style>
