import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { setItem, getItem, removeItem } from "../lib/store";

export const useVpnStore = defineStore("vpn", () => {
  const profileId = ref<string | null>(null);
  const privateKey = ref<string | null>(null);
  const serverEndpoint = ref<string | null>(null);
  const address = ref<string | null>(null);

  const isConfigured = computed(() => !!profileId.value && !!privateKey.value);

  async function migrateLegacyLocalStorage() {
    if (typeof localStorage === "undefined") return;
    const raw = localStorage.getItem("vpn_config");
    if (!raw) return;
    if (profileId.value && privateKey.value) {
      localStorage.removeItem("vpn_config");
      return;
    }
    try {
      const parsed = JSON.parse(raw) as {
        profileId?: string;
        privateKey?: string;
        serverEndpoint?: string;
        address?: string;
      };
      if (parsed.profileId && parsed.privateKey) {
        await saveConfig(
          parsed.profileId,
          parsed.privateKey,
          parsed.serverEndpoint ?? "",
          parsed.address ?? "",
        );
      }
    } catch {
    } finally {
      localStorage.removeItem("vpn_config");
    }
  }

  async function loadState() {
    profileId.value = (await getItem<string>("vpn_profile_id")) || null;
    privateKey.value = (await getItem<string>("vpn_private_key")) || null;
    serverEndpoint.value =
      (await getItem<string>("vpn_server_endpoint")) || null;
    address.value = (await getItem<string>("vpn_address")) || null;
    await migrateLegacyLocalStorage();
  }

  async function saveConfig(
    id: string,
    key: string,
    endpoint: string,
    ipAddr: string,
  ) {
    profileId.value = id;
    privateKey.value = key;
    serverEndpoint.value = endpoint;
    address.value = ipAddr;

    await setItem("vpn_profile_id", id);
    await setItem("vpn_private_key", key);
    await setItem("vpn_server_endpoint", endpoint);
    await setItem("vpn_address", ipAddr);
  }

  async function clearConfig() {
    profileId.value = null;
    privateKey.value = null;
    serverEndpoint.value = null;
    address.value = null;

    await removeItem("vpn_profile_id");
    await removeItem("vpn_private_key");
    await removeItem("vpn_server_endpoint");
    await removeItem("vpn_address");
  }

  function getVpnConfig() {
    return {
      profileId: profileId.value,
      privateKey: privateKey.value,
      serverEndpoint: serverEndpoint.value,
      address: address.value,
    };
  }

  return {
    profileId,
    privateKey,
    serverEndpoint,
    address,
    isConfigured,
    loadState,
    saveConfig,
    clearConfig,
    getVpnConfig,
  };
});
