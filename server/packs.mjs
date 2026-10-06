import { planChallengePlacement } from "../lib/challenge-placement.mjs";
import { gradingCompatible } from "./review.mjs";
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import { parse, stringify } from "yaml";
import {
  parseTheme,
  defaultTheme,
  themeAssetPaths,
  mapThemeAssets,
} from "../lib/theme-schema.mjs";
import { createWorld } from "../lib/world-data.mjs";
import { parseChallenges } from "../lib/config-schema.mjs";
import { kitBase64 } from "./recreation-kit.mjs";
export const PACK_LIMIT = 8 * 1024 * 1024;
export const assetTypes = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  mid: "audio/midi",
  midi: "audio/midi",
  pdf: "application/pdf",
  txt: "text/plain; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  zip: "application/zip",
  bin: "application/octet-stream",
};
export const assetKeyPattern =
  /^[a-f0-9]{64}\.(png|jpg|jpeg|webp|gif|mid|midi|pdf|txt|csv|zip|bin)$/;
let seed;
export function seedAsset(path) {
  seed ??= unzipSync(Uint8Array.from(atob(kitBase64), (c) => c.charCodeAt(0)));
  return seed["public" + path] || null;
}
export async function activeTheme(db, config) {
  const row = await db
    .prepare("SELECT payload,revision FROM theme_catalog WHERE id='active'")
    .bind()
    .first();
  return {
    theme: row ? parseTheme(JSON.parse(row.payload)) : defaultTheme(config),
    revision: row?.revision || 0,
  };
}
export async function readAsset(path, store, readBase = seedAsset) {
  if (path.startsWith("/api/assets/")) {
    const key = path.slice("/api/assets/".length);
    if (!assetKeyPattern.test(key)) return null;
    return store ? await store.get(key) : null;
  }
  return readBase(path);
}
export function themeContentValid(theme, challenges) {
  const w = createWorld(theme.world);
  for (const c of challenges)
    if (!w.canPlaceChallenge(c.map, c.location.x, c.location.y))
      throw Error(
        `Challenge ${c.id} is not on reachable ground in theme map ${c.map}. Import a matching content pack alongside this theme, or move/remove the challenge first.`,
      );
}
const contentPaths = (cs) => [
  ...new Set(
    cs
      .flatMap((c) => c.downloads.map((d) => d.url))
      .filter((p) => p.startsWith("/")),
  ),
];
async function packageAssets(entries, paths, store, readBase) {
  let total = 0;
  for (const path of paths) {
    const bytes = await readAsset(path, store, readBase);
    if (!bytes) throw Error(`Missing local asset: ${path}`);
    total += bytes.length;
    if (total > PACK_LIMIT) throw Error("Assets exceed the 8 MB pack limit.");
    entries["assets" + path] = bytes;
  }
}
export async function exportPack(kind, state, store, readBase) {
  const entries = {};
  if (kind === "theme") {
    entries["theme.yaml"] = strToU8(stringify(state.theme));
    await packageAssets(entries, themeAssetPaths(state.theme), store, readBase);
  } else {
    entries["content.yaml"] = strToU8(
      stringify({
        format: "quest-content",
        version: 1,
        challenges: state.challenges,
      }),
    );
    await packageAssets(
      entries,
      contentPaths(state.challenges),
      store,
      readBase,
    );
  }
  return new Response(zipSync(entries, { level: 6 }), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="quest-${kind}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
function unpack(bytes, kind) {
  if (bytes.length > PACK_LIMIT) throw Error("Each ZIP must be at most 8 MB.");
  let size = 0,
    count = 0;
  const names = new Set();
  const entries = unzipSync(bytes, {
    filter: (f) => {
      if (
        ++count > 250 ||
        names.has(f.name) ||
        f.name.split("/").includes("..") ||
        f.name.includes("//")
      )
        throw Error("Invalid/duplicate ZIP entry path or too many files.");
      names.add(f.name);
      size += f.originalSize;
      if (size > PACK_LIMIT || f.originalSize > 4 * 1024 * 1024)
        throw Error(
          "Expanded ZIP exceeds the 8 MB total / 4 MB per-file limit.",
        );
      if (
        f.name === "assets/" ||
        /^assets\/(?:[a-zA-Z0-9_.-]+\/)+$/.test(f.name) ||
        f.name === ".DS_Store" ||
        f.name.endsWith("/.DS_Store") ||
        f.name.startsWith("__MACOSX/")
      )
        return false;
      if (!/^([a-z]+\.yaml|assets\/[a-zA-Z0-9_./-]+)$/.test(f.name))
        throw Error("Invalid ZIP entry path.");
      return true;
    },
  });
  const filename = kind === "theme" ? "theme.yaml" : "content.yaml";
  if (
    !entries[filename] ||
    Object.keys(entries).some((n) => n !== filename && !n.startsWith("assets/"))
  )
    throw Error(
      `This is not a ${kind} pack. Expected ${filename} and assets/.`,
    );
  const raw = parse(strFromU8(entries[filename]));
  let value;
  if (kind === "theme") value = parseTheme(raw);
  else {
    if (
      raw?.format !== "quest-content" ||
      raw?.version !== 1 ||
      Object.keys(raw).some(
        (k) => !["format", "version", "challenges"].includes(k),
      )
    )
      throw Error("Unsupported content manifest.");
    value = parseChallenges(
      stringify({ challenges: raw.challenges }),
      null,
      true,
    );
  }
  return { entries, value };
}
export function assertAsset(bytes, ext) {
  const text = (a, b) => String.fromCharCode(...bytes.slice(a, b));
  if (
    (ext === "png" &&
      ![137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)) ||
    (["jpg", "jpeg"].includes(ext) &&
      !(bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)) ||
    (ext === "gif" && !["GIF87a", "GIF89a"].includes(text(0, 6))) ||
    (ext === "webp" && !(text(0, 4) === "RIFF" && text(8, 12) === "WEBP")) ||
    (["mid", "midi"].includes(ext) &&
      !(text(0, 4) === "MThd" && bytes.length >= 14)) ||
    (ext === "pdf" && text(0, 5) !== "%PDF-") ||
    (ext === "zip" && text(0, 2) !== "PK")
  )
    throw Error("Asset bytes do not match their file extension.");
  if (["txt", "csv"].includes(ext))
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
async function stage(pack, kind, store) {
  const paths =
      kind === "theme" ? themeAssetPaths(pack.value) : contentPaths(pack.value),
    rewrite = new Map();
  for (const path of paths) {
    const bytes = pack.entries["assets" + path],
      extRaw = path.split(".").pop().toLowerCase(),
      ext = kind === "content" && !assetTypes[extRaw] ? "bin" : extRaw;
    if (!bytes) throw Error(`Pack is missing asset ${path}`);
    if (
      !assetTypes[ext] ||
      (kind === "theme" &&
        !["png", "jpg", "jpeg", "webp", "gif", "mid", "midi"].includes(ext))
    )
      throw Error(`Unsupported asset type: ${ext}`);
    assertAsset(bytes, ext);
    if (!store) throw Error("Asset storage is unavailable.");
    const digest = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
        (b) => b.toString(16).padStart(2, "0"),
      ).join(""),
      key = digest + "." + ext;
    await store.put(key, bytes, assetTypes[ext]);
    rewrite.set(path, "/api/assets/" + key);
  }
  return kind === "theme"
    ? mapThemeAssets(pack.value, (p) => rewrite.get(p))
    : pack.value.map((c) => ({
        ...c,
        downloads: c.downloads.map((d) => ({
          ...d,
          url: rewrite.get(d.url) || d.url,
          ...(rewrite.has(d.url) && !d.filename
            ? { filename: d.url.split("/").pop() }
            : {}),
        })),
      }));
}
export async function importPacks(
  req,
  { db, config, theme, themeRevision, challenges, contentRevision, store },
  kind,
) {
  const reader = req.body?.getReader();
  if (!reader) throw Error("Select a ZIP pack.");
  let length = 0;
  const chunks = [];
  for (;;) {
    const r = await reader.read();
    if (r.done) break;
    length += r.value.length;
    if (length > 17 * 1024 * 1024) {
      await reader.cancel();
      throw Error("Import request exceeds 17 MB.");
    }
    chunks.push(r.value);
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const c of chunks) {
    body.set(c, offset);
    offset += c.length;
  }
  const form = await new Request(req.url, {
      method: "POST",
      headers: req.headers,
      body,
    }).formData(),
    file = form.get("file"),
    paired = form.get("content");
  if (!file || typeof file.arrayBuffer !== "function")
    throw Error("Select a ZIP pack.");
  if (
    Number(form.get("themeRevision")) !== themeRevision ||
    Number(form.get("contentRevision")) !== contentRevision
  )
    throw Error(
      "The theme or challenges changed. Refresh this page before importing.",
    );
  const primary = unpack(new Uint8Array(await file.arrayBuffer()), kind),
    secondary =
      paired && typeof paired.arrayBuffer === "function" && paired.size
        ? unpack(new Uint8Array(await paired.arrayBuffer()), "content")
        : null;
  const nextTheme = kind === "theme" ? primary.value : theme,
    nextContent =
      kind === "content" ? primary.value : secondary?.value || challenges;
  const placement = planChallengePlacement(nextTheme, nextContent);
  await gradingCompatible(db, challenges, nextContent);
  const ids = new Set(nextTheme.characters.map((c) => c.id)),
    accounts = (
      await db.prepare("SELECT username,hero FROM students").bind().all()
    ).results;
  if (
    kind === "theme" &&
    (accounts.some((a) => !ids.has(a.hero)) ||
      config.accounts.users.some((a) => a.hero && !ids.has(a.hero)))
  )
    throw Error(
      "The theme must retain character IDs used by existing accounts. Reassign those accounts before removing a character.",
    );
  if (placement.excluded.length && form.get("dropOverflow") !== "true")
    return {
      needsDecision: true,
      placement: {
        moved: placement.moved,
        excluded: placement.excluded,
        kept: placement.challenges.length,
      },
    };
  if (kind === "content") primary.value = placement.challenges;
  else if (secondary) secondary.value = placement.challenges;
  themeContentValid(nextTheme, placement.challenges);
  // Immutable assets are written first. A failed import leaves the active theme/content unchanged.
  const appliedTheme =
      kind === "theme" ? await stage(primary, "theme", store) : null,
    appliedContent =
      kind === "content"
        ? await stage(primary, "content", store)
        : secondary
          ? await stage(secondary, "content", store)
          : placement.moved.length || placement.excluded.length
            ? placement.challenges
            : null;
  const statements = [];
  if (appliedTheme)
    statements.push(
      db
        .prepare(
          "INSERT INTO theme_catalog(id,payload,revision) SELECT 'active',?,? WHERE COALESCE((SELECT revision FROM theme_catalog WHERE id='active'),0)=? AND COALESCE((SELECT revision FROM challenge_catalog WHERE id='active'),0)=? ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,revision=excluded.revision",
        )
        .bind(
          JSON.stringify(appliedTheme),
          themeRevision + 1,
          themeRevision,
          contentRevision,
        ),
    );
  if (appliedContent)
    statements.push(
      db
        .prepare(
          `INSERT INTO challenge_catalog(id,payload,revision) SELECT 'active',?,? WHERE COALESCE((SELECT revision FROM challenge_catalog WHERE id='active'),0)=? AND COALESCE((SELECT revision FROM theme_catalog WHERE id='active'),0)=? ${appliedTheme ? "AND changes()=1" : ""} ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,revision=excluded.revision`,
        )
        .bind(
          JSON.stringify(appliedContent),
          contentRevision + 1,
          contentRevision,
          appliedTheme ? themeRevision + 1 : themeRevision,
        ),
    );
  const results = await db.batch(statements);
  if (results.some((r) => !(r.meta?.changes ?? r.changes)))
    throw Error(
      "Another admin changed the packs while importing. Refresh and try again.",
    );
  return {
    placement: {
      moved: placement.moved,
      excluded: placement.excluded,
      kept: placement.challenges.length,
    },
    themeRevision: themeRevision + (appliedTheme ? 1 : 0),
    contentRevision: contentRevision + (appliedContent ? 1 : 0),
  };
}
