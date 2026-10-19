// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseTheme, themeAssetPaths } from "../lib/theme-schema.mjs";
import { parseChallenges } from "../lib/config-schema.mjs";
import { createWorld } from "../lib/world-data.mjs";
import { challengeLocationAvailable } from "../lib/challenge-placement.mjs";
import { validateProgressionDependencies } from "../lib/challenge-dependencies.mjs";
import { zipSync, strToU8 } from "fflate";
import { stringify } from "yaml";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
mkdirSync(resolve(root, "theme-packs"), { recursive: true });
const read = path => readFileSync(resolve(root,path),"utf8");
function pack(name, filename, manifest, paths) {
  const entries = { [filename]: strToU8(stringify(manifest)) };
  for (const path of paths) entries["assets" + path] = new Uint8Array(readFileSync(resolve(root,"public","." + path)));
  writeFileSync(resolve(root,"theme-packs",name + ".zip"),zipSync(entries,{level:6}));
  console.log(`Built theme-packs/${name}.zip`);
}
for (const name of ["north-pole", "agentic-circuit", "halloween", "solstice-vanguard", "environment-development"]) {
  const theme = parseTheme(JSON.parse(read(`themes/${name}/theme.json`))),
    demoTheme = parseTheme(JSON.parse(read(`themes/${name}/demo-theme.json`))),
    challenges = parseChallenges(read(`themes/${name}/demo-challenges.yaml`),demoTheme.world.maps.map(m=>m.id),false);
  validateProgressionDependencies(challenges,demoTheme.world.entities);
  const world = createWorld(demoTheme.world);
  for (const c of challenges) if (!challengeLocationAvailable(world,challenges,c.map,c.location.x,c.location.y,c.id,c)) throw Error(`Invalid demo challenge footprint: ${c.id}`);
  // JSON is the runtime copy of the authorable YAML, usable by Node and Worker builds.
  writeFileSync(resolve(root,`themes/${name}/demo-content.json`),JSON.stringify(challenges,null,2)+"\n");
  pack(name,"theme.yaml",theme,themeAssetPaths(theme));
  pack(name + "-demo-theme","theme.yaml",demoTheme,themeAssetPaths(demoTheme));
  pack(name + "-demo-content","content.yaml",{format:"quest-content",version:1,challenges},[...new Set(challenges.flatMap(c=>[...c.downloads.map(d=>d.url),c.discoveryVideo,c.solveVideo]).filter(p=>p?.startsWith("/")))]);
}
