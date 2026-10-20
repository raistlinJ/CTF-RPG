import {pageRoute} from '../lib/page-routes.mjs';
import {createAuthRateLimiter} from './auth-rate-limit.mjs';
import { THEME_UPLOAD_LIMIT, PACK_IMPORT_REQUEST_LIMIT, CTFD_IMPORT_REQUEST_LIMIT, CHALLENGE_FILE_LIMIT } from "../lib/pack-limits.mjs";
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
import { parseChallenges } from "../lib/config-schema.mjs";
import { runtimeConfig } from "../lib/runtime-config.mjs";
import { ensureStartupAdmin } from "./protected-admin.mjs";
import { createSQLiteAdapter, initializeSchema } from "./sqlite.mjs";
import { exportFullBackup } from "./backup.mjs";
import { readdirSync, lstatSync } from "node:fs";
import { createApi } from "./api.mjs";
import { byteRange } from "./byte-range.mjs";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// The root .env is loaded for native Node; Compose passes the same values as env.
if (existsSync(resolve(root, ".env"))) process.loadEnvFile(resolve(root, ".env"));
const config = runtimeConfig(process.env);
const challenges = parseChallenges(
  existsSync(resolve(process.env.CHALLENGES_CONFIG || resolve(root, "content/challenges.yaml")))
    ? readFileSync(resolve(process.env.CHALLENGES_CONFIG || resolve(root, "content/challenges.yaml")), "utf8")
    : "challenges: []",
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
await ensureStartupAdmin(db, config, process.env.ADMIN_PASSWORD);
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
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};
const authLimits = createAuthRateLimiter();
function rejectSignIn(res) {
  res.writeHead(429, {"Content-Type":"application/json","Retry-After":"60"});
  res.end(JSON.stringify({error:"Too many sign-in attempts. Try again in a minute."}));
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
        authLimits.address(req.socket.remoteAddress)
      ) {
        req.resume();
        return rejectSignIn(res);
      }
      const chunks = [];
      let length = 0;
      const bodyLimit =
        url.pathname === "/api/admin/ctfd-import" ? CTFD_IMPORT_REQUEST_LIMIT : url.pathname === "/api/admin/packs" ? PACK_IMPORT_REQUEST_LIMIT : ["/api/admin/theme-audio", "/api/admin/theme-media", "/api/admin/theme-sounds"].includes(url.pathname) ? THEME_UPLOAD_LIMIT : url.pathname === "/api/admin/challenge-videos" ? 4 * 1024 * 1024 : url.pathname === "/api/admin/challenge-files" ? CHALLENGE_FILE_LIMIT : 524288;
      const rejectUpload = () => {
        req.resume(); // Drain without retaining the rejected upload or closing before the response flushes.
        res.writeHead(413, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        res.end(JSON.stringify({ error: url.pathname === "/api/admin/ctfd-import"
          ? "CTFd request exceeds 65 MB. Use the web importer to prepare exports up to 512 MB before uploading."
          : `Upload exceeds the ${Number((bodyLimit / 1024 / 1024).toFixed(2))} MB request limit.` }));
      };
      if (Number(req.headers["content-length"]) > bodyLimit) { rejectUpload(); return; }
      for await (const chunk of req.iterator({ destroyOnReturn: false })) {
        length += chunk.length;
        if (length > bodyLimit) { rejectUpload(); return; }
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks);
      if (url.pathname === "/api/auth" && req.method === "POST") {
        let username;
        try { username = JSON.parse(body.toString("utf8"))?.username; } catch {}
        if (authLimits.account(req.socket.remoteAddress,username)) return rejectSignIn(res);
      }
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
    if (!file && pageRoute(path))
      file = resolve(output, "index.html");
    if (!file) {
      res.writeHead(404);
      return res.end("Not found");
    }
    const range = /\.(mp4|webm)$/.test(file) ? byteRange(req.headers.range, statSync(file).size) : null;
    res.writeHead(range?.status || 200, {
      ...range?.headers,
      "Content-Type": types[extname(file)] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    if (req.method === "HEAD" || range?.status === 416) return res.end();
    createReadStream(file, range ? {start:range.start,end:range.end} : undefined).pipe(res);
  } catch {
    if (req.url?.startsWith("/api/")) {
      res.writeHead(400, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ error: "Invalid API request." }));
    } else { res.writeHead(400); res.end("Invalid request"); }
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
