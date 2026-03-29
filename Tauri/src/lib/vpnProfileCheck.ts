import { apiFetch } from "./apiClient";

/** Returns whether `profileId` still exists in the server-side device list. */
export async function isProfileOnServer(profileId: string): Promise<boolean> {
  const res = await apiFetch("/api/vpn/profiles");
  if (!res.ok) return true;
  const profiles = (await res.json()) as { id: string }[];
  return profiles.some((p) => p.id === profileId);
}
