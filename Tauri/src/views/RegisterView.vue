<script setup lang="ts">
import { useRouter } from "vue-router";
import VPNRegistration from "@/components/VPNRegistration.vue";

const router = useRouter();

function onRegistered() {
  router.push({ name: "library" });
}

function goDevices() {
  router.push({ name: "devices" });
}
</script>

<template>
  <div
    class="h-screen w-full bg-black text-white flex items-center justify-center"
  >
    <VPNRegistration
      @profile-registered="onRegistered"
      @go-to-devices="goDevices"
    />
  </div>
</template>
