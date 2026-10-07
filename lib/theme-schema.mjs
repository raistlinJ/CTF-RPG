import { z } from "zod";
import { defaultWorld, createWorld, themePortals } from "./world-data.mjs";
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
            .array(z.object({ id, map: id, location: point, to: id }).strict())
            .max(200)
            .default([]),
          portalOverrides: z
            .array(z.object({ id, location: point, to: id }).strict())
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
            })
            .strict(),
        )
        .min(1)
        .max(30),
      audio: z
        .object({
          midi: path.nullable().default(null),
          loop: z.boolean().default(true),
          volume: z.number().min(0).max(1).default(0.15),
        })
        .strict(),
    })
    .strict()
    .parse(input);
  for (const path of [
    ...theme.world.maps.map((m) => m.background),
    ...theme.characters.map((c) => c.sprite),
  ].filter(Boolean))
    if (!/\.(png|jpe?g|webp|gif)$/i.test(path))
      throw Error("Map artwork and sprites must be PNG, JPEG, WebP, or GIF.");
  if (theme.audio.midi && !/\.midi?$/i.test(theme.audio.midi))
    throw Error("Theme audio must use a MIDI file.");
  const base = createWorld({ ...theme.world, portalOverrides: [] });
  const w = createWorld(theme.world),
    ids = w.MAP_IDS;
  if (
    new Set(ids).size !== ids.length ||
    !ids.includes(theme.world.startMap) ||
    new Set(theme.characters.map((c) => c.id)).size !== theme.characters.length
  )
    throw Error("Duplicate map/character IDs or unknown starting map.");
  if (
    new Set(theme.world.buildings.map((b) => b.id)).size !==
      theme.world.buildings.length ||
    theme.world.buildings.length !== ids.length - 1
  )
    throw Error("Each interior needs exactly one entrance building.");
  for (const m of theme.world.maps) {
    if (
      m.bounds.left > m.bounds.right ||
      m.bounds.top > m.bounds.bottom ||
      !w.reachable(m.id, m.spawn.x, m.spawn.y)
    )
      throw Error(`Invalid bounds or blocked spawn: ${m.id}`);
    if (
      m.id !== theme.world.startMap &&
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
      id: c.id,
    })),
    audio: {
      midi: config.audio?.midi || null,
      loop: config.audio?.loop ?? true,
      volume: config.audio?.volume ?? 0.15,
    },
  });
}
export const themeAssetPaths = (t) => [
  ...new Set(
    [
      ...t.world.maps.map((m) => m.background),
      ...t.characters.map((c) => c.sprite),
      t.audio.midi,
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
      })),
    },
    characters: t.characters.map((c) => ({
      ...c,
      sprite: c.sprite ? fn(c.sprite) : null,
    })),
    audio: { ...t.audio, midi: t.audio.midi ? fn(t.audio.midi) : null },
  };
}
