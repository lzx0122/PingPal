import { Hono } from "hono";
import { cors } from "hono/cors";
import { readFileSync, existsSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { supabase } from "./db/supabase.js";
import { jwt, sign } from "hono/jwt";
import { comparePassword, hashPassword } from "./auth.js";
import { generateRandomPassword } from "./password-utils.js";
import vpn from "./api/vpn.js";
import geo from "./api/geo.js";

const app = new Hono();

app.use("/*", cors());

app.use("/api/*", async (c, next) => {
  const path = c.req.path;

  if (
    path === "/api/auth/login" ||
    path === "/api/auth/admin-login" ||
    (c.req.method === "GET" && path.startsWith("/api/servers")) ||
    (c.req.method === "GET" && path.match(/^\/api\/games\/.*\/ranges$/)) ||
    (c.req.method === "GET" && path.startsWith("/api/geo/"))
  ) {
    await next();
    return;
  }

  const jwtMiddleware = jwt({
    secret: process.env.JWT_SECRET || "default_dev_secret",
    alg: "HS256",
  });

  return jwtMiddleware(c, next);
});

app.use("/api/*", async (c, next) => {
  const path = c.req.path;

  if (
    path === "/api/auth/login" ||
    path === "/api/auth/admin-login" ||
    (c.req.method === "GET" && path.startsWith("/api/servers")) ||
    (c.req.method === "GET" && path.match(/^\/api\/games\/.*\/ranges$/)) ||
    (c.req.method === "GET" && path.startsWith("/api/geo/"))
  ) {
    await next();
    return;
  }

  const payload = c.get("jwtPayload");
  const isAdmin = payload?.role === "admin";

  const isAdminRoute =
    path.startsWith("/api/users") ||
    path.startsWith("/api/stats") ||
    (c.req.method !== "GET" && path.startsWith("/api/servers")) ||
    (c.req.method !== "GET" && path.match(/^\/api\/games\/.*\/ranges$/));

  if (isAdminRoute && !isAdmin) {
    return c.json({ error: "Forbidden: Admin access required" }, 403);
  }

  await next();
});

app.route("/api/vpn", vpn);

app.route("/api/geo", geo);

app.post("/api/auth/admin-login", async (c) => {
  try {
    const { username, password } = await c.req.json<{
      username: string;
      password: string;
    }>();

    if (!username || !password) {
      return c.json({ error: "Username and password required" }, 400);
    }

    const { data: user, error } = await supabase
      .from("admin_users")
      .select("*")
      .eq("username", username)
      .single();

    if (error || !user) {
      return c.json({ error: "Invalid credentials" }, 401);
    }

    const valid = await comparePassword(password, user.password_hash);
    if (!valid) {
      return c.json({ error: "Invalid credentials" }, 401);
    }

    const payload = {
      sub: user.id,
      username: user.username,
      role: "admin",
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
    };
    const secret = process.env.JWT_SECRET || "default_dev_secret";
    const token = await sign(payload, secret);

    return c.json({ token, username: user.username });
  } catch (e) {
    console.error("Admin login error:", e);
    return c.json({ error: "Login failed" }, 500);
  }
});

app.post("/api/auth/login", async (c) => {
  try {
    const { username, password } = await c.req.json<{
      username: string;
      password: string;
    }>();

    if (!username || !password) {
      return c.json({ error: "Username and password required" }, 400);
    }

    const { data: user, error } = await supabase
      .from("users")
      .select("*")
      .eq("username", username)
      .single();

    if (error || !user) {
      return c.json({ error: "Invalid credentials" }, 401);
    }

    if (!user.is_active) {
      return c.json({ error: "Account is disabled" }, 403);
    }

    const valid = await comparePassword(password, user.password_hash);
    if (!valid) {
      return c.json({ error: "Invalid credentials" }, 401);
    }

    const payload = {
      sub: user.id,
      username: user.username,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
    };
    const secret = process.env.JWT_SECRET || "default_dev_secret";
    const token = await sign(payload, secret);

    return c.json({ token, username: user.username });
  } catch (e) {
    console.error("Login error:", e);
    return c.json({ error: "Login failed" }, 500);
  }
});

app.get("/", (c) => {
  return c.redirect("/admin");
});

app.get("/api/users", async (c) => {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("id, username, created_at, updated_at, is_active")
      .order("created_at", { ascending: false });

    if (error) throw error;

    return c.json(data || []);
  } catch (error) {
    console.error("Error fetching users:", error);
    return c.json({ error: "Failed to fetch users" }, 500);
  }
});

