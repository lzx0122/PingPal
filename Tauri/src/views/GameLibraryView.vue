<script setup lang="ts">
import { onMounted } from "vue";
import { useRouter } from "vue-router";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { GAMES } from "@/data/games";
import type { Game } from "@/data/games";
import { useGameServerCatalog } from "@/composables/useGameServerCatalog";

const router = useRouter();
const { gamesWithServers, isServersLoading, fetchServers } =
  useGameServerCatalog();

onMounted(() => {
  fetchServers();
});

function openGame(game: Game) {
  router.push({ name: "game-detail", params: { gameId: game.id } });
}
</script>

<template>
  <div class="max-w-6xl mx-auto">
    <div
      class="flex items-end justify-between mb-8 border-b border-zinc-900 pb-4"
    >
      <h2 class="text-3xl font-bold tracking-tight text-white">Game Library</h2>
      <span class="text-sm text-zinc-500"
        >{{ GAMES.length }} GAMES AVAILABLE</span
      >
    </div>

    <div
      class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
    >
      <Card
        v-for="game in gamesWithServers"
        :key="game.id"
        class="bg-zinc-900 border-zinc-800 hover:border-zinc-600 hover:bg-zinc-800 transition-all duration-300 group relative overflow-hidden cursor-pointer h-[280px]"
        @click="openGame(game)"
      >
        <div
          class="absolute inset-0 bg-cover bg-center opacity-60 group-hover:opacity-80 transition-all duration-500"
          :style="{ backgroundImage: `url(${game.image})` }"
        ></div>
        <div
          class="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-transparent"
        ></div>

        <CardHeader
          class="relative z-10 h-full flex flex-col justify-end p-6"
        >
          <CardTitle class="text-xl font-bold text-white mb-1">{{
            game.name
          }}</CardTitle>
          <div class="text-xs text-zinc-400 mt-1">
            <template v-if="isServersLoading">Loading servers...</template>
            <template v-else>{{ game.servers.length }} servers</template>
          </div>
        </CardHeader>
      </Card>
    </div>
  </div>
</template>
