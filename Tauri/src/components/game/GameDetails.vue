<script setup lang="ts">
import { computed, watch, ref } from "vue";
import { Activity, Zap } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import ServerGlobe from "@/components/ServerGlobe.vue";
import GameServerList from "./GameServerList.vue";
import type { Game, Server } from "@/data/games";
import type { DetectedServerPayload } from "@/lib/tauriCommands";
import { useClientGeo } from "@/composables/useClientGeo";

const props = defineProps<{
  game: Game;
  servers: Server[];
  modelValue: Server | null;
  loading?: boolean;
  isConnected: boolean;
  isLoading: boolean;
  isTrafficMonitoring?: boolean;
  trafficStatusText?: string;
  trafficStatusType?: "info" | "success";
  vpnConfig: any;
  gameIpRanges: Set<string>;
  primaryServerData?: DetectedServerPayload | null;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: Server | null): void;
  (e: "connect"): void;
  (e: "disconnect"): void;
  (e: "new-range-detected", ip: string): void;
}>();

const selectedServer = computed({
  get: () => props.modelValue,
  set: (val: Server | null) => emit("update:modelValue", val),
});

const vpnMapLocation = computed((): [number, number] | null => {
  const s = selectedServer.value;
  if (!s?.location?.length) return null;
  const [lon, lat] = s.location;
  if (lon === 0 && lat === 0) return null;
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  return [lon, lat];
});

const {
  clientLocation,
  clientLabel,
  loading: clientGeoLoading,
  error: clientGeoError,
} = useClientGeo();

const gameIpRangesList = computed(() => Array.from(props.gameIpRanges));

const MAX_HISTORY = 60;
const history = ref<{ send: number; recv: number }[]>([]);

watch(
  () => props.primaryServerData,
  (newVal) => {
    if (newVal) {
      history.value.push({
        send: newVal.send_rate,
        recv: newVal.recv_rate,
      });
      if (history.value.length > MAX_HISTORY) {
        history.value.shift();
      }
    }
  },
  { deep: true },
);

watch(
  () => props.isTrafficMonitoring,
  (on) => {
    if (!on) {
      history.value = [];
    }
  },
);

const maxChartValue = computed(() => {
  if (history.value.length < 2) return 1024;
  return Math.max(
    ...history.value.map((d) => Math.max(d.send, d.recv)),
    1024,
  );
});

