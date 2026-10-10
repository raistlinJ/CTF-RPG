import { z } from "zod";
import { KEY_COLORS, normalizeIncantation } from "./inventory-data.mjs";
export * from "./inventory-data.mjs";

export const incantationSchema = z.string().trim().min(1).max(80).refine(s => !/[\r\n]/.test(s), "An incantation must be a single short phrase.");
export const lockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("key"), color: z.enum(KEY_COLORS) }).strict(),
  z.object({ type: z.literal("incantation"), phrase: incantationSchema }).strict(),
]);
export const rewardsSchema = z.object({
  keys: z.array(z.enum(KEY_COLORS)).max(KEY_COLORS.length).default([]),
  incantations: z.array(incantationSchema).max(20).default([]),
}).strict().superRefine((r, ctx) => {
  if (new Set(r.keys).size !== r.keys.length || new Set(r.incantations.map(normalizeIncantation)).size !== r.incantations.length)
    ctx.addIssue({ code: "custom", message: "Reward keys and incantations must be unique." });
});
