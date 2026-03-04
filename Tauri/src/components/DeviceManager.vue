<script setup lang="ts">
import { ref, onMounted } from "vue";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Monitor, Trash2, Loader2, AlertCircle } from "lucide-vue-next";

interface VpnProfile {
  id: string;
  device_name: string;
  public_key: string;
  created_at: string;
  user_id: string;
  is_active: boolean;
}

const profiles = ref<VpnProfile[]>([]);
const isLoading = ref(true);
const isDeletingId = ref<string | null>(null);
const error = ref<string | null>(null);

onMounted(() => {
  fetchProfiles();
});

async function fetchProfiles() {
  try {
    isLoading.value = true;
    error.value = null;

    const token = localStorage.getItem("auth_token");
    if (!token) {
      error.value = "Not authenticated";
      return;
    }

    const response = await fetch("http://localhost:3000/api/vpn/profiles", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.status === 401) {
      import("@/composables/useAuth").then(({ useAuth }) => {
        useAuth().logout();
      });
      throw new Error("Session expired. Please login again.");
    }

    if (!response.ok) {
      throw new Error("Failed to fetch profiles");
    }

    profiles.value = await response.json();
  } catch (e: any) {
    console.error("Failed to fetch profiles:", e);
    error.value = e.message || "Failed to load devices";
  } finally {
    isLoading.value = false;
  }
}

async function deleteProfile(profileId: string) {
  if (!confirm("Are you sure you want to delete this device?")) {
    return;
  }

  try {
    isDeletingId.value = profileId;
    error.value = null;

    const token = localStorage.getItem("auth_token");
    if (!token) {
      error.value = "Not authenticated";
      return;
    }

    const response = await fetch(
      `http://localhost:3000/api/vpn/profiles/${profileId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    if (response.status === 401) {
      import("@/composables/useAuth").then(({ useAuth }) => {
        useAuth().logout();
      });
      throw new Error("Session expired. Please login again.");
    }

    if (!response.ok) {
      throw new Error("Failed to delete device");
    }

    // Remove from local list
    profiles.value = profiles.value.filter((p) => p.id !== profileId);
  } catch (e: any) {
    console.error("Failed to delete profile:", e);
    error.value = e.message || "Failed to delete device";
  } finally {
    isDeletingId.value = null;
  }
}

function formatDate(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
</script>

<template>
  <div class="max-w-4xl mx-auto">
    <div
      class="flex items-end justify-between mb-8 border-b border-zinc-900 pb-4"
    >
      <h2 class="text-3xl font-bold tracking-tight text-white">
        Device Management
      </h2>
      <span class="text-sm text-zinc-500">{{ profiles.length }}/5 DEVICES</span>
    </div>

    <!-- Error Message -->
    <div
      v-if="error"
      class="mb-6 p-4 bg-red-900/20 border border-red-900 rounded-lg flex items-center gap-3 text-red-500"
    >
      <AlertCircle class="w-5 h-5 flex-shrink-0" />
      <span>{{ error }}</span>
    </div>

    <!-- Loading State -->
    <div
      v-if="isLoading"
      class="flex items-center justify-center py-20 text-zinc-500"
    >
      <Loader2 class="w-8 h-8 animate-spin" />
    </div>

    <!-- Device List -->
    <div v-else-if="profiles.length > 0" class="space-y-4">
      <Card
        v-for="profile in profiles"
        :key="profile.id"
        class="bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-all"
      >
        <CardContent class="p-6">
          <div class="flex items-start justify-between">
            <div class="flex items-start gap-4 flex-1">
              <div
                class="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center flex-shrink-0"
              >
                <Monitor class="w-6 h-6 text-white" />
              </div>
              <div class="flex-1 min-w-0">
                <h3 class="text-lg font-bold text-white mb-1">
                  {{ profile.device_name }}
                </h3>
                <div class="space-y-1">
                  <div class="flex items-center gap-2 text-sm">
                    <span class="text-zinc-500">Public Key:</span>
                    <span class="text-zinc-300 font-mono text-xs truncate"
                      >{{ profile.public_key.substring(0, 32) }}...</span
                    >
                  </div>
                  <div class="flex items-center gap-2 text-sm">
                    <span class="text-zinc-500">Registered:</span>
                    <span class="text-zinc-400">{{
                      formatDate(profile.created_at)
                    }}</span>
                  </div>
                </div>
              </div>
            </div>

            <Button
              @click="deleteProfile(profile.id)"
              :disabled="isDeletingId === profile.id"
              variant="ghost"
              size="icon"
              class="text-zinc-500 hover:text-red-500 hover:bg-red-950/20"
            >
              <Loader2
                v-if="isDeletingId === profile.id"
                class="w-4 h-4 animate-spin"
              />
              <Trash2 v-else class="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Empty State -->
    <div
      v-else
      class="text-center py-20 border border-zinc-900 rounded-lg bg-zinc-950"
    >
      <Monitor class="w-16 h-16 text-zinc-700 mx-auto mb-4" />
      <h3 class="text-xl font-bold text-zinc-400 mb-2">
        No Devices Registered
      </h3>
      <p class="text-zinc-600">
        Register your first device to start using the VPN service.
      </p>
    </div>
  </div>
</template>
