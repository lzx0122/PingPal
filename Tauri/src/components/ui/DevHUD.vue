<template>
  <div v-if="isVisible" class="fixed top-2 right-2 z-[9999] bg-slate-900/90 text-green-400 font-mono text-xs p-3 rounded-lg border border-green-500/30 backdrop-blur shadow-2xl pointer-events-none w-56 select-none">
    <div class="flex justify-between border-b border-green-500/30 pb-1 mb-2 font-bold">
      <span class="text-white">🛠️ DEV HUD</span>
      <span :class="fps >= 60 ? 'text-green-400' : 'text-yellow-400'">{{ fps }} FPS</span>
    </div>
    <div class="flex flex-col gap-1.5">
      <div class="flex justify-between">
        <span class="text-slate-400">App CPU:</span>
        <span class="font-semibold" :class="appCpu > 5 ? 'text-red-400' : ''">{{ appCpu.toFixed(1) }} %</span>
      </div>
      <div class="flex justify-between">
        <span class="text-slate-400">App Mem:</span>
        <span class="font-semibold">{{ (appMem / 1024 / 1024).toFixed(1) }} MB</span>
      </div>
      <div class="flex flex-col mt-2 pt-2 border-t border-slate-700">
        <div class="flex justify-between">
          <span class="text-slate-400">Sys CPU:</span>
          <span>{{ sysCpu.toFixed(1) }} %</span>
        </div>
        <div class="flex justify-between break-keep items-end text-[10px] mt-1 text-slate-300">
          <span>Sys Mem: 
            {{ (sysMem / 1024 / 1024 / 1024).toFixed(1) }} / {{ (sysTotalMem / 1024 / 1024 / 1024).toFixed(1) }} GB
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

const isVisible = import.meta.env.DEV;

const fps = ref(0);
const sysCpu = ref(0);
const sysMem = ref(0);
const sysTotalMem = ref(0);
const appCpu = ref(0);
const appMem = ref(0);

let frameCount = 0;
let lastTime = performance.now();
let animFrameId: number;

const measureFPS = () => {
    const now = performance.now();
    frameCount++;
    if (now - lastTime >= 1000) {
        fps.value = Math.round((frameCount * 1000) / (now - lastTime));
        frameCount = 0;
        lastTime = now;
    }
    animFrameId = requestAnimationFrame(measureFPS);
};

let unlistenFn: UnlistenFn | null = null;

onMounted(async () => {
    if (!isVisible) return;
    
    measureFPS();
    
    try {
        unlistenFn = await listen<{
            sys_cpu: number;
            sys_mem: number;
            sys_total_mem: number;
            app_cpu: number;
            app_mem: number;
        }>('dev-metrics', (event) => {
            const payload = event.payload;
            sysCpu.value = payload.sys_cpu || 0;
            sysMem.value = payload.sys_mem || 0;
            sysTotalMem.value = payload.sys_total_mem || 1;
            appCpu.value = payload.app_cpu || 0;
            appMem.value = payload.app_mem || 0;
        });
    } catch(err) {
        console.error("Failed to inject DevHUD listen: ", err);
    }
});

onUnmounted(() => {
    if (animFrameId) cancelAnimationFrame(animFrameId);
    if (unlistenFn) unlistenFn();
});
</script>