// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
import { z } from "zod";
import { lockSchema } from "./inventory.mjs";
import { BOSS_STYLES, CUSTOM_BOSS_ID } from "./challenge-icon.mjs";
import { entitiesSchema, entityLocationAvailable } from "./non-player-entities.mjs";
import { defaultWorld, createWorld, themePortals } from "./world-data.mjs";
import { SOUND_EVENTS, defaultSoundConfig } from "./sound-events.mjs";
const id = z.string().regex(/^[a-z0-9-]+$/),
  color = z.string().regex(/^#[a-fA-F0-9]{6}$/),
  path = z
    .string()
    .regex(/^\/(?!\/)[a-zA-Z0-9_./-]+$/)
    .refine((p) => !p.split("/").includes(".."));
const point = z
    .object({
      x: z.number().int().min(0).max(39),
      y: z.number().int().min(0).max(27),
    })
    .strict(),
  rect = point
    .extend({
      w: z.number().int().min(1).max(40),
      h: z.number().int().min(1).max(28),
    })
    .strict();
const map = z
  .object({
    id,
    name: z.string().min(1).max(80),
    bounds: z
      .object({
        left: z.number().int().min(0).max(39),
        right: z.number().int().min(0).max(39),
        top: z.number().int().min(0).max(27),
        bottom: z.number().int().min(0).max(27),
      })
      .strict(),
    spawn: point,
    exit: point.nullable().default(null),
    background: path.nullable().default(null),
    music: path.nullable().default(null),
    originalBackground: path.nullable().optional(),
    floor: color.default("#dfedef"),
    wall: color.default("#1b2e39"),
    obstacles: z.array(rect).max(1120).default([]),
    ground: z
      .array(
        z.tuple([
          z.number().int().min(0).max(39),
          z.number().int().min(0).max(27),
        ]),
      )
      .max(1120)
      .nullable()
      .default(null),
  })
  .strict();
export function parseTheme(input) {
  const theme = z
    .object({
      format: z.literal("quest-theme"),
      version: z.literal(1),
      title: z.string().min(1).max(80),
      badge: z.enum(["snowflake", "cpu", "compass"]).default("compass"),
      description: z.string().max(300).default(""),
      world: z
        .object({
          startMap: id,
          entities: entitiesSchema.default([]),
          renderer: z.literal("tiles").default("tiles"),
          maps: z.array(map).min(1).max(30),
          buildings: z
            .array(
              rect
                .extend({
                  id,
                  name: z.string().min(1).max(80),
                  door: point,
                  color,
                })
                .strict(),
            )
            .max(29)
            .default([]),
          transports: z
            .array(z.object({ id, map: id, location: point, to: id, lock: lockSchema.nullable().optional() }).strict())
            .max(200)
            .default([]),
          portalOverrides: z
            .array(z.object({ id, location: point, to: id, lock: lockSchema.nullable().optional() }).strict())
            .max(58)
            .default([]),
          trees: z
            .array(
              z.tuple([
                z.number().int().min(0).max(39),
                z.number().int().min(0).max(27),
              ]),
            )
            .max(200)
            .default([]),
        })
        .strict(),
      characters: z
        .array(
          z
            .object({
              id,
              name: z.string().min(1).max(80),
              subtitle: z.string().max(120).default("Ready for adventure."),
              sprite: path.nullable().default(null),
              fallback: z.enum(["web", "thunder", "shield"]).default("web"),
              appearanceFor: z.enum(["player", "entity", "both"]).default("both"),
            })
            .strict(),
        )
        .min(1)
        .max(30),
      media: z.array(z.object({
        id,
        name: z.string().min(1).max(120),
        src: path,
        source: z.enum(["upload", "theme"]).default("upload"),
      }).strict()).max(60).default([]),
      bosses: z.array(z.object({id:z.string().regex(CUSTOM_BOSS_ID),label:z.string().trim().min(1).max(80)}).strict()).max(30).default([]),
      bossSprites: z.record(id, path).default({}),
      adminSprite: path.nullable().default(null),
      audio: z
        .object({
          midi: path.nullable().default(null),
          playlist: z.array(z.object({name:z.string().min(1).max(120),midi:path}).strict()).max(20).default([]),
          loop: z.boolean().default(true),
          volume: z.number().min(0).max(1).default(0.15),
        })
        .strict(),
      sounds: z.object({
        clips: z.array(z.object({ name: z.string().min(1).max(120), src: path, source: z.enum(["theme", "upload"]).default("theme") }).strict()).max(40).default([]),
        maps: z.record(id, path.nullable()).default({}),
        events: z.record(z.string(), path.nullable()).default({}),
      }).strict().default({}),
    })
    .strict()
    .parse(input);
  const bossIds = new Set([...BOSS_STYLES, ...theme.bosses].map(b => b.id));
  if (new Set(theme.bosses.map(b=>b.id)).size !== theme.bosses.length ||
      theme.bosses.some(b=>!theme.bossSprites[b.id]) || Object.keys(theme.bossSprites).some(id=>!bossIds.has(id)))
    throw Error("Custom bosses need unique IDs and an assigned image; boss images must belong to a defined appearance.");
  for (const path of [
    ...theme.world.maps.flatMap((m) => [m.background, m.originalBackground]),
    ...theme.characters.map((c) => c.sprite),
    theme.adminSprite,
    ...theme.media.map((item) => item.src),
    ...Object.values(theme.bossSprites),
  ].filter(Boolean))
    if (!/\.(png|jpe?g|webp|gif)$/i.test(path))
      throw Error("Map artwork and sprites must be PNG, JPEG, WebP, or GIF.");
  if ([theme.audio.midi, ...theme.audio.playlist.map(t=>t.midi)].filter(Boolean).some(p=>!/\.midi?$/i.test(p)))
    throw Error("Theme audio must use a MIDI file.");
  const availableMusic = new Set(theme.audio.playlist.length
    ? theme.audio.playlist.map(t => t.midi)
    : [theme.audio.midi].filter(Boolean));
  if (theme.world.maps.some(m => m.music && !availableMusic.has(m.music)))
    throw Error("Map music must be selected from the theme audio playlist.");
  const clipPaths = new Set(theme.sounds.clips.map(clip => clip.src));
  if (theme.sounds.clips.some(clip => !/\.(wav|mp3|ogg)$/i.test(clip.src)) || clipPaths.size !== theme.sounds.clips.length)
    throw Error("Sound clips must be unique WAV, MP3, or OGG files.");
  if (Object.entries(theme.sounds.maps).some(([mapId, src]) => !theme.world.maps.some(map => map.id === mapId) || (src && !clipPaths.has(src))) ||
      Object.entries(theme.sounds.events).some(([eventId, src]) => !SOUND_EVENTS.some(event => event.id === eventId) || (src && !clipPaths.has(src))))
    throw Error("Sound assignments must use an existing map, event, and clip.");
  const base = createWorld({ ...theme.world, portalOverrides: [] });
  const w = createWorld(theme.world),
    ids = w.MAP_IDS;
  for (const entity of theme.world.entities) {
    if (!theme.characters.some(c => c.id === entity.characterId))
      throw Error(`${entity.name}: choose an existing character appearance.`);
    if (!entityLocationAvailable(w, [], theme.world.entities, entity.map, entity.location.x, entity.location.y, entity.id))
      throw Error(`${entity.name}: the full allocation must be clear of spawns, doors, transport and other entities. Non-walkable ground is allowed.`);
  }
  if (
    new Set(ids).size !== ids.length ||
    !ids.includes(theme.world.startMap) ||
    new Set(theme.characters.map((c) => c.id)).size !== theme.characters.length ||
    new Set(theme.media.map((item) => item.id)).size !== theme.media.length
  )
    throw Error("Duplicate map/character IDs or unknown starting map.");
  if (!theme.characters.some(c => c.appearanceFor !== "entity"))
    throw Error("A theme needs at least one player appearance.");
  if (
    new Set(theme.world.buildings.map((b) => b.id)).size !==
      theme.world.buildings.length ||
    theme.world.buildings.some(b => !ids.includes(b.id) || b.id === theme.world.startMap)
  )
    throw Error("Entrance buildings need unique IDs for existing interior maps.");
  for (const m of theme.world.maps) {
    if (
      m.bounds.left > m.bounds.right ||
      m.bounds.top > m.bounds.bottom ||
      !w.reachable(m.id, m.spawn.x, m.spawn.y)
    )
      throw Error(`Invalid bounds or blocked spawn: ${m.id}`);
    if (
      theme.world.buildings.some(b => b.id === m.id) &&
      (!m.exit ||
        (!theme.world.portalOverrides.some((o) => o.id === `exit-${m.id}`) &&
          (base.blocked(m.id, m.exit.x, m.exit.y) ||
            ![
              [1, 0],
              [-1, 0],
              [0, 1],
              [0, -1],
            ].some(([dx, dy]) =>
              base.canPlaceChallenge(m.id, m.exit.x + dx, m.exit.y + dy),
            ))))
    )
      throw Error(`Interior exit must be reachable from its spawn: ${m.id}`);
    if (m.obstacles.some((b) => b.x + b.w > 40 || b.y + b.h > 28))
      throw Error("Obstacle exceeds the map grid.");
  }
  const doors = new Set();
  for (const b of theme.world.buildings) {
    if (
      !ids.includes(b.id) ||
      b.id === theme.world.startMap ||
      b.x + b.w > 40 ||
      b.y + b.h > 28 ||
      b.door.x < b.x ||
      b.door.x >= b.x + b.w ||
      b.door.y !== b.y + b.h - 1 ||
      (!theme.world.portalOverrides.some((o) => o.id === `entrance-${b.id}`) &&
        (!base.canPlaceChallenge(
          theme.world.startMap,
          b.door.x,
          b.door.y + 1,
        ) ||
          base.blocked(theme.world.startMap, b.door.x, b.door.y))) ||
      doors.has(`${b.door.x},${b.door.y}`)
    )
      throw Error(`Invalid or unreachable building entrance: ${b.id}`);
    doors.add(`${b.door.x},${b.door.y}`);
  }
  if (
    theme.world.buildings.some((b, i) =>
      theme.world.buildings.some(
        (c, j) =>
          i < j &&
          b.x < c.x + c.w &&
          b.x + b.w > c.x &&
          b.y < c.y + c.h &&
          b.y + b.h > c.y,
      ),
    )
  )
    throw Error("Buildings must not overlap.");
  const defaults = themePortals({ ...theme.world, portalOverrides: [] });
  const overrideIds = new Set();
  for (const o of theme.world.portalOverrides) {
    const original = defaults.find((p) => p.id === o.id);
    if (
      !original ||
      overrideIds.has(o.id) ||
      !ids.includes(o.to) ||
      original.map === o.to
    )
      throw Error(
        "Theme transport overrides need a unique predefined ID and a different existing destination map.",
      );
    const source = w.mapInfo(original.map);
    if (o.location.x === source.spawn.x && o.location.y === source.spawn.y)
      throw Error("Theme transports must not replace a map spawn.");
    overrideIds.add(o.id);
  }
  const portalCells = new Set();
  for (const p of w.portals) {
    const key = `${p.map}:${p.location.x},${p.location.y}`;
    if (
      portalCells.has(key) ||
      !w.reachable(p.map, p.location.x, p.location.y) ||
      !w.canSpawn(p.to, p.arrival.x, p.arrival.y)
    )
      throw Error(
        `Theme transport ${p.id} needs a unique reachable tile and a reachable arrival.`,
      );
    portalCells.add(key);
    if (
      theme.world.transports.some(
        (t) =>
          t.map === p.map &&
          t.location.x === p.location.x &&
          t.location.y === p.location.y,
      )
    )
      throw Error("Transport tiles must not overlap theme entrances or exits.");
  }
  const transportIds = new Set(),
    occupied = new Set();
  for (const t of theme.world.transports) {
    const source = w.mapInfo(t.map),
      target = w.mapInfo(t.to),
      p = t.location;
    const key = `${t.map}:${p.x},${p.y}`;
    if (
      !source ||
      !target ||
      t.map === t.to ||
      transportIds.has(t.id) ||
      w.portals.some(p => p.id === t.id) ||
      occupied.has(key)
    )
      throw Error(
        "Transport IDs and source tiles must be unique, with two different existing maps.",
      );
    transportIds.add(t.id);
    occupied.add(key);
    if (
      (p.x === source.spawn.x && p.y === source.spawn.y) ||
      w.portals.some(
        (portal) =>
          portal.map === t.map &&
          portal.location.x === p.x &&
          portal.location.y === p.y,
      )
    )
      throw Error(`Transport ${t.id} must not replace a spawn, door, or exit.`);
    if (!w.reachable(t.map, p.x, p.y))
      throw Error(`Transport ${t.id} must be on reachable ground.`);
    if (
      ![
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([dx, dy]) =>
        w.canPlaceChallenge(t.to, target.spawn.x + dx, target.spawn.y + dy),
      )
    )
      throw Error(
        `Transport destination ${t.to} needs a reachable tile beside its spawn for the return trip.`,
      );
  }
  return theme;
}
export function defaultTheme(config) {
  return parseTheme({
    format: "quest-theme",
    version: 1,
    title: "North Pole Quest",
    badge: "snowflake",
    description: "The winter expedition",
    world: defaultWorld,
    characters: config.characters.map((c) => ({
      name: c.name || c.id,
      subtitle: c.subtitle || "",
      sprite: c.sprite || `/sprites/${c.fallback || "web"}.png`,
      fallback: c.fallback || "web",
      appearanceFor: c.appearanceFor || "both",
      id: c.id,
    })),
    audio: {
      midi: config.audio?.midi || null,
      playlist: config.audio?.playlist || [],
      loop: config.audio?.loop ?? true,
      volume: config.audio?.volume ?? 0.15,
    },
    ...(config.audio?.midi === "/audio/north-pole.mid" ? {
      sounds: defaultSoundConfig("/audio/sounds/north-pole", defaultWorld.maps.map(map => map.id)),
    } : {}),
  });
}
export const themeAssetPaths = (t) => [
  ...new Set(
    [
      ...t.world.maps.flatMap((m) => [m.background, m.originalBackground, m.music]),
      ...t.characters.map((c) => c.sprite),
      t.adminSprite,
      ...(t.media || []).map((item) => item.src),
      ...Object.values(t.bossSprites || {}),
      t.audio.midi,
      ...(t.audio.playlist || []).map(t=>t.midi),
      ...(t.sounds?.clips || []).map(clip=>clip.src),
    ].filter(Boolean),
  ),
];
export function mapThemeAssets(t, fn) {
  return {
    ...t,
    world: {
      ...t.world,
      maps: t.world.maps.map((m) => ({
        ...m,
        background: m.background ? fn(m.background) : null,
        music: m.music ? fn(m.music) : null,
        ...(Object.hasOwn(m, "originalBackground") ? { originalBackground: m.originalBackground ? fn(m.originalBackground) : null } : {}),
      })),
    },
    characters: t.characters.map((c) => ({
      ...c,
      sprite: c.sprite ? fn(c.sprite) : null,
    })),
    adminSprite: t.adminSprite ? fn(t.adminSprite) : null,
    media: (t.media || []).map((item) => ({ ...item, src: fn(item.src) })),
    bossSprites: Object.fromEntries(Object.entries(t.bossSprites || {}).map(([id, src]) => [id, fn(src)])),
    audio: { ...t.audio, midi: t.audio.midi ? fn(t.audio.midi) : null, playlist: (t.audio.playlist || []).map(t=>({...t,midi:fn(t.midi)})) },
    sounds: { ...t.sounds,
      clips: (t.sounds?.clips || []).map(clip => ({ ...clip, src: fn(clip.src) })),
      maps: Object.fromEntries(Object.entries(t.sounds?.maps || {}).map(([id, src]) => [id, src ? fn(src) : null])),
      events: Object.fromEntries(Object.entries(t.sounds?.events || {}).map(([id, src]) => [id, src ? fn(src) : null])),
    },
  };
}
