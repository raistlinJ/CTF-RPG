// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import {
  readFileSync,
  existsSync,
  mkdirSync,
  statSync,
  createReadStream,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { resolve, dirname, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseGame, parseChallenges } from "../lib/config-schema.mjs";
import { createSQLiteAdapter, initializeSchema } from "./sqlite.mjs";
import { exportFullBackup } from "./backup.mjs";
import { readdirSync, lstatSync } from "node:fs";
import { createApi } from "./api.mjs";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const config = parseGame(
  readFileSync(
    resolve(process.env.GAME_CONFIG || resolve(root, "content/game.yaml")),
    "utf8",
  ),
);
const challenges = parseChallenges(
  readFileSync(
    resolve(
      process.env.CHALLENGES_CONFIG || resolve(root, "content/challenges.yaml"),
    ),
    "utf8",
  ),
  null,
);
const output = resolve(root, "selfhost/dist");
if (!existsSync(resolve(output, "index.html")))
  throw Error("Run npm run build:selfhost first.");
const databasePath = resolve(
  process.env.DATABASE_PATH || resolve(root, "data/quest.sqlite"),
);
mkdirSync(dirname(databasePath), { recursive: true });
const sqlite = new DatabaseSync(databasePath);
initializeSchema(sqlite);
const db = createSQLiteAdapter(sqlite);
const secure = process.env.SECURE_COOKIES === "true";
function publicAssets() {
  const files = {};
  const directory = resolve(root, "public");
  let size = 0;
  function walk(path, prefix) {
    for (const name of readdirSync(path)) {
      const full = resolve(path, name),
        info = lstatSync(full);
      if (info.isSymbolicLink()) continue;
      if (info.isDirectory()) walk(full, prefix + name + "/");
      else {
        size += info.size;
        if (size > 24 * 1024 * 1024)
          throw Error("Local assets exceed the backup limit.");
        files[prefix + name] = new Uint8Array(readFileSync(full));
      }
    }
  }
  walk(directory, "public/");
  return files;
}
const assetDirectory = resolve(
  process.env.ASSET_PATH || resolve(root, "data/pack-assets"),
);
mkdirSync(assetDirectory, { recursive: true });
const assetStore = {
  async get(key) {
    const p = resolve(assetDirectory, key);
    return existsSync(p) ? new Uint8Array(readFileSync(p)) : null;
  },
  async put(key, bytes) {
    writeFileSync(resolve(assetDirectory, key), bytes);
  },
};
const readBaseAsset = (path) => {
  const p = resolve(root, "public", "." + path),
    directory = resolve(root, "public");
  if (
    !p.startsWith(directory + sep) ||
    !existsSync(p) ||
    !statSync(p).isFile() ||
    !realpathSync(p).startsWith(realpathSync(directory) + sep)
  )
    return null;
  return new Uint8Array(readFileSync(p));
};
const api = createApi({
  db,
  config,
  challenges,
  secureCookies: secure,
  assetStore,
  readBaseAsset,
  exportBackup: (state) => exportFullBackup(state, publicAssets()),
});
const origin = process.env.PUBLIC_ORIGIN;
if (origin && new URL(origin).origin !== origin)
  throw Error(
    "PUBLIC_ORIGIN must be an origin, for example https://quest.school.org",
  );
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".jpg": "image/jpeg",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".zip": "application/zip",
  ".mid": "audio/midi",
  ".midi": "audio/midi",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};
const limiters = new Map();
function rateLimited(ip) {
  const now = Date.now(),
    entry = limiters.get(ip);
  if (limiters.size > 10000)
    for (const [key, e] of limiters) if (e.until < now) limiters.delete(key);
  if (!entry || entry.until < now) {
    limiters.set(ip, { count: 1, until: now + 60000 });
    return false;
  }
  return ++entry.count > 20;
}
const server = createServer(async (req, res) => {
  try {
    const requestOrigin = origin || `http://${req.headers.host}`;
    const url = new URL(req.url, requestOrigin);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    if (url.pathname.startsWith("/api/")) {
      if (
        url.pathname === "/api/auth" &&
        req.method === "POST" &&
        rateLimited(req.socket.remoteAddress)
      ) {
        res.writeHead(429, {
          "Content-Type": "application/json",
          "Retry-After": "60",
        });
        return res.end(
          JSON.stringify({
            error: "Too many sign-in attempts. Try again in a minute.",
          }),
        );
      }
      const chunks = [];
      let length = 0;
      const bodyLimit =
        url.pathname === "/api/admin/ctfd-import" ? 65 * 1024 * 1024 : url.pathname === "/api/admin/packs" ? 17 * 1024 * 1024 : url.pathname === "/api/admin/theme-audio" ? 9 * 1024 * 1024 : 524288;
      for await (const chunk of req) {
        length += chunk.length;
        chunks.push(chunk);
        if (length > bodyLimit) {
          res.writeHead(413);
          return res.end();
        }
      }
      const body = Buffer.concat(chunks);
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers))
        if (value)
          headers.set(key, Array.isArray(value) ? value.join(", ") : value);
      const response = await api(
        new Request(url, {
          method: req.method,
          headers,
          body: ["GET", "HEAD"].includes(req.method)
            ? undefined
            : body.length
              ? body
              : undefined,
        }),
      );
      res.writeHead(response.status, Object.fromEntries(response.headers));
      return res.end(Buffer.from(await response.arrayBuffer()));
    }
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405);
      return res.end();
    }
    const path = decodeURIComponent(url.pathname);
    // Only expose public assets and built client files. YAML and SQLite are outside both roots.
    let file = null;
    for (const directory of [resolve(root, "public"), output]) {
      const candidate = resolve(directory, "." + path);
      if (
        candidate.startsWith(directory + sep) &&
        existsSync(candidate) &&
        statSync(candidate).isFile()
      ) {
        const real = realpathSync(candidate);
        if (real.startsWith(realpathSync(directory) + sep)) {
          file = candidate;
          break;
        }
      }
    }
    if (
      !file &&
      [
        "/",
        "/admin",
        "/admin/",
        "/admin/challenges/submissions",
        "/admin/challenges/submissions/",
        "/admin/notifications",
        "/admin/notifications/",
        "/admin/review",
        "/admin/review/",
        "/admin/packs",
        "/admin/packs/",
        "/admin/theme",
        "/admin/theme/",
        "/admin/theme/audio",
        "/admin/theme/audio/",
        "/admin/theme/import-export",
        "/admin/theme/import-export/",
        "/admin/teams",
        "/admin/teams/",
        "/admin/users",
        "/admin/users/",
        "/scoreboard",
        "/scoreboard/",
      ].includes(path)
    )
      file = resolve(output, "index.html");
    if (!file) {
      res.writeHead(404);
      return res.end("Not found");
    }
    res.writeHead(200, {
      "Content-Type": types[extname(file)] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    if (req.method === "HEAD") return res.end();
    createReadStream(file).pipe(res);
  } catch {
    res.writeHead(400);
    res.end("Invalid request");
  }
});
const host = process.env.HOST || "0.0.0.0",
  port = Number(process.env.PORT || 3000);
server.listen(port, host, () =>
  console.log(
    `CTF-RPG listening on http://${host}:${server.address().port}`,
  ),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () =>
    server.close(() => {
      sqlite.close();
      process.exit(0);
    }),
  );
