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
const account = z.object({
  username: z
    .string()
    .regex(/^[a-zA-Z0-9_-]{3,24}$/)
    .transform((s) => s.toLowerCase()),
  password: z.string().min(8).max(128),
  hero: id.optional(),
});
export function parseGame(raw) {
  const config = z
    .object({
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
const challenge = z.object({
  id,
  object: z.string().min(1),
  location: z.object({
    x: z.number().int().min(0).max(39),
    y: z.number().int().min(0).max(27),
  }),
  region: z.string(),
  prompt: z.string().min(1),
  answers: z.array(z.string().min(1)).min(1),
  points: z.number().int().positive().max(10000),
  hint: z.string(),
});
export function parseChallenges(raw) {
  const { challenges } = z
    .object({ challenges: z.array(challenge).max(100) })
    .parse(parse(raw));
  if (new Set(challenges.map((c) => c.id)).size !== challenges.length)
    throw Error("Duplicate challenge IDs");
  if (
    new Set(challenges.map((c) => `${c.location.x},${c.location.y}`)).size !==
    challenges.length
  )
    throw Error("Duplicate challenge locations");
  return challenges;
}
export const normalize = (s) => s.trim().toLowerCase().replace(/\s+/g, " ");
