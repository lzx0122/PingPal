<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import { invoke } from "@tauri-apps/api/core";
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
import TitleBar from "@/components/TitleBar.vue";
import Login from "@/components/Login.vue";
import VPNRegistration from "@/components/VPNRegistration.vue";
import DeviceManager from "@/components/DeviceManager.vue";
import { useAuth } from "@/composables/useAuth";
import { useVpnProfile } from "@/composables/useVpnProfile";

const { isAuthenticated, logout } = useAuth();
const { connectToServer } = useVpnProfile();

// === State Management ===
type ViewState = "home" | "details" | "register" | "devices";
const currentView = ref<ViewState>("home");
const selectedGame = ref<Game | null>(null);
const selectedServer = ref<Server | null>(null);

const status = ref("服務已就緒");
const isConnected = ref(false);
const isLoading = ref(false);
const currentPing = ref(0);

// === VPN Config ===
const vpnConfig = ref<any>(null);

// Load config from storage on mount
onMounted(() => {
  const stored = localStorage.getItem("vpn_config");
  if (stored) {
    try {
      vpnConfig.value = JSON.parse(stored);
    } catch (e) {
      console.error("Failed to parse VPN config", e);
      localStorage.removeItem("vpn_config");
    }
  }
});

// Watch auth and config to determine view
watch(
  [isAuthenticated, vpnConfig],
  ([isAuth, config]) => {
    if (isAuth) {
      if (!config) {
        currentView.value = "register";
      } else if (currentView.value === "register") {
        currentView.value = "home";
      }
    }
  },
  { immediate: true },
);

// === Navigation ===
const goToDetails = (game: Game) => {
  selectedGame.value = game;
  if (game.servers.length > 0) {
    selectedServer.value = game.servers[0];
  }
  fetchGameRanges(game.id);
  currentView.value = "details";
};

const goToHome = () => {
  currentView.value = "home";
  selectedGame.value = null;
};

const handleProfileRegistered = (config: any) => {
  vpnConfig.value = config;
  localStorage.setItem("vpn_config", JSON.stringify(config));
  currentView.value = "home";
};

// === Game Ranges ===
const gameIpRanges = ref<Set<string>>(new Set());

const fetchGameRanges = async (gameId: string) => {
  try {
    const ranges = (await fetch(
      `http://localhost:3000/api/games/${gameId}/ranges`,
    ).then((res) => res.json())) as string[];

    gameIpRanges.value.clear();
    ranges.forEach((range) => gameIpRanges.value.add(range));
  } catch (error) {
    console.error(`Failed to fetch IP ranges for ${gameId}:`, error);
  }
};

// === Config Generation ===
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
  status.value = `正在連線...`;

  try {
    // Get server config from backend
    const serverConfig = await connectToServer(
      vpnConfig.value.profileId,
      selectedServer.value.endpoint.split(":")[0], // Extract IP from endpoint
    );

    // Generate WireGuard config
    const configContent = getWgConfig(serverConfig);
    const ipv4 = serverConfig.assigned_ip.split("/")[0];

    await invoke("connect_korea", {
      configContent,
      ipv4Address: ipv4,
    });

    status.value = `已連線 - ${serverConfig.server_endpoint}`;
    isConnected.value = true;
    currentPing.value = Math.floor(Math.random() * 10) + 20;
  } catch (error) {
    console.error(error);
    status.value = "連線失敗: " + error;
  } finally {
    isLoading.value = false;
  }
};

const handleDisconnect = async () => {
  isLoading.value = true;
  status.value = "正在停止加速...";

  try {
    await invoke("disconnect_vpn");
    status.value = "服務已就緒";
    isConnected.value = false;
    currentPing.value = 0;
  } catch (error) {
    status.value = "停止失敗: " + error;
  } finally {
    isLoading.value = false;
  }
};
</script>

