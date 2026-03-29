<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { computed } from "vue";
import { cn } from "@/lib/utils";

const props = defineProps<{
  class?: HTMLAttributes["class"];
  for?: string;
}>();

const htmlFor = computed(() => props.for);

function onLabelMouseDown(e: MouseEvent) {
  // Same as reka-ui Label: avoid selecting text on double-click
  if (!e.defaultPrevented && e.detail > 1) e.preventDefault();
}
</script>

<template>
  <label
    :for="htmlFor"
    :class="
      cn(
        'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
        props.class,
      )
    "
    @mousedown="onLabelMouseDown"
  >
    <slot />
  </label>
</template>
