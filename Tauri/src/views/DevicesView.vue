<script setup lang="ts">
import { useRouter } from "vue-router";
import { Button } from "@/components/ui/button";
import DeviceManager from "@/components/DeviceManager.vue";
import { useVpnStore } from "@/stores/vpnStore";

const router = useRouter();
const vpnStore = useVpnStore();
</script>

<template>
  <div>
    <div
      v-if="!vpnStore.isConfigured"
      class="mb-6 p-4 bg-zinc-900 border border-zinc-700 rounded-lg flex items-center justify-between gap-4"
    >
      <div class="flex items-center gap-3 text-sm text-zinc-400">
        After deleting old device, click the button on the right to complete
        registration
      </div>
      <Button
        size="sm"
        class="bg-white text-black hover:bg-zinc-200 font-bold shrink-0"
        @click="router.push({ name: 'register' })"
      >
        Go to Register
      </Button>
    </div>
    <DeviceManager />
  </div>
</template>
