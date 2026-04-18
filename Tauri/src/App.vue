<script setup lang="ts">
import { defineAsyncComponent } from "vue";
import { RouterView } from "vue-router";

const isDev = import.meta.env.DEV;

const DevHUD = isDev
  ? defineAsyncComponent(() => import("./components/ui/DevHUD.vue"))
  : null;
</script>

<template>
  <component v-if="isDev && DevHUD" :is="DevHUD" />
  <RouterView />
</template>

<style>
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: #27272a;
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: #3f3f46;
}
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
</style>
