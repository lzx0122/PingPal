<script setup lang="ts">
import { ref } from "vue";
import ServerDetection from "../components/ServerDetection.vue";

const processName = ref("ShooterGame.exe");
const detectedGameId = ref("default");
const knownRanges = ref(new Set<string>());

function onNewRangeDetected() {
  console.log("New game server range detected and added!");
}
</script>

<template>
  <div class="h-full flex flex-col space-y-6 overflow-y-auto">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold text-white tracking-tight">Dashboard</h1>
    </div>

    <div class="space-y-4">
      <h2 class="text-xs font-bold text-zinc-500 uppercase tracking-wider">
        Game Monitoring
      </h2>
      <ServerDetection
        :process-name="processName"
        :game-id="detectedGameId"
        :known-ranges="knownRanges"
        @new-range-detected="onNewRangeDetected"
      />
    </div>
  </div>
</template>
