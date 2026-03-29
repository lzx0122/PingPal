<script setup lang="ts">
import { ref, onMounted, watch, computed } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { apiFetch } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Zap,
  Gamepad2,
  ChevronLeft,
  Server as ServerIcon,
  Play,
  StopCircle,
  LogOut,
} from "lucide-vue-next";
import { GAMES, type Game, type Server } from "@/data/games";

// Dynamic server data
const allServers = ref<Server[]>([]);
const isServersLoading = ref(false);

// Load all servers and inject filtered servers by tag into each game
async function fetchServers() {
  isServersLoading.value = true;
  try {
    const res = await apiFetch("/api/servers");
    if (!res.ok) throw new Error("Failed to fetch servers");
    const servers: Server[] = await res.json();
    allServers.value = servers;
  } catch (e) {
    console.error(e);
    allServers.value = [];
  } finally {
    isServersLoading.value = false;
  }
}

onMounted(() => {
  fetchServers();
});

// Filter servers by tag and return a new games array
const gamesWithServers = computed(() => {
  return GAMES.map((game) => ({
    ...game,
    servers: allServers.value.filter((s) => s.tags?.includes(game.tag)),
  }));
});
import TitleBar from "@/components/TitleBar.vue";
import Login from "@/components/Login.vue";
import VPNRegistration from "@/components/VPNRegistration.vue";
import DeviceManager from "@/components/DeviceManager.vue";
import GameDetails from "@/components/game/GameDetails.vue";
import { useAuthStore } from "@/stores/authStore";
import { useVpnProfile } from "@/composables/useVpnProfile";
import { useVpnStore } from "@/stores/vpnStore";

const authStore = useAuthStore();
const { connectToServer, fetchProfiles, profiles } = useVpnProfile();
const vpnStore = useVpnStore();

  // Dynamic server data
type ViewState = "home" | "details" | "register" | "devices";
const currentView = ref<ViewState>("home");
const selectedGame = ref<Game | null>(null);
const selectedServer = ref<Server | null>(null);
  // Fetch all servers from API

const status = ref("Ready");
const isConnected = ref(false);
const isLoading = ref(false);
const currentPing = ref(0);

const vpnConfig = ref<any>(null);
const localProfileId = ref<string | null>(null);

onMounted(async () => {
  await authStore.loadState();
  const stored = localStorage.getItem("vpn_config");
  if (stored) {
    try {
      vpnConfig.value = JSON.parse(stored);
      localProfileId.value = vpnConfig.value.profileId || null;
    } catch (e) {
      console.error("Failed to parse VPN config", e);
      localStorage.removeItem("vpn_config");
      vpnConfig.value = null;
  // Map games with filtered servers by tag
      localProfileId.value = null;
    }
  }
  // After login, check if local profileId still exists on server
  if (authStore.isAuthenticated) {
    await fetchProfiles();
    checkProfileBinding();
  }
});

// Check if local profileId still exists in server device list
async function checkProfileBinding() {
  if (!localProfileId.value) return;
  const exists = profiles.value.some((p) => p.id === localProfileId.value);
  if (!exists) {
    // Local profileId was deleted, clear config and go to registration
    localStorage.removeItem("vpn_config");
    vpnConfig.value = null;
    localProfileId.value = null;
    currentView.value = "register";
  }
}

watch(
  [() => authStore.isAuthenticated, vpnConfig],
  async ([isAuth, config]) => {
    if (isAuth) {
      if (!config) {
        currentView.value = "register";
      } else if (currentView.value === "register") {
        currentView.value = "home";
      }
      // Check profile binding on every login or config change
      await fetchProfiles();
      checkProfileBinding();
    }
  },
  { immediate: true },
);

// When entering details, filter servers by tag
const goToDetails = (game: Game) => {
  selectedGame.value = game;
  // Get the servers corresponding to the selected game
  const servers = allServers.value.filter((s) => s.tags?.includes(game.tag));
  if (servers.length > 0) {
    selectedServer.value = servers[0];
  } else {
    selectedServer.value = null;
  }
  fetchGameRanges(game.id);
  currentView.value = "details";
};

  // Check if local profileId still exists in server device list
const goToHome = () => {
  currentView.value = "home";
  selectedGame.value = null;
};

const handleProfileRegistered = (config: any) => {
  vpnConfig.value = config;
  localStorage.setItem("vpn_config", JSON.stringify(config));
  localProfileId.value = config.profileId || null;
  currentView.value = "home";
};

