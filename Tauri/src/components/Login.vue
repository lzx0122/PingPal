<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { Loader2, User, Lock, Zap } from "lucide-vue-next";
import { useAuthStore } from "../stores/authStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const authStore = useAuthStore();
const router = useRouter();

const errorMessage = ref("");
const loginEmail = ref("");
const loginPassword = ref("");
const loading = ref(false);

const inputClass =
  "h-11 rounded-[10px] border-[1.5px] border-zinc-800 bg-zinc-950 px-4 py-2.5 text-[0.9375rem] text-white shadow-none placeholder:text-zinc-600 focus-visible:border-white focus-visible:bg-black focus-visible:ring-[3px] focus-visible:ring-white/10";

const handleLogin = async () => {
  errorMessage.value = "";
  if (!loginEmail.value || !loginPassword.value) {
    errorMessage.value = "Please enter username and password";
    return;
  }

  loading.value = true;
  try {
    const success = await authStore.login(
      loginEmail.value,
      loginPassword.value,
    );
    if (!success) {
      errorMessage.value = "Incorrect username or password";
      loginPassword.value = "";
    } else {
      await router.replace({ name: "library" });
    }
  } catch (error: any) {
    console.error("Login error:", error);
    errorMessage.value = error.message || "Login failed, please try again later.";
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <div class="login-container dark">
    <div class="bg-grid"></div>
    <div class="bg-gradient"></div>

    <div class="login-card">
      <div class="logo-section">
        <div class="logo-icon">
          <Zap class="h-8 w-8 fill-current" />
        </div>
        <h1 class="logo-text">NigPing</h1>
        <p class="logo-subtitle">Game Accelerator</p>
      </div>

      <form
        @submit.prevent="handleLogin"
        class="login-form flex flex-col gap-6"
      >
        <div class="flex flex-col gap-2.5">
          <Label
            for="username"
            class="flex items-center gap-2 text-[0.8125rem] font-semibold uppercase tracking-wider text-zinc-400"
          >
            <User class="h-4 w-4" />
            <span>Username</span>
          </Label>
          <Input
            id="username"
            v-model="loginEmail"
            type="text"
            placeholder="Enter username"
            required
            autocomplete="username"
            :disabled="loading"
            :class="inputClass"
          />
        </div>

        <div class="flex flex-col gap-2.5">
          <Label
            for="password"
            class="flex items-center gap-2 text-[0.8125rem] font-semibold uppercase tracking-wider text-zinc-400"
          >
            <Lock class="h-4 w-4" />
            <span>Password</span>
          </Label>
          <Input
            id="password"
            v-model="loginPassword"
            type="password"
            placeholder="Enter password"
            required
            autocomplete="current-password"
            :disabled="loading"
            :class="inputClass"
          />
        </div>

        <div
          v-if="errorMessage"
          class="error-msg flex items-center gap-3 rounded-[10px] border border-red-500/30 bg-red-500/10 px-4 py-3.5 text-sm text-red-300"
        >
          <div
            class="error-icon flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-500/20 text-xs font-bold"
          >
            !
          </div>
          <span>{{ errorMessage }}</span>
        </div>

        <Button
          type="submit"
          :disabled="loading"
          class="mt-2 h-12 w-full rounded-[10px] border-0 bg-white text-base font-bold tracking-wide text-black shadow-[0_0_20px_rgba(255,255,255,0.15)] hover:bg-zinc-100 hover:shadow-[0_10px_30px_rgba(255,255,255,0.25)] active:translate-y-0 disabled:opacity-70"
        >
          <Loader2 v-if="loading" class="mr-2 h-5 w-5 animate-spin" />
          <span v-else>Login</span>
        </Button>
      </form>

      <div class="login-footer">
        <div class="footer-dot"></div>
        <span class="footer-text">v0.1.0 Beta</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-container {
  position: relative;
  min-height: 100vh;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
  overflow: hidden;
  font-family:
    -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.bg-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(#18181b 1px, transparent 1px),
    linear-gradient(90deg, #18181b 1px, transparent 1px);
  background-size: 50px 50px;
  opacity: 0.3;
  animation: grid-flow 20s linear infinite;
}

@keyframes grid-flow {
  0% {
    transform: translate(0, 0);
  }
  100% {
    transform: translate(50px, 50px);
  }
}

.bg-gradient {
  position: absolute;
  inset: 0;
  background: radial-gradient(
    circle at 50% 50%,
    rgba(255, 255, 255, 0.03) 0%,
    transparent 50%
  );
  pointer-events: none;
}

.login-card {
  position: relative;
  z-index: 10;
  width: 100%;
  max-width: 420px;
  background: #09090b;
  border: 1px solid #27272a;
  border-radius: 20px;
  padding: 3rem 2.5rem;
  box-shadow:
    0 25px 50px -12px rgba(0, 0, 0, 0.8),
    0 0 0 1px rgba(255, 255, 255, 0.05);
  animation: card-enter 0.6s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes card-enter {
  from {
    opacity: 0;
    transform: translateY(20px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.logo-section {
  text-align: center;
  margin-bottom: 2.5rem;
  animation: logo-fade-in 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.2s both;
}

@keyframes logo-fade-in {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.logo-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  background: #fff;
  color: #000;
  border-radius: 16px;
  margin-bottom: 1rem;
  box-shadow: 0 0 30px rgba(255, 255, 255, 0.2);
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.logo-icon:hover {
  transform: scale(1.05) rotate(-5deg);
}

.logo-text {
  font-size: 2rem;
  font-weight: 800;
  color: #fff;
  margin: 0;
  letter-spacing: -0.02em;
  text-shadow: 0 0 20px rgba(255, 255, 255, 0.1);
}

.logo-subtitle {
  font-size: 0.875rem;
  color: #71717a;
  margin: 0.5rem 0 0;
  font-weight: 500;
  letter-spacing: 0.05em;
}

.login-form {
  animation: form-fade-in 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.3s both;
}

@keyframes form-fade-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.error-msg {
  animation: error-shake 0.4s cubic-bezier(0.36, 0.07, 0.19, 0.97);
}

@keyframes error-shake {
  0%,
  100% {
    transform: translateX(0);
  }
  10%,
  30%,
  50%,
  70%,
  90% {
    transform: translateX(-4px);
  }
  20%,
  40%,
  60%,
  80% {
    transform: translateX(4px);
  }
}

.login-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  margin-top: 2rem;
  padding-top: 2rem;
  border-top: 1px solid #27272a;
  animation: footer-fade-in 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.4s both;
}

@keyframes footer-fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.footer-dot {
  width: 6px;
  height: 6px;
  background: #27272a;
  border-radius: 50%;
  animation: pulse-dot 2s ease-in-out infinite;
}

@keyframes pulse-dot {
  0%,
  100% {
    opacity: 0.5;
  }
  50% {
    opacity: 1;
  }
}

.footer-text {
  font-size: 0.75rem;
  color: #52525b;
  font-weight: 500;
  font-family: "Courier New", monospace;
  letter-spacing: 0.05em;
}

@media (max-width: 480px) {
  .login-card {
    margin: 1rem;
    padding: 2rem 1.5rem;
  }

  .logo-text {
    font-size: 1.75rem;
  }
}
</style>
