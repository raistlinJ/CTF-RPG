import { MAP_IDS } from "./world-data.mjs";
import { parse } from "yaml";
import { z } from "zod";
const localPath = z
  .string()
  .regex(/^\/(?!\/)[a-zA-Z0-9_./-]+$/)
  .refine((p) => !p.split("/").includes(".."), "Paths must not contain ..");
const id = z.string().regex(/^[a-z0-9-]+$/);
const character = z.object({
  id,
  name: z.string().min(1).max(80),
  subtitle: z.string().max(120).default("Ready for adventure."),
  sprite: localPath.nullable().default(null),
  fallback: z.enum(["web", "thunder", "shield"]).default("web"),
});
const account = z
  .object({
    username: z
      .string()
      .regex(/^[a-zA-Z0-9_-]{3,24}$/)
      .transform((s) => s.toLowerCase()),
    password: z.string().min(8).max(128).optional(),
    passwordHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    salt: z.string().min(1).max(128).optional(),
    hero: id.optional(),
    role: z.enum(["student", "admin"]).default("student"),
  })
  .superRefine((a, ctx) => {
    if (a.password && a.passwordHash)
      ctx.addIssue({
        code: "custom",
        message: "Use password or passwordHash, not both",
      });
    if (!a.password && !(a.passwordHash && a.salt))
      ctx.addIssue({
        code: "custom",
        message: "An account needs a password or a passwordHash and salt",
      });
  });
export function parseGame(raw) {
  const config = z
    .object({
      teams: z
        .object({ maxMembers: z.number().int().min(1).max(100).default(4) })
        .default({ maxMembers: 4 }),
      admin: z
        .object({
          platformEmails: z
            .array(
              z
                .string()
                .email()
                .transform((s) => s.toLowerCase()),
            )
            .default([]),
        })
        .default({ platformEmails: [] }),
      characters: z.array(character).min(1).max(30),
      accounts: z
        .object({
          allowRegistration: z.boolean().default(false),
          users: z.array(account).max(10000).default([]),
        })
        .default({ allowRegistration: false, users: [] }),
      audio: z
        .object({
          midi: localPath.nullable().default(null),
          loop: z.boolean().default(true),
          volume: z.number().min(0).max(1).default(0.15),
        })
        .default({ midi: null, loop: true, volume: 0.15 }),
    })
    .parse(parse(raw));
  if (
    new Set(config.characters.map((c) => c.id)).size !==
    config.characters.length
  )
    throw Error("Duplicate character IDs");
  if (
    new Set(config.accounts.users.map((u) => u.username)).size !==
    config.accounts.users.length
  )
    throw Error("Duplicate usernames");
  for (const u of config.accounts.users)
    if (u.hero && !config.characters.some((c) => c.id === u.hero))
      throw Error("Account refers to unknown hero");
  return config;
}
export function publicConfig(config) {
  return {
    characters: config.characters,
    audio: config.audio,
    allowRegistration: config.accounts.allowRegistration,
  };
}
const hintSchema = z
  .object({
    id,
    label: z.string().min(1).max(120).optional(),
    text: z.string().min(1).max(10000),
    cost: z.number().int().min(0).max(10000).default(0),
  })
  .strict();
const downloadUrl = z.union([
  localPath,
  z
    .string()
    .url()
    .refine(
      (url) => new URL(url).protocol === "https:",
      "External downloads must use HTTPS",
    ),
]);
const downloadSchema = z
  .object({
    name: z.string().min(1).max(200),
    url: downloadUrl,
    filename: z
      .string()
      .regex(/^[a-zA-Z0-9_.-]+$/)
      .optional(),
  })
  .strict();
const challenge = z
  .object({
    id,
    map: id.default("town"),
    object: z.string().min(1),
    location: z.object({
      x: z.number().int(),
      y: z.number().int(),
    }),
    region: z.string(),
    text: z.string().min(1).max(20000).optional(),
    flags: z.array(z.string().min(1).max(500)).max(100).optional(),
    grading: z.enum(["automatic", "manual"]).default("automatic"),
    caseSensitive: z.boolean().default(false),
    points: z.number().int().positive().max(10000),
    hints: z.array(hintSchema).max(20).optional(),
    downloads: z.array(downloadSchema).max(20).default([]),
    // Compatibility with the original challenge YAML.
    prompt: z.string().min(1).max(20000).optional(),
    answers: z.array(z.string().min(1).max(500)).min(1).max(100).optional(),
    hint: z.string().optional(),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (!(c.text || c.prompt))
      ctx.addIssue({ code: "custom", message: "Challenge text is required" });
    if (c.grading === "automatic" && !(c.flags || c.answers || []).length)
      ctx.addIssue({
        code: "custom",
        message: "At least one accepted flag is required",
      });
    if (c.text !== undefined && c.prompt !== undefined)
      ctx.addIssue({ code: "custom", message: "Use text or prompt, not both" });
    if (c.flags !== undefined && c.answers !== undefined)
      ctx.addIssue({
        code: "custom",
        message: "Use flags or answers, not both",
      });
    if (c.hints !== undefined && c.hint !== undefined)
      ctx.addIssue({ code: "custom", message: "Use hints or hint, not both" });
    const hints = c.hints || [];
    if (new Set(hints.map((h) => h.id)).size !== hints.length)
      ctx.addIssue({ code: "custom", message: "Duplicate hint IDs" });
    if (hints.reduce((sum, h) => sum + h.cost, 0) > c.points)
      ctx.addIssue({
        code: "custom",
        message: "Total hint cost cannot exceed challenge points",
      });
    if ((c.flags || c.answers || []).some((f) => !f.trim()))
      ctx.addIssue({
        code: "custom",
        message: "Flags must not be whitespace-only",
      });
  })
  .transform((c) => ({
    id: c.id,
    map: c.map,
    object: c.object,
    location: c.location,
    region: c.region,
    text: c.text ?? c.prompt,
    grading: c.grading,
    flags: c.flags ?? c.answers ?? [],
    caseSensitive: c.caseSensitive,
    points: c.points,
    hints: (
      c.hints ?? (c.hint ? [{ id: "hint", text: c.hint, cost: 0 }] : [])
    ).map((h, i) => ({ ...h, label: h.label || `Hint ${i + 1}` })),
    downloads: c.downloads,
  }));
/** @param {string} raw @param {string[] | null} [mapIds] */
export function parseChallenges(
  raw,
  mapIds = MAP_IDS,
  allowRelocation = false,
) {
  const { challenges } = z
    .object({ challenges: z.array(challenge).max(100) })
    .strict()
    .parse(parse(raw));
  if (mapIds && challenges.some((c) => !mapIds.includes(c.map)))
    throw Error("Challenge refers to unknown map");
  if (new Set(challenges.map((c) => c.id)).size !== challenges.length)
    throw Error("Duplicate challenge IDs");
  if (
    !allowRelocation &&
    challenges.some(
      (c) =>
        c.location.x < 0 ||
        c.location.x > 39 ||
        c.location.y < 0 ||
        c.location.y > 27,
    )
  )
    throw Error("Challenge location is outside the map grid");
  if (
    !allowRelocation &&
    new Set(challenges.map((c) => `${c.map}:${c.location.x},${c.location.y}`))
      .size !== challenges.length
  )
    throw Error("Duplicate challenge locations");
  return challenges;
}
export const normalize = (s, caseSensitive = false) =>
  caseSensitive ? s.trim() : s.trim().toLowerCase();