function createPath(key: "send" | "recv", isArea: boolean) {
  if (history.value.length < 2) return "";
  const width = 100;
  const height = 100;
  const maxVal = maxChartValue.value;
  const points = history.value.map((d, i) => {
    const x = (i / (history.value.length - 1)) * width;
    const y = height - (d[key] / maxVal) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  if (isArea) {
    const firstX = points[0].split(",")[0];
    const lastX = points[points.length - 1].split(",")[0];
    return `M ${firstX},${height} L ${points.join(" L ")} L ${lastX},${height} Z`;
  }
  return `M ${points.join(" L ")}`;
}

const sendPathLine = computed(() => createPath("send", false));
const sendPathArea = computed(() => createPath("send", true));
const recvPathLine = computed(() => createPath("recv", false));
const recvPathArea = computed(() => createPath("recv", true));

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
</script>

<template>
  <div class="flex items-start gap-8">
    <div
      class="w-64 aspect-[3/4] rounded-lg overflow-hidden bg-zinc-900 border border-zinc-800 relative flex-shrink-0 shadow-2xl"
    >
      <img :src="game.image" class="w-full h-full object-cover opacity-80" />
      <div class="absolute bottom-5 left-5 right-5 z-10">
        <h1
          class="text-2xl font-bold leading-tight mb-2 text-white drop-shadow-md"
        >
          {{ game.name }}
        </h1>
      </div>
    </div>

    <div class="flex-1 flex flex-col gap-5 min-w-0">
      <div class="grid grid-cols-12 gap-5 min-h-[240px] max-h-[320px]">
        <Card
          class="col-span-12 lg:col-span-7 border-zinc-800/80 bg-zinc-950/60 backdrop-blur-sm shadow-sm overflow-hidden flex flex-col p-5"
        >
          <div class="min-h-0 overflow-y-auto">
            <GameServerList
              :game="game"
              :servers="servers"
              v-model="selectedServer"
              :loading="loading"
            />
          </div>
        </Card>

        <Card
          class="col-span-12 lg:col-span-5 border-zinc-800/80 bg-zinc-900/30 shadow-sm overflow-hidden relative min-h-[200px] lg:min-h-0"
        >
          <div
            class="absolute inset-0 flex items-center justify-center p-2 scale-110 origin-center"
          >
            <ServerGlobe
              :vpn-location="vpnMapLocation"
              :region-label="selectedServer?.region ?? ''"
              :client-location="clientLocation"
              :client-label="clientLabel"
              :client-geo-loading="clientGeoLoading"
              :client-geo-error="clientGeoError"
            />
          </div>
        </Card>
      </div>

      <Card
        class="relative overflow-hidden border-zinc-800 bg-zinc-950/80 backdrop-blur-md shadow-sm transition-all duration-500"
        :class="{
          'border-cyan-900/50 shadow-[0_0_28px_rgba(6,182,212,0.06)]':
            isTrafficMonitoring,
        }"
      >
        <div
          class="absolute bottom-0 left-0 right-0 h-28 opacity-30 pointer-events-none z-0"
        >
          <svg
            v-if="history.length > 1"
            class="w-full h-full"
            preserveAspectRatio="none"
            viewBox="0 0 100 100"
          >
            <defs>
              <linearGradient id="gameDetailsGradSend" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stop-color="#a855f7" stop-opacity="0.75" />
                <stop offset="100%" stop-color="#a855f7" stop-opacity="0" />
              </linearGradient>
              <linearGradient id="gameDetailsGradRecv" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stop-color="#06b6d4" stop-opacity="0.75" />
                <stop offset="100%" stop-color="#06b6d4" stop-opacity="0" />
              </linearGradient>
            </defs>
            <path :d="sendPathArea" fill="url(#gameDetailsGradSend)" />
            <path
              :d="sendPathLine"
              fill="none"
              stroke="#a855f7"
              stroke-width="1"
              vector-effect="non-scaling-stroke"
              opacity="0.55"
            />
            <path :d="recvPathArea" fill="url(#gameDetailsGradRecv)" />
            <path
              :d="recvPathLine"
              fill="none"
              stroke="#06b6d4"
              stroke-width="1.5"
              vector-effect="non-scaling-stroke"
            />
          </svg>
        </div>

        <CardContent class="grid grid-cols-1 md:grid-cols-12 gap-0 p-0 z-10 relative min-h-[168px]">
          <div
            class="md:col-span-5 p-5 border-b md:border-b-0 md:border-r border-zinc-800/60 flex flex-col justify-between gap-4"
          >
            <div>
              <h3
                class="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3"
              >
                Network profile
              </h3>
              <div class="space-y-3">
                <div>
                  <span class="text-zinc-600 block text-[10px] uppercase"
                    >Tunnel endpoint</span
                  >
                  <span class="text-zinc-200 font-mono text-sm tracking-tight break-all">{{
                    selectedServer?.endpoint || "Offline"
                  }}</span>
                </div>
                <div>
                  <span class="text-zinc-600 block text-[10px] uppercase"
                    >Assigned IPv4</span
                  >
                  <span class="text-zinc-200 font-mono text-sm tracking-tight">{{
                    vpnConfig?.address || "N/A"
                  }}</span>
                </div>
              </div>
            </div>
            <div class="flex flex-wrap gap-1 items-center">
              <span
                class="px-2 py-0.5 bg-zinc-900 text-zinc-400 text-[10px] rounded font-mono border border-zinc-800 uppercase"
                :title="gameIpRangesList.join(', ')"
              >
                {{ gameIpRanges.size }} routed ranges
              </span>
              <div
                v-if="isTrafficMonitoring"
                class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0"
                title="Traffic monitor active"
              />
            </div>
            <div
              v-if="gameIpRanges.size > 0"
              class="flex flex-wrap gap-1 max-h-16 overflow-y-auto"
            >
              <span
                v-for="ip in gameIpRangesList"
                :key="ip"
                class="px-1.5 py-0.5 bg-zinc-800/80 text-zinc-400 text-[10px] rounded font-mono border border-zinc-700"
              >
                {{ ip }}
              </span>
            </div>
          </div>

          <div
            class="md:col-span-7 p-5 flex flex-col justify-between gap-4 min-h-[140px]"
          >
            <div class="flex justify-between items-start gap-2">
              <h3
                class="text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 transition-colors shrink-0"
                :class="
                  isTrafficMonitoring ? 'text-cyan-400' : 'text-zinc-500'
                "
              >
                <Activity
                  v-if="isTrafficMonitoring"
                  class="w-3 h-3 animate-pulse"
                />
                <Zap v-else class="w-3 h-3" />
                Live telemetry
              </h3>
              <p
                class="text-[10px] font-mono tracking-wider text-right break-words max-w-[55%]"
                :class="
                  trafficStatusType === 'success'
                    ? 'text-cyan-300/90'
                    : 'text-zinc-500'
                "
              >
                {{
                  trafficStatusText ||
                  (isTrafficMonitoring ? "Scanning..." : "Standby")
                }}
              </p>
            </div>

            <div class="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4 mt-auto">
              <div v-if="primaryServerData" class="min-w-0">
                <div class="flex flex-wrap items-center gap-2 mb-1">
                  <span
                    class="text-zinc-500 text-[10px] uppercase font-bold tracking-widest"
                    >UDP endpoint</span
                  >
                  <span
                    class="px-1 py-0.5 bg-cyan-950/50 text-cyan-400 text-[9px] border border-cyan-900/50 font-mono rounded uppercase"
                    >{{ primaryServerData.protocol }}</span
                  >
                </div>
                <div class="flex items-baseline gap-1 flex-wrap">
                  <span
                    class="text-xl sm:text-2xl font-mono text-white font-bold tracking-tight break-all"
                    >{{ primaryServerData.ip }}</span
                  >
                  <span class="text-sm font-mono text-zinc-500 shrink-0"
                    >:{{ primaryServerData.port }}</span
                  >
                </div>
                <p
                  v-if="primaryServerData.country"
                  class="text-xs text-zinc-500 mt-1 truncate"
                >
                  {{ primaryServerData.country }}
                </p>
              </div>
              <div
                v-else
                class="text-zinc-600 text-sm font-mono italic"
              >
                {{
                  isTrafficMonitoring
                    ? "Awaiting UDP traffic..."
                    : "No active endpoint"
                }}
              </div>

              <div
                v-if="primaryServerData"
                class="flex gap-6 text-right sm:shrink-0"
              >
                <div class="flex flex-col">
                  <span
                    class="text-[10px] text-zinc-500 uppercase font-bold mb-0.5 tracking-widest flex items-center justify-end gap-1.5"
                  >
                    <span class="w-1.5 h-1.5 rounded-full bg-purple-500" />
                    Up
                  </span>
                  <span
                    class="text-sm font-mono text-purple-200 font-semibold tabular-nums"
                    >{{ formatBytes(primaryServerData.send_rate) }}/s</span
                  >
                </div>
                <div class="flex flex-col">
                  <span
                    class="text-[10px] text-zinc-500 uppercase font-bold mb-0.5 tracking-widest flex items-center justify-end gap-1.5"
                  >
                    <span
                      class="w-1.5 h-1.5 rounded-full bg-cyan-500 shadow-[0_0_5px_cyan]"
                    />
                    Down
                  </span>
                  <span
                    class="text-sm font-mono text-cyan-200 font-semibold tabular-nums"
                    >{{ formatBytes(primaryServerData.recv_rate) }}/s</span
                  >
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div class="mt-auto pt-1">
        <Button
          v-if="!isConnected"
          size="lg"
          :disabled="isLoading || !selectedServer"
          class="w-full bg-white text-black hover:bg-zinc-200 border border-transparent font-bold h-14 text-base tracking-wide shadow-lg shadow-zinc-900/50 transition-all active:scale-[0.98]"
          @click="$emit('connect')"
        >
          <span v-if="!isLoading"><slot name="play-icon" /></span>
          <span
            v-else
            class="w-4 h-4 mr-2 border-2 border-black/30 border-t-black rounded-full animate-spin inline-block align-middle"
          />
          {{ isLoading ? "Starting..." : "Accelerate Now" }}
        </Button>
        <Button
          v-else
          size="lg"
          variant="destructive"
          :disabled="isLoading"
          class="w-full h-14 text-base font-bold bg-zinc-900 border border-zinc-800 hover:bg-red-950 hover:border-red-900 hover:text-red-500 text-zinc-300 transition-all active:scale-[0.98]"
          @click="$emit('disconnect')"
        >
          <span v-if="!isLoading"><slot name="stop-icon" /></span>
          Stop Acceleration
        </Button>
      </div>
    </div>
  </div>
</template>
