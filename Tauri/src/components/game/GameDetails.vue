<script setup lang="ts">
import { computed } from "vue";
import { Button } from "@/components/ui/button";
import ServerGlobe from "@/components/ServerGlobe.vue";
import GameServerList from "./GameServerList.vue";
import type { Game, Server } from "@/data/games";
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

const { clientLocation, clientLabel, loading: clientGeoLoading, error: clientGeoError } =
  useClientGeo();

const gameIpRangesList = computed(() => Array.from(props.gameIpRanges));
</script>

<template>
  <div class="flex items-start gap-8">
    <!-- Game Cover -->
    <div
      class="w-64 aspect-[3/4] rounded-lg overflow-hidden bg-zinc-900 border border-zinc-800 relative flex-shrink-0 shadow-2xl"
    >
      <img :src="game.image" class="w-full h-full object-cover opacity-80" />
      <div class="absolute bottom-5 left-5 right-5 z-10">
        <h1 class="text-2xl font-bold leading-tight mb-2 text-white drop-shadow-md">
          {{ game.name }}
        </h1>
      </div>
    </div>

    <!-- Controls -->
    <div class="flex-1 flex flex-col gap-6">
      <GameServerList
        :game="game"
        :servers="servers"
        v-model="selectedServer"
        :loading="loading"
      />

      <ServerGlobe
        :vpn-location="vpnMapLocation"
        :region-label="selectedServer?.region ?? ''"
        :client-location="clientLocation"
        :client-label="clientLabel"
        :client-geo-loading="clientGeoLoading"
        :client-geo-error="clientGeoError"
      />

      <!-- Config Info -->
      <div class="p-4 bg-zinc-900/50 border border-zinc-800 rounded-lg">
        <h3 class="text-sm font-bold text-zinc-400 mb-2 uppercase">Current VPN Profile</h3>
        <div class="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span class="text-zinc-600 block text-xs">Device</span>
            <span class="text-white font-mono">My Device</span>
          </div>
          <div>
            <span class="text-zinc-600 block text-xs">Server Endpoint</span>
            <span class="text-white font-mono">{{ selectedServer?.endpoint || "N/A" }}</span>
          </div>
          <div>
            <span class="text-zinc-600 block text-xs">Assigned IP</span>
            <span class="text-white font-mono">{{ vpnConfig?.address || "N/A" }}</span>
          </div>
          <div>
            <span class="text-zinc-600 block text-xs">Allowed IPs</span>
            <div class="flex flex-col gap-1">
              <div class="flex items-center gap-2">
                <span class="text-white font-mono truncate" :title="gameIpRangesList.join(',')">
                  {{ gameIpRanges.size }} Ranges Loaded
                </span>
                <div
                  v-if="isTrafficMonitoring"
                  class="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]"
                  title="Traffic monitor active"
                ></div>
              </div>
              <p
                class="text-[11px] font-medium uppercase tracking-wider"
                :class="
                  trafficStatusType === 'success'
                    ? 'text-emerald-300/90'
                    : 'text-zinc-500'
                "
              >
                {{ trafficStatusText || (isTrafficMonitoring ? "Monitoring active" : "Monitoring idle") }}
              </p>
              <div v-if="gameIpRanges.size > 0" class="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                <span
                  v-for="ip in gameIpRangesList"
                  :key="ip"
                  class="px-1.5 py-0.5 bg-zinc-800 text-zinc-400 text-[10px] rounded font-mono border border-zinc-700"
                >
                  {{ ip }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Action Button -->
      <div class="mt-auto">
        <Button
          v-if="!isConnected"
          @click="$emit('connect')"
          :disabled="isLoading || !selectedServer"
          size="lg"
          class="w-full bg-white text-black hover:bg-zinc-200 border border-transparent font-bold h-14 text-base tracking-wide shadow-lg shadow-zinc-900/50 transition-all active:scale-[0.98]"
        >
          <span v-if="!isLoading"><slot name="play-icon" /></span>
          <span v-else class="w-4 h-4 mr-2 border-2 border-black/30 border-t-black rounded-full animate-spin"></span>
          {{ isLoading ? "Starting..." : "Accelerate Now" }}
        </Button>
        <Button
          v-else
          @click="$emit('disconnect')"
          :disabled="isLoading"
          variant="destructive"
          size="lg"
          class="w-full h-14 text-base font-bold bg-zinc-900 border border-zinc-800 hover:bg-red-950 hover:border-red-900 hover:text-red-500 text-zinc-300 transition-all active:scale-[0.98]"
        >
          <span v-if="!isLoading"><slot name="stop-icon" /></span>
          Stop Acceleration
        </Button>
      </div>
    </div>
  </div>
</template>
