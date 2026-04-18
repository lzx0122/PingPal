import { apiFetch } from "./apiClient";

export async function isProfileOnServer(profileId: string): Promise<boolean> {
  const res = await apiFetch("/api/vpn/profiles");
  if (!res.ok) return true;
  const profiles = (await res.json()) as { id: string }[];
  return profiles.some((p) => p.id === profileId);
}
