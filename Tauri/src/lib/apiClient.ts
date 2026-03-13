import { useAuthStore } from "../stores/authStore";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

/**
 * Centralized API request wrapper.
 * Automatically attaches Authorization header and logs out on 401 response.
 */
export async function apiFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const authStore = useAuthStore();

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...authStore.getAuthHeaders(),
      ...(options.headers as Record<string, string>),
    },
  });

  if (response.status === 401) {
    authStore.logout();
    throw new Error("Session expired. Please login again.");
  }

  return response;
}
