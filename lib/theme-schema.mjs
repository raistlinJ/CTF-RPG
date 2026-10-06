import { z } from "zod";
import { defaultWorld, createWorld } from "./world-data.mjs";
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
      !w.canPlaceChallenge(m.id, m.spawn.x, m.spawn.y)
    )
      throw Error(`Invalid bounds or blocked spawn: ${m.id}`);
    if (
      m.id !== theme.world.startMap &&
      (!m.exit ||
        w.blocked(m.id, m.exit.x, m.exit.y) ||
        ![
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].some(([dx, dy]) =>
          w.canPlaceChallenge(m.id, m.exit.x + dx, m.exit.y + dy),
        ))
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
      !w.canPlaceChallenge(theme.world.startMap, b.door.x, b.door.y + 1) ||
      w.blocked(theme.world.startMap, b.door.x, b.door.y) ||
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
