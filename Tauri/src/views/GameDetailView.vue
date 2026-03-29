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
  await connect(selectedServer.value);
}

async function onDisconnect() {
  await disconnect();
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
      :is-loading="isLoading"
      :vpn-config="vpnConfigForUi"
      :game-ip-ranges="gameIpRanges"
      @connect="onConnect"
      @disconnect="onDisconnect"
    >
      <template #play-icon><Play class="w-4 h-4 mr-2 fill-current" /></template>
      <template #stop-icon><StopCircle class="w-4 h-4 mr-2" /></template>
    </GameDetails>
  </div>
</template>