<template>
  <Login v-if="!isAuthenticated" />

  <!-- Registration View -->
  <div
    v-else-if="currentView === 'register'"
    class="h-screen w-full bg-black text-white flex items-center justify-center"
  >
    <VPNRegistration @profile-registered="handleProfileRegistered" />
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
            遊戲庫
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
            設備管理
          </Button>
        </nav>

        <div class="p-6 border-t border-zinc-900 space-y-3">
          <Button
            variant="ghost"
            class="w-full justify-start gap-3 h-10 font-medium text-zinc-500 hover:text-red-400 hover:bg-zinc-900/50"
            @click="logout"
          >
            <LogOut class="w-4 h-4" />
            登出
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
                遊戲庫
              </h2>
              <span class="text-sm text-zinc-500"
                >{{ GAMES.length }} GAMES AVAILABLE</span
              >
            </div>

            <div
              class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
            >
              <Card
                v-for="game in GAMES"
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
                </CardHeader>
              </Card>
            </div>
          </div>

          <!-- View: Device Management -->
          <div v-else-if="currentView === 'devices'">
            <DeviceManager />
          </div>

          <!-- View: Game Details (Server Select) -->
          <div
            v-else-if="currentView === 'details' && selectedGame"
            class="max-w-5xl mx-auto flex flex-col"
          >
            <div class="flex items-start gap-8">
              <!-- Game Cover -->
              <div
                class="w-64 aspect-[3/4] rounded-lg overflow-hidden bg-zinc-900 border border-zinc-800 relative flex-shrink-0 shadow-2xl"
              >
                <img
                  :src="selectedGame.image"
                  class="w-full h-full object-cover opacity-80"
                />
                <div class="absolute bottom-5 left-5 right-5 z-10">
                  <h1
                    class="text-2xl font-bold leading-tight mb-2 text-white drop-shadow-md"
                  >
                    {{ selectedGame.name }}
                  </h1>
                </div>
              </div>

              <!-- Controls -->
              <div class="flex-1 flex flex-col gap-6">
                <!-- Config Info -->
                <div
                  class="p-4 bg-zinc-900/50 border border-zinc-800 rounded-lg"
                >
                  <h3 class="text-sm font-bold text-zinc-400 mb-2 uppercase">
                    Current VPN Profile
                  </h3>
                  <div class="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span class="text-zinc-600 block text-xs">Device</span>
                      <span class="text-white font-mono">My Device</span>
                    </div>
                    <div>
                      <span class="text-zinc-600 block text-xs"
                        >Server Endpoint</span
                      >
                      <span class="text-white font-mono">{{
                        vpnConfig?.serverEndpoint || "N/A"
                      }}</span>
                    </div>
                    <div>
                      <span class="text-zinc-600 block text-xs"
                        >Assigned IP</span
                      >
                      <span class="text-white font-mono">{{
                        vpnConfig?.address || "N/A"
                      }}</span>
                    </div>
                    <div>
                      <span class="text-zinc-600 block text-xs"
                        >Allowed IPs</span
                      >
                      <span
                        class="text-white font-mono truncate"
                        :title="Array.from(gameIpRanges).join(',')"
                      >
                        {{ gameIpRanges.size }} Ranges Loaded
                      </span>
                    </div>
                  </div>
                </div>

                <!-- Action Button -->
                <div class="mt-auto">
                  <Button
                    v-if="!isConnected"
                    @click="handleConnect"
                    :disabled="isLoading"
                    size="lg"
                    class="w-full bg-white text-black hover:bg-zinc-200 border border-transparent font-bold h-14 text-base tracking-wide shadow-lg shadow-zinc-900/50 transition-all active:scale-[0.98]"
                  >
                    <Play v-if="!isLoading" class="w-4 h-4 mr-2 fill-current" />
                    <div
                      v-else
                      class="w-4 h-4 mr-2 border-2 border-black/30 border-t-black rounded-full animate-spin"
                    ></div>
                    {{ isLoading ? "正在啟動..." : "立即加速" }}
                  </Button>

                  <Button
                    v-else
                    @click="handleDisconnect"
                    :disabled="isLoading"
                    variant="destructive"
                    size="lg"
                    class="w-full h-14 text-base font-bold bg-zinc-900 border border-zinc-800 hover:bg-red-950 hover:border-red-900 hover:text-red-500 text-zinc-300 transition-all active:scale-[0.98]"
                  >
                    <StopCircle v-if="!isLoading" class="w-4 h-4 mr-2" />
                    停止加速
                  </Button>
                </div>
              </div>
            </div>
          </div>
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
