import type { RouteLocationNormalized, NavigationGuardNext } from "vue-router";
import { createRouter, createWebHashHistory } from "vue-router";
import { useAuthStore } from "../stores/authStore";
import { useVpnStore } from "../stores/vpnStore";
import { isProfileOnServer } from "../lib/vpnProfileCheck";

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: "/login",
      name: "login",
      component: () => import("../components/Login.vue"),
      meta: { public: true },
    },
    {
      path: "/register",
      name: "register",
      component: () => import("../views/RegisterView.vue"),
      meta: { requiresAuth: true },
    },
    {
      path: "/",
      component: () => import("../layouts/MainLayout.vue"),
      meta: { requiresAuth: true, requiresVpn: true },
      children: [
        { path: "", redirect: { name: "library" } },
        {
          path: "library",
          name: "library",
          component: () => import("../views/GameLibraryView.vue"),
        },
        {
          path: "games/:gameId",
          name: "game-detail",
          component: () => import("../views/GameDetailView.vue"),
          props: true,
        },
        {
          path: "devices",
          name: "devices",
          component: () => import("../views/DevicesView.vue"),
        },
        {
          path: "dashboard",
          name: "dashboard",
          component: () => import("../views/DashboardView.vue"),
        },
        {
          path: "settings",
          name: "settings",
          component: () => import("../views/SettingsView.vue"),
        },
      ],
    },
  ],
});

router.beforeEach(
  async (
    to: RouteLocationNormalized,
    _from: RouteLocationNormalized,
    next: NavigationGuardNext,
  ) => {
    const authStore = useAuthStore();
    const vpnStore = useVpnStore();

    if (authStore.token === null) {
      await authStore.loadState();
    }

    const isAuthenticated = authStore.isAuthenticated;

    if (to.meta.public) {
      if (isAuthenticated && to.name === "login") {
        return next({ name: "library" });
      }
      return next();
    }

    if (!isAuthenticated) {
      return next({ name: "login" });
    }

    await vpnStore.loadState();

    if (to.name === "register" && vpnStore.isConfigured) {
      return next({ name: "library" });
    }

    if (!vpnStore.isConfigured && to.name !== "register") {
      return next({ name: "register" });
    }

    if (vpnStore.isConfigured && vpnStore.profileId) {
      const ok = await isProfileOnServer(vpnStore.profileId);
      if (!ok) {
        await vpnStore.clearConfig();
        if (to.name !== "register") {
          return next({ name: "register" });
        }
      }
    }

    return next();
  },
);

export default router;
