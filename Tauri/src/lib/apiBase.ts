/** Single source for backend origin (auth, apiClient, etc.). */
export const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:3000";