app.post("/api/users", async (c) => {
  try {
    const body = await c.req.json<{
      username: string;
      password?: string;
      autoGenerate?: boolean;
    }>();

    if (!body.username) {
      return c.json({ error: "Username is required" }, 400);
    }

    let password: string;
    let generatedPassword: string | undefined;

    if (body.autoGenerate) {
      password = generateRandomPassword();
      generatedPassword = password;
    } else if (body.password) {
      password = body.password;
    } else {
      return c.json(
        { error: "Either password or autoGenerate must be provided" },
        400,
      );
    }

    const passwordHash = await hashPassword(password);

    const { data, error } = await supabase
      .from("users")
      .insert([
        {
          username: body.username,
          password_hash: passwordHash,
        },
      ])
      .select("id, username, created_at, updated_at, is_active")
      .single();

    if (error) {
      if (error.code === "23505") {
        return c.json({ error: "Username already exists" }, 409);
      }
      throw error;
    }

    return c.json(
      {
        user: data,
        password: generatedPassword,
      },
      201,
    );
  } catch (error) {
    console.error("Error creating user:", error);
    return c.json({ error: "Failed to create user" }, 500);
  }
});

app.delete("/api/users/:id", async (c) => {
  try {
    const id = c.req.param("id");

    const { error } = await supabase.from("users").delete().eq("id", id);

    if (error) throw error;

    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting user:", error);
    return c.json({ error: "Failed to delete user" }, 500);
  }
});

app.put("/api/users/:id/password", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json<{
      password?: string;
      autoGenerate?: boolean;
    }>();

    let password: string;
    let generatedPassword: string | undefined;

    if (body.autoGenerate) {
      password = generateRandomPassword();
      generatedPassword = password;
    } else if (body.password) {
      password = body.password;
    } else {
      return c.json(
        { error: "Either password or autoGenerate must be provided" },
        400,
      );
    }

    const passwordHash = await hashPassword(password);

    const { data, error } = await supabase
      .from("users")
      .update({
        password_hash: passwordHash,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("id, username, created_at, updated_at, is_active")
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return c.json({ error: "User not found" }, 404);
      }
      throw error;
    }

    return c.json({
      user: data,
      password: generatedPassword,
    });
  } catch (error) {
    console.error("Error resetting password:", error);
    return c.json({ error: "Failed to reset password" }, 500);
  }
});

app.get("/api/servers", async (c) => {
  try {
    const { data, error } = await supabase
      .from("servers")
      .select("*")
      .order("added_at", { ascending: false });

    if (error) throw error;

    const servers = (data || []).map((server: any) => ({
      id: server.id,
      name: server.name || `Server ${server.ip}`,
      flag: server.flag || "🌍",
      region: server.region,
      endpoint: server.ip,
      publicKey: server.public_key || "",
      location: server.location ? JSON.parse(server.location) : [0, 0],
      tags: server.tags || [],
      addedAt: server.added_at,
    }));

    return c.json(servers);
  } catch (error) {
    console.error("Error fetching servers:", error);
    return c.json({ error: "Failed to fetch servers" }, 500);
  }
});

app.post("/api/servers", async (c) => {
  try {
    const body = await c.req.json<{ ip: string; region: string }>();

    if (!body.ip || !body.region) {
      return c.json({ error: "Missing ip or region" }, 400);
    }

    const { data, error } = await supabase
      .from("servers")
      .insert([
        {
          ip: body.ip,
          region: body.region,
        },
      ])
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return c.json({ error: "Server with this IP already exists" }, 409);
      }
      throw error;
    }

    const newServer = {
      ip: data.ip,
      region: data.region,
      addedAt: data.added_at,
    };

    return c.json(newServer, 201);
  } catch (error) {
    console.error("Error adding server:", error);
    return c.json({ error: "Failed to add server" }, 500);
  }
});

app.put("/api/servers/:ip", async (c) => {
  try {
    const oldIp = c.req.param("ip");
    const body = await c.req.json<{ ip: string; region: string }>();

    if (!body.ip || !body.region) {
      return c.json({ error: "Missing ip or region" }, 400);
    }

    const { data, error } = await supabase
      .from("servers")
      .update({
        ip: body.ip,
        region: body.region,
        updated_at: new Date().toISOString(),
      })
      .eq("ip", oldIp)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return c.json({ error: "Server not found" }, 404);
      }
      throw error;
    }

    const updatedServer = {
      ip: data.ip,
      region: data.region,
      addedAt: data.added_at,
    };

    return c.json(updatedServer);
  } catch (error) {
    console.error("Error updating server:", error);
    return c.json({ error: "Failed to update server" }, 500);
  }
});

app.delete("/api/servers/:ip", async (c) => {
  try {
    const ip = c.req.param("ip");

    const { error } = await supabase.from("servers").delete().eq("ip", ip);

    if (error) throw error;

    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting server:", error);
    return c.json({ error: "Failed to delete server" }, 500);
  }
});

