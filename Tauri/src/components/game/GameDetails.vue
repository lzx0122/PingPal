<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import GameServerList from "./GameServerList.vue";
import type { Game, Server } from "@/data/games";

const props = defineProps<{
  game: Game;
  servers: Server[];
  modelValue: Server | null;
  loading?: boolean;
  isConnected: boolean;
  isLoading: boolean;
  vpnConfig: any;
  gameIpRanges: Set<string>;
}>();
const emit = defineEmits<{
  (e: "update:modelValue", value: Server | null): void;
  (e: "connect"): void;
  (e: "disconnect"): void;
}>();

const selectedServer = computed({
  get: () => props.modelValue,
  set: (val: Server | null) => emit("update:modelValue", val),
});
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
            <span class="text-white font-mono truncate" :title="Array.from(gameIpRanges).join(',')">
              {{ gameIpRanges.size }} Ranges Loaded
            </span>
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
