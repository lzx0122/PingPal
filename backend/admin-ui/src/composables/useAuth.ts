import { ref, computed } from "vue";

const token = ref<string | null>(localStorage.getItem("token"));
const username = ref<string | null>(localStorage.getItem("username"));

export function useAuth() {
  const isAuthenticated = computed(() => !!token.value);

  async function login(user: string, pass: string) {
    try {
      const response = await fetch("/api/auth/admin-login", {
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

      localStorage.setItem("token", data.token);
      localStorage.setItem("username", data.username);

      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  }

  function logout() {
    token.value = null;
    username.value = null;
    localStorage.removeItem("token");
    localStorage.removeItem("username");
  }

  function getAuthHeaders(): Record<string, string> {
    return token.value ? { Authorization: `Bearer ${token.value}` } : {};
  }

  return {
    token, // readonly in components mostly
    username,
    isAuthenticated,
    login,
    logout,
    getAuthHeaders,
  };
}
