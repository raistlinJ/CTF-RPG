import { unzipSync, zipSync, strToU8 } from "fflate";
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
  for (const key of ["themeRevision", "contentRevision", "dropOverflow"])
    if (form.has(key)) packed.set(key, String(form.get(key)));
  return importPacks(
    new Request(req.url, { method: "POST", body: packed }),
    state,
    "theme",
  );
}
