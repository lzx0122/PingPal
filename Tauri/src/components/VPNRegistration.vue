<script setup lang="ts">
import { ref, onMounted } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { useVpnProfile } from "@/composables/useVpnProfile";
import { useVpnStore } from "@/stores/vpnStore";
import { apiFetch } from "@/lib/apiClient";
import { Loader2, Monitor, Settings2 } from "lucide-vue-next";

const { registerProfile, generateKeys } = useVpnProfile();
const vpnStore = useVpnStore();

const deviceName = ref("");
const isRegistering = ref(false);
const error = ref<string | null>(null);
const deviceCount = ref(0);
const isLoadingDeviceName = ref(true);

const emit = defineEmits(["profile-registered", "go-to-devices"]);

onMounted(async () => {
  await fetchDeviceCount();
  await autoDetectDeviceName();
});

async function autoDetectDeviceName() {
  try {
    const name = await invoke<string>("get_device_name");
    deviceName.value = name;
  } catch (e) {
    console.error("Failed to get device name:", e);
    deviceName.value = "My Device";
  } finally {
    isLoadingDeviceName.value = false;
  }
}

async function fetchDeviceCount() {
  try {
    const response = await apiFetch("/api/vpn/profiles");
    if (response.ok) {
      const profiles = await response.json();
      deviceCount.value = profiles.length;
    }
  } catch (e) {
    console.error("Failed to fetch device count:", e);
  }
}

async function handleRegister() {
  if (!deviceName.value) {
    error.value = "Please enter a device name.";
    return;
  }

  isRegistering.value = true;
  error.value = null;

  try {
    const keys = await generateKeys();

    const result = await registerProfile(deviceName.value, keys.publicKey);

    console.log("Registration success:", result);

    const profileId = result.profile_id;

    await vpnStore.saveConfig(
      profileId,
      keys.privateKey,
      result.server_endpoint || "",
      result.assigned_ip || "",
    );

    const vpnConfig = vpnStore.getVpnConfig();

    emit("profile-registered", vpnConfig);
  } catch (e: any) {
    console.error(e);
    error.value = e.message || "Registration failed";
  } finally {
    isRegistering.value = false;
  }
}
</script>

<template>
  <div
    class="p-6 bg-zinc-900 border border-zinc-800 rounded-xl max-w-md mx-auto"
  >
    <div class="flex items-center gap-3 mb-6">
      <div
        class="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center"
      >
        <Monitor class="w-5 h-5 text-white" />
      </div>
      <div>
        <h2 class="text-xl font-bold text-white">Device Registration</h2>
        <p class="text-xs text-zinc-400">Register this device to access VPN</p>
      </div>
    </div>

    <div class="space-y-4">
      <!-- Device Name Input -->
      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <label
            class="text-xs uppercase font-bold text-zinc-500 tracking-wider"
            >Device Name</label
          >
          <span class="text-xs text-zinc-600">{{ deviceCount }}/5 devices</span>
        </div>
        <input
          v-model="deviceName"
          type="text"
          placeholder="e.g. My Gaming PC"
          :disabled="isLoadingDeviceName"
          class="w-full bg-black border border-zinc-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-white transition-colors disabled:opacity-50"
        />
        <p v-if="isLoadingDeviceName" class="text-xs text-zinc-500 italic">
          Detecting device name...
        </p>
        <p class="text-xs text-zinc-400">
          You can connect to any VPS server after registration
        </p>
      </div>

      <div
        v-if="error"
        class="p-3 bg-red-900/20 border border-red-900 rounded-lg text-red-500 text-sm space-y-3"
      >
        <p>{{ error }}</p>
        <Button
          v-if="deviceCount >= 5"
          @click="emit('go-to-devices')"
          variant="outline"
          class="w-full h-9 text-sm border-red-800 text-red-400 hover:bg-red-950/40 hover:text-red-300"
        >
          <Settings2 class="w-4 h-4 mr-2" />
          Manage Devices
        </Button>
      </div>

      <Button
        @click="handleRegister"
        :disabled="isRegistering || !deviceName"
        class="w-full h-12 bg-white text-black hover:bg-zinc-200 font-bold"
      >
        <Loader2 v-if="isRegistering" class="w-4 h-4 mr-2 animate-spin" />
        {{ isRegistering ? "Registering..." : "Register Device" }}
      </Button>
    </div>
  </div>
</template>