app.get("/api/games/:gameId/ranges", async (c) => {
  try {
    const gameId = c.req.param("gameId");
    const { data, error } = await supabase
      .from("game_ip_ranges")
      .select("ip_range")
      .eq("game_id", gameId);

    if (error) throw error;

    return c.json((data || []).map((row: any) => row.ip_range));
  } catch (error) {
    console.error("Error fetching game IP ranges:", error);
    return c.json({ error: "Failed to fetch game IP ranges" }, 500);
  }
});

app.post("/api/games/:gameId/ranges", async (c) => {
  try {
    const gameId = c.req.param("gameId");
    const body = await c.req.json<{ ipRange: string }>();

    if (!body.ipRange) {
      return c.json({ error: "Missing ipRange" }, 400);
    }

    const { data, error } = await supabase
      .from("game_ip_ranges")
      .insert([
        {
          game_id: gameId,
          ip_range: body.ipRange,
        },
      ])
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return c.json({ message: "Range already exists" }, 200);
      }
      throw error;
    }

    return c.json({ success: true, range: data }, 201);
  } catch (error) {
    console.error("Error adding game IP range:", error);
    return c.json({ error: "Failed to add game IP range" }, 500);
  }
});

app.delete("/api/games/:gameId/ranges", async (c) => {
  try {
    const gameId = c.req.param("gameId");
    const ipRange = c.req.query("range");

    if (!ipRange) {
      return c.json({ error: "Missing range query parameter" }, 400);
    }

    const { error } = await supabase
      .from("game_ip_ranges")
      .delete()
      .eq("game_id", gameId)
      .eq("ip_range", ipRange);

    if (error) throw error;

    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting game IP range:", error);
    return c.json({ error: "Failed to delete game IP range" }, 500);
  }
});

app.get("/api/stats", async (c) => {
  try {
    const { data, error } = await supabase.from("servers").select("region");

    if (error) throw error;

    const byRegion: Record<string, number> = {};
    (data || []).forEach((server: any) => {
      byRegion[server.region] = (byRegion[server.region] || 0) + 1;
    });

    return c.json({
      total: data?.length || 0,
      byRegion,
    });
  } catch (error) {
    console.error("Error fetching stats:", error);
    return c.json({ error: "Failed to fetch stats" }, 500);
  }
});

function resolveAdminUiPath(): string | null {
  const candidates = [
    join(process.cwd(), "admin-ui", "dist"),
    join(process.cwd(), "backend", "admin-ui", "dist"),
    join(__dirname, "..", "admin-ui", "dist"),
    join(__dirname, "..", "..", "admin-ui", "dist"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

app.get("/assets/*", (c) => {
  const assetPath = c.req.path.replace("/assets/", "");
  const distPath = resolveAdminUiPath();

  if (distPath) {
    const fullPath = join(distPath, "assets", assetPath);
    if (existsSync(fullPath)) {
      const content = readFileSync(fullPath);

      const ext = assetPath.split(".").pop()?.toLowerCase();
      const contentTypes: Record<string, string> = {
        js: "application/javascript",
        css: "text/css",
        svg: "image/svg+xml",
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
      };

      const contentType = contentTypes[ext || ""] || "application/octet-stream";
      return c.body(content, 200, { "Content-Type": contentType });
    }
  }

  return c.text("Asset not found", 404);
});

app.get("/vite.svg", (c) => {
  const distPath = resolveAdminUiPath();
  if (distPath) {
    const svgPath = join(distPath, "vite.svg");
    if (existsSync(svgPath)) {
      const content = readFileSync(svgPath);
      return c.body(content, 200, { "Content-Type": "image/svg+xml" });
    }
  }
  return c.text("Not found", 404);
});

app.get("/admin", (c) => {
  const distPath = resolveAdminUiPath();

  if (distPath) {
    const indexPath = join(distPath, "index.html");
    if (existsSync(indexPath)) {
      const html = readFileSync(indexPath, "utf-8");
      return c.html(html);
    }
  }

  try {
    const debug = {
      cwd: process.cwd(),
      __dirname,
      candidates: [
        join(process.cwd(), "admin-ui", "dist"),
        join(process.cwd(), "backend", "admin-ui", "dist"),
      ],
      filesInCwd: readdirSync(process.cwd()),
      backendExists: existsSync(join(process.cwd(), "backend")),
      backendFiles: existsSync(join(process.cwd(), "backend"))
        ? readdirSync(join(process.cwd(), "backend"))
        : "N/A",
    };
    return c.json({ error: "Admin UI not found", debug }, 404);
  } catch (e: any) {
    return c.json({ error: "Error debugging", message: e.message }, 500);
  }
});

export default app;
