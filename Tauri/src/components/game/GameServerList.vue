<script setup lang="ts">
import { ref, computed, watch, type PropType } from "vue";
import { Button } from "@/components/ui/button";
import type { Server, Game } from "@/data/games";

const props = defineProps<{
  game: Game;
  servers: Server[];
  modelValue: Server | null;
  loading?: boolean;
}>();
const emit = defineEmits<{ (e: "update:modelValue", value: Server | null): void }>();

const selected = computed({
  get: () => props.modelValue,
  set: (val: Server | null) => emit("update:modelValue", val),
});
</script>

<template>
  <div>
    <h3 class="text-sm font-bold text-zinc-400 mb-2 uppercase">Servers</h3>
    <div v-if="loading" class="text-xs text-zinc-500">Loading servers...</div>
    <div v-else-if="servers.length === 0" class="text-xs text-zinc-500">No servers available for this game.</div>
    <div v-else class="flex flex-wrap gap-2">
      <Button
        v-for="server in servers"
        :key="server.id"
        :variant="selected && selected.id === server.id ? 'default' : 'outline'"
        size="sm"
        class="font-mono"
        @click="selected = server"
      >
        {{ server.name || server.endpoint }}
      </Button>
    </div>
  </div>
</template>
