<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { Play, StopCircle } from "lucide-vue-next";
import GameDetails from "@/components/game/GameDetails.vue";
import { GAMES } from "@/data/games";
import type { Server } from "@/data/games";
import { useVpnStore } from "@/stores/vpnStore";
import { useGameServerCatalog } from "@/composables/useGameServerCatalog";
import { useWireGuardSession } from "@/composables/useWireGuardSession";
import { useGameTrafficMonitor } from "@/composables/useGameTrafficMonitor";

const props = defineProps<{ gameId: string }>();

const router = useRouter();
const vpnStore = useVpnStore();
const { allServers, isServersLoading, fetchServers } = useGameServerCatalog();
const {
  fetchGameRanges,
  connect,
  disconnect,
  isConnected,
  isLoading,
  gameIpRanges,
} = useWireGuardSession();

const selectedServer = ref<Server | null>(null);

const game = computed(() => GAMES.find((g) => g.id === props.gameId) ?? null);

const serversForGame = computed(() => {
  const g = game.value;
  if (!g) return [];
  return allServers.value.filter((s) => s.tags?.includes(g.tag));
});

const vpnConfigForUi = computed(() => vpnStore.getVpnConfig());

const trafficMonitor = useGameTrafficMonitor({
  getProcessName: () => game.value?.processName ?? "",
  getGameId: () => game.value?.id,
  getKnownRanges: () => gameIpRanges.value,
  onNewRangeDetected: (ip) => onNewRangeDetected(ip),
});
const isBusy = computed(
  () => isLoading.value || trafficMonitor.isLoading.value,
);
const trafficStatusText = computed(() => {
  if (trafficMonitor.activityMessage.value) {
    return trafficMonitor.activityMessage.value;
  }
  return trafficMonitor.isMonitoring.value
    ? "Monitoring active"
    : "Monitoring idle";
});

const primaryUdpEndpoint = computed(() => {
  const list = trafficMonitor.detectedServers.value.filter(
    (s) => s.is_game_server,
  );
  if (list.length === 0) return null;
  return [...list].sort(
    (a, b) => b.send_rate + b.recv_rate - (a.send_rate + a.recv_rate),
  )[0];
});

function syncFromRoute() {
  const id = props.gameId;
  const g = GAMES.find((x) => x.id === id);
  if (!g) {
    router.replace({ name: "library" });
    return;
  }
  const list = allServers.value.filter((s) => s.tags?.includes(g.tag));
  selectedServer.value = list.length > 0 ? list[0] : null;
  void fetchGameRanges(g.id);
}

onMounted(async () => {
  await fetchServers();
  syncFromRoute();
});

watch(
  () => props.gameId,
  () => {
    syncFromRoute();
  },
);

async function onConnect() {
  if (!selectedServer.value) return;
  await fetchGameRanges(game.value!.id);
  const connected = await connect(selectedServer.value);
  if (!connected) return;
  await trafficMonitor.startMonitoring();
}

async function onDisconnect() {
  await trafficMonitor.stopMonitoring();
  await disconnect();
}

function onNewRangeDetected(ip: string) {
  if (!ip) return;
  const newSet = new Set(gameIpRanges.value);
  newSet.add(ip);
  gameIpRanges.value = newSet;
}
</script>

<template>
  <div v-if="game">
    <GameDetails
      :game="game"
      :servers="serversForGame"
      v-model="selectedServer"
      :loading="isServersLoading"
      :is-connected="isConnected"
      :is-loading="isBusy"
      :is-traffic-monitoring="trafficMonitor.isMonitoring.value"
      :traffic-status-text="trafficStatusText"
      :traffic-status-type="trafficMonitor.activityType.value"
      :vpn-config="vpnConfigForUi"
      :game-ip-ranges="gameIpRanges"
      :primary-server-data="primaryUdpEndpoint"
      @connect="onConnect"
      @disconnect="onDisconnect"
      @new-range-detected="onNewRangeDetected"
    >
      <template #play-icon><Play class="w-4 h-4 mr-2 fill-current" /></template>
      <template #stop-icon><StopCircle class="w-4 h-4 mr-2" /></template>
    </GameDetails>
  </div>
</template>
