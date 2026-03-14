import pubgCover from "@/assets/pubg_cover.png";

export interface Server {
  id: string;
  name: string;
  flag: string;
  region: string;
  endpoint: string;
  publicKey: string;
  location: [number, number]; // [latitude, longitude]
  tags?: string[]; // 支援的遊戲 tag
}

export interface Game {
  id: string;
  name: string;
  image: string;
  processName: string; // TslGame.exe
  tag: string; // 新增 tag 屬性
}

// 靜態遊戲清單（不含 servers）
export const GAMES: Game[] = [
  {
    id: "pubg",
    name: "PUBG: BATTLEGROUNDS",
    image: pubgCover,
    processName: "TslGame.exe",
    tag: "pubg",
  },
];

// 取得伺服器清單的 Composition API 實作範例
// 請在 Vue 組件中使用
/*
import { ref, computed, onMounted } from "vue";
import { apiFetch } from "@/lib/apiClient";

const servers = ref<Server[]>([]);
const isLoading = ref(false);
const error = ref<string | null>(null);

async function fetchServers() {
  isLoading.value = true;
  error.value = null;
  try {
    const res = await apiFetch("/api/servers");
    if (!res.ok) throw new Error("Failed to fetch servers");
    servers.value = await res.json();
  } catch (e: any) {
    error.value = e.message || "Unknown error";
  } finally {
    isLoading.value = false;
  }
}

onMounted(fetchServers);

// 假設 currentGameTag 是目前選擇的遊戲 tag
const filteredServers = computed(() =>
  servers.value.filter(server => server.tags?.includes(currentGameTag.value))
);
*/
