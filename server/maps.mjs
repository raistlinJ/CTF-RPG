import { unzipSync, zipSync, strToU8 } from "fflate";
import { z } from "zod";
import { createWorld } from "../lib/world-data.mjs";
import { stringify } from "yaml";
import { parseTheme, themeAssetPaths } from "../lib/theme-schema.mjs";
import { exportPack, importPacks, assertAsset, readAsset } from "./packs.mjs";

export async function updateMap(req, state) {
  const reader = req.body?.getReader();
  if (!reader) throw Error("Select a map.");
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 5 * 1024 * 1024) {
      await reader.cancel();
      throw Error("Map upload exceeds 5 MB. Images must be at most 4 MB.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  const form = await new Request(req.url, {
    method: "POST",
    headers: req.headers,
    body: bytes,
  }).formData();
  if (
    Number(form.get("themeRevision")) !== state.themeRevision ||
    Number(form.get("contentRevision")) !== state.contentRevision
  )
    throw Error(
      "The theme or challenges changed. Reload before saving the map.",
    );
  const patch = JSON.parse(String(form.get("map"))),
    next = structuredClone(state.theme);
  const restoring = form.get("action") === "restore";
  if (!Array.isArray(patch.ground) && !(restoring && patch.ground === null))
    throw Error("Specify walkable ground tiles.");
  const index = next.world.maps.findIndex((m) => m.id === patch.id);
  if (index < 0) throw Error("Unknown map.");
  if (
    Object.keys(patch).some(
      (k) =>
        !(
          restoring
            ? [
                "id",
                "name",
                "bounds",
                "spawn",
                "ground",
                "background",
                "exit",
                "floor",
                "wall",
                "obstacles",
              ]
            : ["id", "name", "bounds", "spawn", "ground"]
        ).includes(k),
    )
  )
    throw Error("Unsupported map setting.");
  next.world.maps[index] = {
    ...next.world.maps[index],
    ...patch,
    obstacles: restoring ? patch.obstacles : [],
  };
  if (form.has("transports")) {
    const requested = z
      .array(
        z
          .object({
            id: z.string(),
            map: z.string(),
            location: z.object({ x: z.number(), y: z.number() }).strict(),
            to: z.string(),
          })
          .strict(),
      )
      .max(200)
      .parse(JSON.parse(String(form.get("transports"))));
    const before = state.theme.world.transports || [];
    if (
      JSON.stringify(requested.filter((t) => t.map !== patch.id)) !==
      JSON.stringify(before.filter((t) => t.map !== patch.id))
    )
      throw Error("Edit transport tiles from their source map.");
    next.world.transports = requested;
  }
  const image = form.get("image");
  let imageBytes, imagePath;
  if (image && typeof image.arrayBuffer === "function" && image.size) {
    if (image.size > 4 * 1024 * 1024)
      throw Error("Map image must be at most 4 MB.");
    const ext = image.name.split(".").pop().toLowerCase();
    if (!["png", "jpg", "jpeg", "webp", "gif"].includes(ext))
      throw Error("Use a PNG, JPEG, WebP or GIF image.");
    imageBytes = new Uint8Array(await image.arrayBuffer());
    assertAsset(imageBytes, ext);
    imagePath = `/maps/upload-${patch.id}.${ext}`;
    next.world.maps[index].background = imagePath;
  }
  parseTheme(next); // Validate spawn and portals before storing anything.
  const moves = z
    .array(
      z
        .object({
          id: z.string(),
          x: z.number().int().min(0).max(39),
          y: z.number().int().min(0).max(27),
        })
        .strict(),
    )
    .max(100)
    .parse(JSON.parse(String(form.get("moves") || "[]")));
  if (new Set(moves.map((m) => m.id)).size !== moves.length)
    throw Error("Duplicate challenge moves.");
  const moved = new Map(moves.map((m) => [m.id, m]));
  for (const move of moves)
    if (!state.challenges.some((c) => c.id === move.id && c.map === patch.id))
      throw Error("Select a saved challenge on this map.");
  const challenges = state.challenges.map((c) =>
    moved.has(c.id)
      ? { ...c, location: { x: moved.get(c.id).x, y: moved.get(c.id).y } }
      : c,
  );
  const engine = createWorld(next.world),
    invalid = challenges.filter(
      (c) => !engine.canPlaceChallenge(c.map, c.location.x, c.location.y),
    );
  if (invalid.length)
    throw Error(
      "Move challenges off unusable tiles before saving: " +
        invalid.map((c) => `${c.object} (${c.id})`).join(", "),
    );
  const occupied = new Set();
  for (const c of challenges) {
    const key = `${c.map}:${c.location.x},${c.location.y}`;
    if (occupied.has(key))
      throw Error(
        "Two challenges cannot share a tile. Move them to separate tiles before saving.",
      );
    occupied.add(key);
  }
  const exported = await exportPack(
    "theme",
    { theme: state.theme },
    state.store,
    state.readBaseAsset,
  );
  const entries = unzipSync(new Uint8Array(await exported.arrayBuffer()));
  const used = new Set(themeAssetPaths(next).map((p) => "assets" + p));
  for (const key of Object.keys(entries))
    if (key.startsWith("assets/") && !used.has(key)) delete entries[key];
  for (const path of themeAssetPaths(next)) {
    if (path === imagePath || entries["assets" + path]) continue;
    const asset = await readAsset(path, state.store, state.readBaseAsset);
    if (!asset) throw Error("The previous map artwork is unavailable.");
    entries["assets" + path] = asset;
  }
  entries["theme.yaml"] = strToU8(stringify(next));
  if (imageBytes) entries["assets" + imagePath] = imageBytes;
  const packed = new FormData();
  packed.set("file", new Blob([zipSync(entries)]), "map-theme.zip");
  if (moves.length) {
    const content = await exportPack(
      "content",
      { challenges },
      state.store,
      state.readBaseAsset,
    );
    packed.set(
      "content",
      new Blob([await content.arrayBuffer()]),
      "moved-content.zip",
    );
  }
  for (const key of ["themeRevision", "contentRevision"])
    if (form.has(key)) packed.set(key, String(form.get(key)));
  const result = await importPacks(
    new Request(req.url, { method: "POST", body: packed }),
    state,
    "theme",
  );
  const explicitMoves = challenges.flatMap((c) => {
    const before = state.challenges.find((old) => old.id === c.id);
    return before.location.x !== c.location.x ||
      before.location.y !== c.location.y
      ? [
          {
            id: c.id,
            object: c.object,
            from: { map: before.map, ...before.location },
            to: { map: c.map, ...c.location },
          },
        ]
      : [];
  });
  return {
    ...result,
    placement: { ...result.placement, moved: explicitMoves },
  };
}
