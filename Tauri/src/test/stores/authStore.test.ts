import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useAuthStore } from "../../stores/authStore";

const dummyStore = new Map<string, any>();

vi.mock("../../lib/store", () => {
  return {
    setItem: vi.fn(async (k, v) => {
      dummyStore.set(k, v);
    }),
    getItem: vi.fn(async (k) => dummyStore.get(k) || null),
    removeItem: vi.fn(async (k) => {
      dummyStore.delete(k);
    }),
    clearStore: vi.fn(async () => {
      dummyStore.clear();
    }),
  };
});

import * as tauriStore from "../../lib/store";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch as any;

describe("Auth Store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    mockFetch.mockReset();
    dummyStore.clear();
  });

  it("initializes with empty token and user", () => {
    const auth = useAuthStore();
    expect(auth.isAuthenticated).toBe(false);
    expect(auth.token).toBeNull();
    expect(auth.username).toBeNull();
  });

  it("login sets token and username on success", async () => {
    const auth = useAuthStore();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token: "test_token", username: "test_user" }),
    });

    const result = await auth.login("test_user", "password123");

    expect(result).toBe(true);
    expect(auth.loginError).toBeNull();
    expect(auth.token).toBe("test_token");
    expect(auth.username).toBe("test_user");
    expect(auth.isAuthenticated).toBe(true);

    expect(tauriStore.setItem).toHaveBeenCalledWith("auth_token", "test_token");
    expect(tauriStore.setItem).toHaveBeenCalledWith("username", "test_user");
  });

  it("login handles failure correctly", async () => {
    const auth = useAuthStore();
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Invalid credentials" }),
    });

    const result = await auth.login("user", "wrong_pass");

    expect(result).toBe(false);
    expect(auth.token).toBeNull();
    expect(auth.loginError).toBe("Invalid credentials");
    expect(tauriStore.setItem).not.toHaveBeenCalled();
  });

  it("logout removes state and clears store", async () => {
    const auth = useAuthStore();
    auth.token = "some_token";
    auth.username = "user";
    auth.loginError = "x";

    await auth.logout();

    expect(auth.token).toBeNull();
    expect(auth.username).toBeNull();
    expect(auth.loginError).toBeNull();
    expect(auth.isAuthenticated).toBe(false);

    expect(tauriStore.removeItem).toHaveBeenCalledWith("auth_token");
    expect(tauriStore.removeItem).toHaveBeenCalledWith("username");
  });

  it("getAuthHeaders returns Bearer token if present", () => {
    const auth = useAuthStore();

    expect(auth.getAuthHeaders()).toEqual({});

    auth.token = "my_secret";
    expect(auth.getAuthHeaders()).toEqual({
      Authorization: "Bearer my_secret",
    });
  });

  it("loadState hydrates from Tauri Store", async () => {
    const auth = useAuthStore();

    vi.mocked(tauriStore.getItem).mockImplementation(async (key) => {
      if (key === "auth_token") return "hydrated_token";
      if (key === "username") return "hydrated_user";
      return null;
    });

    await auth.loadState();

    expect(auth.token).toBe("hydrated_token");
    expect(auth.username).toBe("hydrated_user");
    expect(auth.isAuthenticated).toBe(true);
  });
});
