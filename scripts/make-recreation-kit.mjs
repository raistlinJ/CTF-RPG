import {
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  existsSync,
} from "node:fs";
import { resolve, relative } from "node:path";
import { zipSync } from "fflate";
const root = process.cwd(),
  entries = {};
function add(path) {
  const info = statSync(path);
  if (info.isDirectory()) {
    for (const e of readdirSync(path, { withFileTypes: true }))
      if (!e.isSymbolicLink()) add(resolve(path, e.name));
    return;
  }
  const name = relative(root, path).replaceAll("\\", "/");
  if (
    name === "server/recreation-kit.mjs" ||
    name === "content/game.local.yaml" ||
    name.endsWith(".tsbuildinfo")
  )
    return;
  entries[name] = new Uint8Array(readFileSync(path));
}
for (const dir of [
  "app",
  "components",
  "hooks",
  "lib",
  "server",
  "scripts",
  "build",
  "vendor",
  "public",
  "drizzle",
  "db",
  "selfhost",
  "tests",
  "themes",
])
  if (existsSync(resolve(root, dir))) add(resolve(root, dir));
for (const name of [
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "types.d.ts",
  "next.config.ts",
  "vite.config.ts",
  "vite.selfhost.config.ts",
  "postcss.config.mjs",
  "drizzle.config.ts",
  "eslint.config.mjs",
  "components.json",
  "cloudflare-env.d.ts",
  "Dockerfile",
  "compose.yaml",
  ".dockerignore",
  ".gitignore",
  "README.md",
  "ADMIN_GUIDE.md",
  "SELF_HOSTING.md",
  "MAP_GUIDE.md",
  "CHALLENGES.md",
  "BACKUPS.md",
  "THEMES.md",
])
  if (existsSync(resolve(root, name))) add(resolve(root, name));
const total = Object.values(entries).reduce((n, b) => n + b.length, 0);
if (total > 24 * 1024 * 1024)
  throw Error("Recreation source and assets exceed the 24 MB seed limit.");
const bytes = zipSync(entries, { level: 6 });
writeFileSync(
  resolve(root, "server/recreation-kit.mjs"),
  `// Generated server-only recreation seed; contains no account configuration or live data.\nexport const kitBase64=${JSON.stringify(Buffer.from(bytes).toString("base64"))};\n`,
);
console.log(
  `Recreation kit: ${Object.keys(entries).length} files, ${bytes.length} compressed bytes.`,
);
