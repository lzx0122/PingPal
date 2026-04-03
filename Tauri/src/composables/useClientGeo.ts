import { ref, watch, onMounted } from "vue";
import { apiFetch } from "@/lib/apiClient";
import { useAuthStore } from "@/stores/authStore";

export type ClientGeoResult = {
  location: [number, number];
  country: string;
  ip: string;
};

let sessionCache: ClientGeoResult | null = null;

export function useClientGeo() {
  const authStore = useAuthStore();
  const clientLocation = ref<[number, number] | null>(
    sessionCache?.location ?? null,
  );
  const clientLabel = ref(sessionCache?.country ?? "");
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function load() {
    if (sessionCache) {
      clientLocation.value = sessionCache.location;
      clientLabel.value = sessionCache.country;
      return;
    }
    loading.value = true;
    error.value = null;
    try {
      const ipRes = await fetch("https://api.ipify.org?format=json");
      if (!ipRes.ok) throw new Error("Failed to resolve public IP");
      const { ip } = (await ipRes.json()) as { ip?: string };
      if (!ip) throw new Error("No public IP");

      const lookup = await apiFetch(
        `/api/geo/lookup?ip=${encodeURIComponent(ip)}`,
        { public: true },
      );
      if (!lookup.ok) {
        const errBody = await lookup.json().catch(() => ({}));
        throw new Error(
          (errBody as { error?: string }).error || "Geo lookup failed",
        );
      }
      const data = (await lookup.json()) as ClientGeoResult;
      sessionCache = {
        location: data.location,
        country: data.country || "",
        ip: data.ip,
      };
      clientLocation.value = data.location;
      clientLabel.value = data.country || "Approx. location";
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Geo failed";
      clientLocation.value = null;
      clientLabel.value = "";
    } finally {
      loading.value = false;
    }
  }

  watch(
    () => authStore.token,
    (token, prev) => {
      if (!token && prev !== undefined) {
        sessionCache = null;
        clientLocation.value = null;
        clientLabel.value = "";
        error.value = null;
      }
    },
  );

  onMounted(() => {
    void load();
  });

  return {
    clientLocation,
    clientLabel,
    loading,
    error,
    load,
  };
}
