import { ref, computed } from "vue";
import { apiFetch } from "@/lib/apiClient";
import { GAMES, type Server } from "@/data/games";

const allServers = ref<Server[]>([]);
const isServersLoading = ref(false);

export function useGameServerCatalog() {
  async function fetchServers() {
    isServersLoading.value = true;
    try {
      const res = await apiFetch("/api/servers");
      if (!res.ok) throw new Error("Failed to fetch servers");
      allServers.value = (await res.json()) as Server[];
    } catch (e) {
      console.error(e);
      allServers.value = [];
    } finally {
      isServersLoading.value = false;
    }
  }

  const gamesWithServers = computed(() =>
    GAMES.map((game) => ({
      ...game,
      servers: allServers.value.filter((s) => s.tags?.includes(game.tag)),
    })),
  );

  return {
    allServers,
    isServersLoading,
    gamesWithServers,
    fetchServers,
  };
}
