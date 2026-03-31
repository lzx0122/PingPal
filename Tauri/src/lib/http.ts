import { API_BASE_URL } from "./apiBase";

/** JSON fetch with shared base URL (no auth). Used by apiFetch and anywhere that must avoid store cycles. */
export async function fetchJson(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers as Record<string, string>),
    },
  });
}
