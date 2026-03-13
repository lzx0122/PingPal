<script setup lang="ts">
import { ref, onMounted } from "vue";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Monitor, Trash2, Loader2, AlertCircle } from "lucide-vue-next";
import { useVpnProfile } from "@/composables/useVpnProfile";

const { profiles, isLoading, error, fetchProfiles, deleteProfile } =
  useVpnProfile();

const isDeletingId = ref<string | null>(null);

onMounted(() => {
  fetchProfiles();
});

async function handleDelete(profileId: string) {
  if (
    !confirm(
      "Are you sure you want to delete this device? You will need to re-register to use VPN.",
    )
  ) {
    return;
  }
  try {
    isDeletingId.value = profileId;
    await deleteProfile(profileId);
  } catch {
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
      <span
        class="text-sm font-mono px-3 py-1 rounded-full border"
        :class="
          profiles.length >= 5
            ? 'text-red-400 border-red-900 bg-red-950/30'
            : 'text-zinc-500 border-zinc-800'
        "
      >
        {{ profiles.length }}/5 DEVICES
      </span>
    </div>

    <div
      v-if="error"
      class="mb-6 p-4 bg-red-900/20 border border-red-900 rounded-lg flex items-center gap-3 text-red-500"
    >
      <AlertCircle class="w-5 h-5 flex-shrink-0" />
      <span>{{ error }}</span>
    </div>

    <div
      v-if="isLoading && profiles.length === 0"
      class="flex items-center justify-center py-20 text-zinc-500"
    >
      <Loader2 class="w-8 h-8 animate-spin" />
    </div>

    <div v-else-if="profiles.length > 0" class="space-y-4">
      <div
        v-if="profiles.length >= 5"
        class="p-3 bg-amber-950/30 border border-amber-900/50 rounded-lg flex items-center gap-3 text-amber-400 text-sm"
      >
        <AlertCircle class="w-4 h-4 flex-shrink-0" />
        Device limit reached (5/5). Delete an existing device before registering
        a new one.
      </div>

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
              @click="handleDelete(profile.id)"
              :disabled="isDeletingId === profile.id || isLoading"
              variant="ghost"
              size="icon"
              class="text-zinc-500 hover:text-red-500 hover:bg-red-950/20 transition-colors"
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
