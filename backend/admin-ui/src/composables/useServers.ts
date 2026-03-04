import { ref, computed } from "vue";
import type { Server, ServerStats } from "../types/server";
import { useAuth } from "./useAuth";

const API_BASE = "/api";

export function useServers() {
  const { getAuthHeaders, logout } = useAuth();
  const servers = ref<Server[]>([]);

  const loading = ref(false);
  const error = ref<string | null>(null);
  const searchQuery = ref("");

  // Computed filtered servers
  const filteredServers = computed(() => {
    if (!searchQuery.value) return servers.value;
    const query = searchQuery.value.toLowerCase();
    return servers.value.filter(
      (s) =>
        s.ip.toLowerCase().includes(query) ||
        s.region.toLowerCase().includes(query),
    );
  });

  // Computed stats
  const stats = computed<ServerStats>(() => {
    const byRegion: Record<string, number> = {};
    servers.value.forEach((server) => {
      byRegion[server.region] = (byRegion[server.region] || 0) + 1;
    });
    return {
      total: servers.value.length,
      byRegion,
    };
  });

  // Fetch all servers
  async function fetchServers() {
    loading.value = true;
    error.value = null;
    try {
      const response = await fetch(`${API_BASE}/servers`, {
        headers: getAuthHeaders(),
      });
      if (response.status === 401) {
        logout();
        throw new Error("Session expired. Please login again.");
      }
      if (!response.ok) throw new Error("Failed to fetch servers");
      servers.value = await response.json();
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Unknown error";
    } finally {
      loading.value = false;
    }
  }

  // Add new server
  async function addServer(ip: string, region: string) {
    loading.value = true;
    error.value = null;
    try {
      const response = await fetch(`${API_BASE}/servers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ ip, region }),
      });
      if (response.status === 401) {
        logout();
        throw new Error("Session expired");
      }
      if (!response.ok) throw new Error("Failed to add server");

      await fetchServers();
      return true;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Unknown error";
      return false;
    } finally {
      loading.value = false;
    }
  }

  // Update server
  async function updateServer(oldIp: string, newIp: string, region: string) {
    loading.value = true;
    error.value = null;
    try {
      const response = await fetch(
        `${API_BASE}/servers/${encodeURIComponent(oldIp)}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...getAuthHeaders(),
          },
          body: JSON.stringify({ ip: newIp, region }),
        },
      );
      if (response.status === 401) {
        logout();
        throw new Error("Session expired");
      }

      if (!response.ok) throw new Error("Failed to update server");
      await fetchServers();
      return true;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Unknown error";
      return false;
    } finally {
      loading.value = false;
    }
  }

  // Delete server
  async function deleteServer(ip: string) {
    loading.value = true;
    error.value = null;
    try {
      const response = await fetch(
        `${API_BASE}/servers/${encodeURIComponent(ip)}`,
        {
          method: "DELETE",
          headers: getAuthHeaders(),
        },
      );
      if (response.status === 401) {
        logout();
        throw new Error("Session expired");
      }

      if (!response.ok) throw new Error("Failed to delete server");
      await fetchServers();
      return true;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Unknown error";
      return false;
    } finally {
      loading.value = false;
    }
  }

  return {
    servers,
    filteredServers,
    stats,
    loading,
    error,
    searchQuery,
    fetchServers,
    addServer,
    updateServer,
    deleteServer,
  };
}
