import "dotenv/config";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";

// 1. Configuration
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PORT = Number(process.env.PORT) || 3000;
const WG_INTERFACE = "wg0";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const app = new Hono();

// 2. WireGuard Helpers
function runCommand(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf-8" }).trim();
  } catch (e: any) {
    console.error(`Command failed: ${cmd}`, e.message);
    throw e;
  }
}

function ensureKeys() {
  const privKeyPath = "/etc/wireguard/private.key";
  const pubKeyPath = "/etc/wireguard/public.key";

  if (!existsSync(privKeyPath)) {
    console.log("Generating WireGuard keys...");
    runCommand(`wg genkey | tee ${privKeyPath} | wg pubkey > ${pubKeyPath}`);
  }

  return {
    privateKey: readFileSync(privKeyPath, "utf-8").trim(),
    publicKey: readFileSync(pubKeyPath, "utf-8").trim(),
  };
}

function getPublicIp(): string {
  if (process.env.PUBLIC_IP) return process.env.PUBLIC_IP;
  return runCommand("curl -s ifconfig.me");
}

function countryCodeToFlag(countryCode: string): string {
  if (!countryCode || countryCode.length !== 2) return "🌍";
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

interface LocationData {
  coordinates: [number, number];
  countryCode: string;
  countryName: string;
}

async function getLocationFromIp(ip: string): Promise<LocationData> {
  // Only allow setting location via environment variables
  if (process.env.LOCATION_LAT && process.env.LOCATION_LON && process.env.COUNTRY_CODE) {
    console.log("Using manually configured location from environment variables");
    return {
      coordinates: [parseFloat(process.env.LOCATION_LON), parseFloat(process.env.LOCATION_LAT)],
      countryCode: process.env.COUNTRY_CODE,
      countryName: process.env.COUNTRY_NAME || "Unknown",
    };
  }
  console.warn("No location environment variables set, using default location (0,0)");
  return {
    coordinates: [0, 0],
    countryCode: "UN",
    countryName: "Unknown",
  };
}

function updateWireGuardConfig(peers: any[], privateKey: string) {
  let config = `[Interface]
PrivateKey = ${privateKey}
ListenPort = 51820
SaveConfig = false
Address = 10.0.0.1/24
PostUp = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE

`;

  peers.forEach((p) => {
    config += `[Peer]
  // User: ${p.user_id} - Device: ${p.device_name}
PublicKey = ${p.public_key}
AllowedIPs = ${p.allowed_ip}/32

`;
  });

  writeFileSync(`/etc/wireguard/${WG_INTERFACE}.conf`, config);

  // Reload without dropping connections if possible, or just quick restart
  try {
    // syncconf is better but requires `wg-quick strip` output.
    // For simplicity in this v1, using wg-quick down/up or syncconf if available.
    // Ideally: wg syncconf wg0 <(wg-quick strip wg0)
    // But since we wrote the file:
    runCommand(`wg-quick strip ${WG_INTERFACE} > /tmp/wg0.strip`);
    runCommand(`wg syncconf ${WG_INTERFACE} /tmp/wg0.strip`);
    console.log("WireGuard config reloaded.");
  } catch (e) {
    console.log("Syncconf failed, trying restart...", e);
    try {
      runCommand(`wg-quick down ${WG_INTERFACE}`);
    } catch {}
    runCommand(`wg-quick up ${WG_INTERFACE}`);
  }
}

// 3. Main Logic
// 3. Main Logic
async function main() {
  console.log("Starting VPS Agent...");

  // A. Auto-Provisioning
  let privateKey: string, publicKey: string;
  try {
    const keys = ensureKeys();
    privateKey = keys.privateKey;
    publicKey = keys.publicKey;
  } catch (e) {
    console.error("Failed to generate/read keys:", e);
    process.exit(1);
  }

  let publicIp: string;
  try {
    publicIp = getPublicIp();
    if (!publicIp) throw new Error("Public IP is empty");
  } catch (e) {
    console.error("Failed to get public IP:", e);
    process.exit(1);
  }

  console.log(`Region/IP: ${publicIp}, Setup Public Key: ${publicKey}`);

  // Check/Register in Supabase
  // Uses maybeSingle() to avoid throwing if no rows found
  const { data: server, error: fetchError } = await supabase
    .from("servers")
    .select("*")
    .eq("ip", publicIp)
    .maybeSingle();

  if (fetchError) {
    console.error("Error fetching server info:", fetchError);
  }

  if (!server) {
    console.log("Server not found in DB. Registering...");
    const tags = process.env.VPN_SERVER_TAGS
      ? process.env.VPN_SERVER_TAGS.split(',').map(t => t.trim())
      : [];
    const locationData = await getLocationFromIp(publicIp);
    const flag = countryCodeToFlag(locationData.countryCode);
    const { error: insertError } = await supabase.from("servers").insert({
      ip: publicIp,
      region: locationData.countryName,
      public_key: publicKey,
      port: 51820,
      name: `${flag} VPN Node ${publicIp}`,
      flag: flag,
      tags,
      location: JSON.stringify(locationData.coordinates),
    });

    if (insertError) {
      console.error("Failed to register server:", insertError);
      // Retry or exit? For now, log and continue, though sync won't work well without record
    }
  } else {
    console.log("Server found in DB.");
  }

  // B. Initial Sync
  try {
    const { data: peers, error } = await supabase
      .from("vpn_profiles")
      .select("*")
      .eq("server_ip", publicIp)
      .eq("is_active", true);

    if (error) console.error("Error fetching peers:", error);
    if (peers) {
      console.log(`Found ${peers.length} active peers.`);
      updateWireGuardConfig(peers, privateKey);
    }
  } catch (e) {
    console.error("Initial sync failed:", e);
  }

  // C. Realtime Subscription
  console.log("Subscribing to Realtime changes...");
  supabase
    .channel("vpn_profiles_changes")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "vpn_profiles",
        filter: `server_ip=eq.${publicIp}`,
      },
      async (payload) => {
        console.log("Change detected!", payload.eventType);
        // Re-fetch all to be safe and simple (prevents drift)
        const { data: currentPeers } = await supabase
          .from("vpn_profiles")
          .select("*")
          .eq("server_ip", publicIp)
          .eq("is_active", true);

        if (currentPeers) {
          try {
            updateWireGuardConfig(currentPeers, privateKey);
          } catch (configError) {
            console.error("Failed to update WG config on change:", configError);
          }
        }
      },
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        console.log("Realtime connected!");
      } else if (status === "CHANNEL_ERROR") {
        console.error("Realtime subscription error.");
      }
    });

  // D. Hono Server (Health Check)
  app.get("/health", (c) => c.json({ status: "ok", ip: publicIp }));
  app.get("/", (c) => c.text("NigPing VPS Agent Running."));

  serve({ fetch: app.fetch, port: PORT });
  console.log(`Agent API running on port ${PORT}`);
}

main().catch(console.error);