const gameIpRanges = ref<Set<string>>(new Set());

const fetchGameRanges = async (gameId: string) => {
  try {
    const response = await apiFetch(`/api/games/${gameId}/ranges`);

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }

    const ranges = (await response.json()) as string[];
    gameIpRanges.value.clear();
    ranges.forEach((range) => gameIpRanges.value.add(range));
  } catch (error) {
    console.error(`Failed to fetch IP ranges for ${gameId}:`, error);
  }
};

  // When entering details, filter servers by tag
const getWgConfig = (serverConfig: any) => {
  const allowedIps = Array.from(gameIpRanges.value).join(", ");

  if (!vpnConfig.value) {
    throw new Error("No VPN configuration found. Please register first.");
  }

  const routeIps = allowedIps || "0.0.0.0/0";

  return `
[Interface]
PrivateKey = ${vpnConfig.value.privateKey}
Address = ${serverConfig.assigned_ip}
DNS = 1.1.1.1
MTU = 1280

[Peer]
PublicKey = ${serverConfig.server_public_key}
PresharedKey = JbLLJPvjfXhykHg8mDrNdonHhNTlAYZNh9v3u8bbNzI=
AllowedIPs = ${routeIps}
Endpoint = ${serverConfig.server_endpoint}
PersistentKeepalive = 25
`;
};

const handleConnect = async () => {
  if (!vpnConfig.value || !vpnConfig.value.profileId) {
    alert("Please register a VPN profile first.");
    return;
  }

  if (!selectedServer.value) {
    alert("Please select a server.");
    return;
  }

  isLoading.value = true;
  status.value = "Connecting...";

  try {
    const serverConfig = await connectToServer(
      vpnConfig.value.profileId,
      selectedServer.value.endpoint.split(":")[0],
    );

    console.log("VPN connect response:", {
      serverPublicKey: serverConfig?.server_public_key,
      serverEndpoint: serverConfig?.server_endpoint,
      assignedIp: serverConfig?.assigned_ip,
    });

    const configContent = getWgConfig(serverConfig);
    const ipv4 = serverConfig.assigned_ip.split("/")[0];

    await invoke("connect_korea", {
      configContent,
      ipv4Address: ipv4,
    });

    status.value = `Connected - ${serverConfig.server_endpoint}`;
    isConnected.value = true;
    currentPing.value = Math.floor(Math.random() * 10) + 20;
  } catch (error) {
    console.error(error);
    status.value = "Connection failed: " + error;
  } finally {
    isLoading.value = false;
  }
};

const handleDisconnect = async () => {
  isLoading.value = true;
  status.value = "Disconnecting...";

  try {
    await invoke("disconnect_vpn");
    status.value = "Ready";
    isConnected.value = false;
    currentPing.value = 0;
  } catch (error) {
    status.value = "Disconnect failed: " + error;
  } finally {
    isLoading.value = false;
  }
};
</script>

