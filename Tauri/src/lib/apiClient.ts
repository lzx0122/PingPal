import { fetchJson } from "./http";

export type ApiFetchOptions = RequestInit & {
  public?: boolean;
};

type AuthProvider = {
  getAuthHeaders: () => Record<string, string>;
  logout: () => void | Promise<void>;
};

let authProvider: AuthProvider | null = null;

export function configureApiClient(provider: AuthProvider) {
  authProvider = provider;
}

/**
 * Centralized API requests: same base URL + JSON defaults as the rest of the app.
 * Authenticated calls attach Bearer; 401 clears session unless `public: true`.
 */
export async function apiFetch(
  path: string,
  options: ApiFetchOptions = {},
): Promise<Response> {
  const { public: isPublic = false, ...init } = options;

  const response = await fetchJson(path, {
    ...init,
    headers: {
      ...(isPublic ? {} : authProvider?.getAuthHeaders() ?? {}),
      ...(init.headers as Record<string, string>),
    },
  });

  if (response.status === 401 && !isPublic) {
    void authProvider?.logout();
    throw new Error("Session expired. Please login again.");
  }

  return response;
}
