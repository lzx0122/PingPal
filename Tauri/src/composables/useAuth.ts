import { ref, computed } from "vue";

const token = ref<string | null>(localStorage.getItem("auth_token"));
const username = ref<string | null>(localStorage.getItem("username"));

// API URL from environment variable, fallback to localhost
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export function useAuth() {
  const isAuthenticated = computed(() => !!token.value);

  async function login(user: string, pass: string): Promise<boolean> {
    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: user, password: pass }),
      });

      if (!response.ok) {
        throw new Error("Invalid credentials");
      }

      const data = await response.json();

      token.value = data.token;
      username.value = data.username;

      localStorage.setItem("auth_token", data.token);
      localStorage.setItem("username", data.username);

      return true;
    } catch (e) {
      console.error("Login Error:", e);
      return false;
    }
  }

  function logout() {
    token.value = null;
    username.value = null;
    localStorage.removeItem("auth_token");
    localStorage.removeItem("username");
  }

  function getAuthHeaders(): Record<string, string> {
    return token.value ? { Authorization: `Bearer ${token.value}` } : {};
  }

  return {
    token,
    username,
    isAuthenticated,
    login,
    logout,
    getAuthHeaders,
  };
}