<template>
  <Login v-if="!authStore.isAuthenticated" />

  <!-- Registration View -->
  <div
    v-else-if="currentView === 'register'"
    class="h-screen w-full bg-black text-white flex items-center justify-center"
  >
    <VPNRegistration
      @profile-registered="handleProfileRegistered"
      @go-to-devices="currentView = 'devices'"
    />
  </div>

  <!-- Main App -->
  <div
    v-else
    class="h-screen w-full bg-black text-zinc-100 flex flex-col overflow-hidden font-sans selection:bg-white selection:text-black"
  >
    <!-- Custom Title Bar -->
    <TitleBar />

    <!-- Main App Content -->
    <div class="flex-1 flex overflow-hidden">
      <!-- Sidebar -->
      <aside class="w-64 bg-black border-r border-zinc-900 flex flex-col">
        <div
          class="p-6 flex items-center gap-3 cursor-pointer group"
          @click="goToHome"
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
        </div>

        <nav class="flex-1 px-3 space-y-1">
          <Button
            variant="ghost"
            class="w-full justify-start gap-3 h-10 font-medium"
            :class="
              currentView === 'home'
                ? 'bg-zinc-900 text-white'
                : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900/50'
            "
            @click="goToHome"
          >
            <Gamepad2 class="w-4 h-4" />
            Game Library
          </Button>

          <Button
            variant="ghost"
            class="w-full justify-start gap-3 h-10 font-medium"
            :class="
              currentView === 'devices'
                ? 'bg-zinc-900 text-white'
                : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900/50'
            "
            @click="currentView = 'devices'"
          >
            <ServerIcon class="w-4 h-4" />
            Device Management
          </Button>
        </nav>

        <div class="p-6 border-t border-zinc-900 space-y-3">
          <Button
            variant="ghost"
            class="w-full justify-start gap-3 h-10 font-medium text-zinc-500 hover:text-red-400 hover:bg-zinc-900/50"
            @click="authStore.logout()"
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

      <!-- Main Content -->
      <main class="flex-1 flex flex-col relative bg-zinc-950">
        <!-- Top Bar -->
        <header
          class="h-16 border-b border-zinc-900 bg-black/80 backdrop-blur flex items-center justify-between px-8 z-10 sticky top-0"
        >
          <div class="flex items-center gap-4">
            <!-- Back Button -->
            <Button
              v-if="currentView === 'details'"
              variant="outline"
              size="icon"
              @click="goToHome"
              class="w-8 h-8 rounded-full border-zinc-800 bg-black hover:bg-zinc-900 hover:border-zinc-700 transition-all mr-2"
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

        <!-- Content Area -->
        <div class="flex-1 p-8 overflow-auto">
          <!-- View: Home (Game List) -->
          <div v-if="currentView === 'home'" class="max-w-6xl mx-auto">
            <div
              class="flex items-end justify-between mb-8 border-b border-zinc-900 pb-4"
            >
              <h2 class="text-3xl font-bold tracking-tight text-white">
                Game Library
              </h2>
              <span class="text-sm text-zinc-500"
                >{{ GAMES.length }} GAMES AVAILABLE</span
              >
            </div>

            <div
              class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
            >
              <Card
                v-for="game in gamesWithServers"
                :key="game.id"
                class="bg-zinc-900 border-zinc-800 hover:border-zinc-600 hover:bg-zinc-800 transition-all duration-300 group relative overflow-hidden cursor-pointer h-[280px]"
                @click="goToDetails(game)"
              >
                <div
                  class="absolute inset-0 bg-cover bg-center opacity-60 group-hover:opacity-80 transition-all duration-500"
                  :style="{ backgroundImage: `url(${game.image})` }"
                ></div>
                <div
                  class="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-transparent"
                ></div>

                <CardHeader
                  class="relative z-10 h-full flex flex-col justify-end p-6"
                >
                  <CardTitle class="text-xl font-bold text-white mb-1">{{
                    game.name
                  }}</CardTitle>
                  <div class="text-xs text-zinc-400 mt-1">
                    <template v-if="isServersLoading">Loading servers...</template>
                    <template v-else>{{ game.servers.length }} servers</template>
                  </div>
                </CardHeader>
              </Card>
            </div>
          </div>

          <!-- View: Device Management -->
          <div v-else-if="currentView === 'devices'">
            <!-- Banner: Guide user back to register after freeing up a slot -->
            <div
              v-if="!vpnConfig"
              class="mb-6 p-4 bg-zinc-900 border border-zinc-700 rounded-lg flex items-center justify-between gap-4"
            >
              <div class="flex items-center gap-3 text-sm text-zinc-400">
                <span class="text-amber-400 text-lg"></span>
                After deleting old device, click the button on the right to complete registration
              </div>
              <Button
                size="sm"
                class="bg-white text-black hover:bg-zinc-200 font-bold shrink-0"
                @click="currentView = 'register'"
              >
                Go to Register
              </Button>
            </div>
            <DeviceManager />
          </div>

          <!-- View: Game Details (Server Select) -->
          <GameDetails
            v-else-if="currentView === 'details' && selectedGame"
            :game="selectedGame!"
            :servers="allServers.filter(s => s.tags?.includes(selectedGame!.tag))"
            v-model="selectedServer"
            :loading="isServersLoading"
            :is-connected="isConnected"
            :is-loading="isLoading"
            :vpn-config="vpnConfig"
            :game-ip-ranges="gameIpRanges"
            @connect="handleConnect"
            @disconnect="handleDisconnect"
          >
            <template #play-icon><Play class="w-4 h-4 mr-2 fill-current" /></template>
            <template #stop-icon><StopCircle class="w-4 h-4 mr-2" /></template>
          </GameDetails>
        </div>
      </main>
    </div>
  </div>
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
