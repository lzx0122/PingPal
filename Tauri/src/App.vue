<script setup lang="ts">
import { RouterView } from "vue-router";
</script>

<template>
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
