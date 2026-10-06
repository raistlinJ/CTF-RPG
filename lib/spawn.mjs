import { z } from "zod";
import { createWorld } from "./world-data.mjs";
export const spawnSchema = z
  .object({
    map: z.string().regex(/^[a-z0-9-]+$/),
    location: z
      .object({
        x: z.number().int().min(0).max(39),
        y: z.number().int().min(0).max(27),
      })
      .strict(),
  })
  .strict();
export function canSpawn(world, map, x, y) {
  return createWorld(world).canSpawn(map, x, y);
}
export function resolveSpawn(assignment, world) {
  if (
    assignment &&
    canSpawn(
      world,
      assignment.map,
      assignment.location.x,
      assignment.location.y,
    )
  )
    return { map: assignment.map, location: { ...assignment.location } };
  const info = world.maps.find((m) => m.id === world.startMap);
  return { map: info.id, location: { ...info.spawn } };
}
