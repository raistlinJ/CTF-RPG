// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseTheme, themeAssetPaths } from "../lib/theme-schema.mjs";
import { zipSync, strToU8 } from "fflate";
import { stringify } from "yaml";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
mkdirSync(resolve(root, "theme-packs"), { recursive: true });
for (const name of ["north-pole", "agentic-circuit"]) {
  const theme = parseTheme(
    JSON.parse(
      readFileSync(resolve(root, "themes", name, "theme.json"), "utf8"),
    ),
  );
  const entries = { "theme.yaml": strToU8(stringify(theme)) };
  for (const path of themeAssetPaths(theme))
    entries["assets" + path] = new Uint8Array(
      readFileSync(resolve(root, "public", "." + path)),
    );
  writeFileSync(
    resolve(root, "theme-packs", name + ".zip"),
    zipSync(entries, { level: 6 }),
  );
  console.log(`Built theme-packs/${name}.zip`);
}
