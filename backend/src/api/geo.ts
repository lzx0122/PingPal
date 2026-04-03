import { Hono } from "hono";

const app = new Hono();

const IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/;

function isProbablyValidQueryIp(raw: string): boolean {
  const ip = raw.trim();
  if (!ip || ip.length > 128) return false;
  if (IPV4.test(ip)) {
    const parts = ip.split(".").map(Number);
    if (parts.some((n) => n > 255)) return false;
    return true;
  }
  return ip.includes(":");
}

app.get("/lookup", async (c) => {
  const ip = c.req.query("ip")?.trim();
  if (!ip || !isProbablyValidQueryIp(ip)) {
    return c.json({ error: "Invalid ip query" }, 400);
  }

  try {
    const url = `https://ipwho.is/${encodeURIComponent(ip)}`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      return c.json({ error: "Geo lookup failed" }, 502);
    }
    const data = (await res.json()) as {
      success?: boolean;
      message?: string;
      latitude?: number;
      longitude?: number;
      country?: string;
      region?: string;
      ip?: string;
    };
    if (
      !data.success ||
      typeof data.latitude !== "number" ||
      typeof data.longitude !== "number"
    ) {
      return c.json(
        { error: data.message || "Location unavailable for this IP" },
        422,
      );
    }
    const lon = data.longitude;
    const lat = data.latitude;
    return c.json({
      ip: data.ip ?? ip,
      country: data.country ?? "",
      region: data.region ?? "",
      location: [lon, lat] as [number, number],
    });
  } catch (e) {
    console.error("Geo lookup error:", e);
    return c.json({ error: "Geo lookup failed" }, 502);
  }
});

export default app;
