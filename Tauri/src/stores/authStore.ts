import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { setItem, getItem, removeItem } from "../lib/store";
import { apiFetch, configureApiClient } from "../lib/apiClient";

interface LoginResponseDto {
  token: string;
  username: string;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const pad = (4 - (base64.length % 4)) % 4;
    const padded = base64 + "=".repeat(pad);
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getTokenExpiry(token: string): number | null {
  const decoded = decodeJwtPayload(token);
  if (!decoded || typeof decoded.exp !== "number") return null;
  return decoded.exp;
}

function isTokenExpired(token: string): boolean {
  const exp = getTokenExpiry(token);
  if (exp === null) return false;
  return Date.now() / 1000 > exp - 30;
}

async function parseLoginErrorMessage(response: Response): Promise<string> {
  const fallback = "Invalid credentials";
  try {
    const body = (await response.json()) as {
      message?: string;
      error?: string;
    };
    return body.message || body.error || fallback;
  } catch {
    return fallback;
  }
}

export const useAuthStore = defineStore("auth", () => {
  const token = ref<string | null>(null);
  const username = ref<string | null>(null);
  const loginError = ref<string | null>(null);

  const isAuthenticated = computed(() => !!token.value);

  function clearLoginError() {
    loginError.value = null;
  }

  async function loadState() {
    try {
      const storedToken = (await getItem<string>("auth_token")) || null;

      if (storedToken && isTokenExpired(storedToken)) {
        console.warn("[authStore] Token expired on load, clearing session.");
        token.value = null;
        username.value = null;
        await removeItem("auth_token");
        await removeItem("username");
        return;
      }

      token.value = storedToken;
      username.value = (await getItem<string>("username")) || null;
    } catch (e) {
      console.warn("[authStore] loadState failed, session cleared.", e);
      token.value = null;
      username.value = null;
    }
  }

  async function login(user: string, pass: string): Promise<boolean> {
    clearLoginError();

    try {
      const response = await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: user, password: pass }),
        public: true,
      });

      if (!response.ok) {
        loginError.value = await parseLoginErrorMessage(response);
        return false;
      }

      let data: LoginResponseDto;
      try {
        data = (await response.json()) as LoginResponseDto;
      } catch {
        loginError.value = "Invalid response from server";
        return false;
      }

      if (
        typeof data.token !== "string" ||
        data.token.length === 0 ||
        typeof data.username !== "string"
      ) {
        loginError.value = "Invalid response from server";
        return false;
      }

      token.value = data.token;
      username.value = data.username;

      await setItem("auth_token", data.token);
      await setItem("username", data.username);

      return true;
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Login failed. Please try again.";
      loginError.value = msg;
      console.error("Login Error:", e);
      return false;
    }
  }

  async function logout() {
    token.value = null;
    username.value = null;
    clearLoginError();
    await removeItem("auth_token");
    await removeItem("username");
  }

  function getAuthHeaders(): Record<string, string> {
    return token.value ? { Authorization: `Bearer ${token.value}` } : {};
  }

  configureApiClient({
    getAuthHeaders,
    logout,
  });

  return {
    token,
    username,
    loginError,
    isAuthenticated,
    loadState,
    login,
    logout,
    clearLoginError,
    getAuthHeaders,
  };
});
