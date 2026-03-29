<script setup lang="ts">
import { computed } from "vue";
import { RouterLink, RouterView, useRoute, useRouter } from "vue-router";
import {
  Zap,
  Gamepad2,
  Server as ServerIcon,
  LogOut,
  LayoutDashboard,
  Settings,
  ChevronLeft,
} from "lucide-vue-next";
import TitleBar from "@/components/TitleBar.vue";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/authStore";
import { useWireGuardSession } from "@/composables/useWireGuardSession";

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const { status, isConnected, currentPing } = useWireGuardSession();

const isGameDetail = computed(() => route.name === "game-detail");

function goBackFromGame() {
  router.push({ name: "library" });
}
</script>

<template>
  <div
    class="h-screen w-full bg-black text-zinc-100 flex flex-col overflow-hidden font-sans selection:bg-white selection:text-black"
  >
    <TitleBar />

    <div class="flex-1 flex overflow-hidden">
      <aside class="w-64 bg-black border-r border-zinc-900 flex flex-col">
        <RouterLink
          to="/library"
          class="p-6 flex items-center gap-3 cursor-pointer group"
        >
          <div
            class="w-8 h-8 flex items-center justify-center bg-white text-black rounded-md shadow-lg shadow-zinc-800/20 group-hover:scale-105 transition-transform duration-300"
          >
            <Zap class="w-5 h-5 fill-current" />
          </div>
          <div>
            <h1
              class="text-lg font-bold text-white tracking-tight leading-none"
            >
              NigPing
            </h1>
            <span
              class="text-[10px] text-zinc-500 font-mono tracking-widest uppercase"
              >Accelerator</span
            >
          </div>
        </RouterLink>

        <nav class="flex-1 px-3 space-y-1">
          <RouterLink v-slot="{ isActive, navigate }" to="/library" custom>
            <Button
              variant="ghost"
              class="w-full justify-start gap-3 h-10 font-medium"
              :class="
                isActive
                  ? 'bg-zinc-900 text-white'
                  : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900/50'
              "
              @click="navigate"
            >
              <Gamepad2 class="w-4 h-4" />
              Game Library
            </Button>
          </RouterLink>

          <RouterLink v-slot="{ isActive, navigate }" to="/dashboard" custom>
            <Button
              variant="ghost"
              class="w-full justify-start gap-3 h-10 font-medium"
              :class="
                isActive
                  ? 'bg-zinc-900 text-white'
                  : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900/50'
              "
              @click="navigate"
            >
              <LayoutDashboard class="w-4 h-4" />
              Dashboard
            </Button>
          </RouterLink>

          <RouterLink v-slot="{ isActive, navigate }" to="/devices" custom>
            <Button
              variant="ghost"
              class="w-full justify-start gap-3 h-10 font-medium"
              :class="
                isActive
                  ? 'bg-zinc-900 text-white'
                  : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900/50'
              "
              @click="navigate"
            >
              <ServerIcon class="w-4 h-4" />
              Device Management
            </Button>
          </RouterLink>

          <RouterLink v-slot="{ isActive, navigate }" to="/settings" custom>
            <Button
              variant="ghost"
              class="w-full justify-start gap-3 h-10 font-medium"
              :class="
                isActive
                  ? 'bg-zinc-900 text-white'
                  : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900/50'
              "
              @click="navigate"
            >
              <Settings class="w-4 h-4" />
              Settings
            </Button>
          </RouterLink>
        </nav>

        <div class="p-6 border-t border-zinc-900 space-y-3">
          <Button
            variant="ghost"
            class="w-full justify-start gap-3 h-10 font-medium text-zinc-500 hover:text-red-400 hover:bg-zinc-900/50"
            @click="authStore.logout(); router.push({ name: 'login' })"
          >
            <LogOut class="w-4 h-4" />
            Logout
          </Button>
          <div
            class="flex items-center justify-between text-xs text-zinc-600 font-mono"
          >
            <span>v0.1.0 Beta</span>
            <div class="w-2 h-2 rounded-full bg-zinc-800 animate-pulse"></div>
          </div>
        </div>
      </aside>

      <main class="flex-1 flex flex-col relative bg-zinc-950">
        <header
          class="h-16 border-b border-zinc-900 bg-black/80 backdrop-blur flex items-center justify-between px-8 z-10 sticky top-0"
        >
          <div class="flex items-center gap-4">
            <Button
              v-if="isGameDetail"
              variant="outline"
              size="icon"
              class="w-8 h-8 rounded-full border-zinc-800 bg-black hover:bg-zinc-900 hover:border-zinc-700 transition-all mr-2"
              @click="goBackFromGame"
            >
              <ChevronLeft class="w-4 h-4" />
            </Button>

            <div
              class="flex items-center gap-3 px-4 py-1.5 rounded-full bg-zinc-900 border border-zinc-800"
            >
              <div
                class="relative flex items-center justify-center w-2.5 h-2.5"
              >
                <div
                  class="absolute w-full h-full rounded-full animate-ping opacity-75"
                  :class="isConnected ? 'bg-white' : 'bg-transparent'"
                ></div>
                <div
                  class="relative w-2 h-2 rounded-full transition-colors duration-500"
                  :class="
                    isConnected
                      ? 'bg-white shadow-[0_0_8px_white]'
                      : 'bg-zinc-600'
                  "
                ></div>
              </div>
              <span class="text-xs font-medium text-zinc-300 tracking-wide">{{
                status
              }}</span>
            </div>
          </div>

          <div v-if="isConnected" class="flex items-center gap-6">
            <div class="flex flex-col items-end">
              <span
                class="text-[10px] text-zinc-500 font-bold uppercase tracking-wider"
                >Ping</span
              >
              <span class="text-lg font-mono font-bold leading-none"
                >{{ currentPing
                }}<span class="text-sm text-zinc-600 ml-1">ms</span></span
              >
            </div>
          </div>
        </header>

        <div class="flex-1 p-8 overflow-auto">
          <RouterView />
        </div>
      </main>
    </div>
  </div>
</template>
