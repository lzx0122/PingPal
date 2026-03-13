```
<script setup lang="ts">
import { ref } from "vue";
import { useAuthStore } from "../stores/authStore";
import { Zap, User, Lock } from "lucide-vue-next";

// ----------------------------------------------------
// STATE
// ----------------------------------------------------
const authStore = useAuthStore();

// Error State
const errorMessage = ref("");

// Refs for Login
const loginEmail = ref("");
const loginPassword = ref("");

// Define emits for App.vue communication
const emit = defineEmits<{
  (e: "login-success"): void;
}>();

// ----------------------------------------------------
// METHODS
// ----------------------------------------------------
const loading = ref(false);

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
      emit("login-success"); // Notify parent to change view
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
  <div class="login-container">
    <!-- Animated background -->
    <div class="bg-grid"></div>
    <div class="bg-gradient"></div>

    <!-- Login card -->
    <div class="login-card">
      <!-- Logo -->
      <div class="logo-section">
        <div class="logo-icon">
          <Zap class="w-8 h-8 fill-current" />
        </div>
        <h1 class="logo-text">NigPing</h1>
        <p class="logo-subtitle">Game Accelerator</p>
      </div>

      <!-- Form -->
      <form @submit.prevent="handleLogin" class="login-form">
        <!-- Username field -->
        <div class="form-group">
          <label for="username" class="form-label">
            <User class="w-4 h-4" />
            <span>Username</span>
          </label>
          <input
            id="username"
            v-model="loginEmail"
            type="text"
            placeholder="Enter username"
            required
            autocomplete="username"
            class="form-input"
            :disabled="loading"
          />
        </div>

        <!-- Password field -->
        <div class="form-group">
          <label for="password" class="form-label">
            <Lock class="w-4 h-4" />
            <span>Password</span>
          </label>
          <input
            id="password"
            v-model="loginPassword"
            type="password"
            placeholder="Enter password"
            required
            autocomplete="current-password"
            class="form-input"
            :disabled="loading"
          />
        </div>

        <!-- Error message -->
        <div v-if="errorMessage" class="error-msg">
          <div class="error-icon">!</div>
          <span>{{ errorMessage }}</span>
        </div>

        <!-- Submit button -->
        <button type="submit" :disabled="loading" class="btn-submit">
          <div v-if="loading" class="loading-spinner"></div>
          <span v-else>Login</span>
        </button>
      </form>

      <!-- Footer -->
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
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

/* Animated grid background */
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

/* Gradient overlay */
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

/* Login card */
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

/* Logo section */
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

/* Form */
.login-form {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
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

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}

.form-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: #a1a1aa;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.form-input {
  width: 100%;
  padding: 0.875rem 1rem;
  background: #18181b;
  border: 1.5px solid #27272a;
  border-radius: 10px;
  color: #fff;
  font-size: 0.9375rem;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  outline: none;
}

.form-input::placeholder {
  color: #52525b;
}

.form-input:focus {
  border-color: #fff;
  background: #000;
  box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.1);
}

.form-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Error message */
.error-msg {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.875rem 1rem;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 10px;
  color: #fca5a5;
  font-size: 0.875rem;
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

.error-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  background: rgba(239, 68, 68, 0.2);
  border-radius: 50%;
  font-weight: 700;
  font-size: 0.75rem;
  flex-shrink: 0;
}

/* Submit button */
.btn-submit {
  width: 100%;
  padding: 1rem;
  background: #fff;
  color: #000;
  border: none;
  border-radius: 10px;
  font-size: 0.9375rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  margin-top: 0.5rem;
  box-shadow: 0 0 20px rgba(255, 255, 255, 0.15);
  letter-spacing: 0.02em;
}

.btn-submit:hover:not(:disabled) {
  background: #f4f4f5;
  transform: translateY(-2px);
  box-shadow: 0 10px 30px rgba(255, 255, 255, 0.25);
}

.btn-submit:active:not(:disabled) {
  transform: translateY(0);
}

.btn-submit:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.loading-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(0, 0, 0, 0.2);
  border-top-color: #000;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
  margin: 0 auto;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Footer */
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

/* Responsive */
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
