import { z } from "zod";

const id = z.string().min(1).max(80).regex(/^[a-z0-9-]+$/);
const normalize = text => text.trim().replace(/\s+/g, " ").toLowerCase();
export const entitySchema = z.object({
  id,
  name: z.string().trim().min(1).max(80),
  characterId: id,
  map: id,
  location: z.object({ x: z.number().int().min(0).max(39), y: z.number().int().min(0).max(27) }).strict(),
  dependsOn: z.array(z.string().regex(/^(?:[a-z0-9-]+|npe:[a-z0-9-]{1,80})$/)).max(199).default([]),
  startNode: id,
  nodes: z.array(z.object({
    id,
    text: z.string().trim().min(1).max(5000),
    choices: z.array(z.object({ id, label: z.string().trim().min(1).max(120), to: id }).strict()).max(10).default([]),
  }).strict()).min(1).max(50),
}).strict().superRefine((entity, ctx) => {
  const ids = new Set(entity.nodes.map(n => n.id));
  if (ids.size !== entity.nodes.length || !ids.has(entity.startNode))
    ctx.addIssue({ code: "custom", message: `${entity.name}: dialogue IDs must be unique and the first dialogue must exist.` });
  for (const node of entity.nodes) {
    if (new Set(node.choices.map(c => c.id)).size !== node.choices.length ||
        new Set(node.choices.map(c => normalize(c.label))).size !== node.choices.length ||
        node.choices.some(c => !ids.has(c.to)))
      ctx.addIssue({ code: "custom", message: `${entity.name}: choices need unique labels and IDs and an existing response dialogue.` });
    if (node.choices.some((c, index) => /^\d+$/.test(c.label) && Number(c.label) !== index + 1))
      ctx.addIssue({ code: "custom", message: `${entity.name}: a numeric choice label must match its displayed number.` });
  }
});
export const entitiesSchema = z.array(entitySchema).max(100).superRefine((entities, ctx) => {
  if (new Set(entities.map(e => e.id)).size !== entities.length ||
      new Set(entities.map(e => `${e.map}:${e.location.x},${e.location.y}`)).size !== entities.length)
    ctx.addIssue({ code: "custom", message: "Non-player entities need unique IDs and separate map locations." });
});
export const publicEntity = ({ id, name, characterId, map, location }) => ({ id, name, characterId, map, location });
export const publicDialogue = node => ({ id: node.id, text: node.text, choices: node.choices.map(({ id, label }) => ({ id, label })) });
export function resolveEntityDialogue(entity, choices = []) {
  let node = entity.nodes.find(n => n.id === entity.startNode);
  for (const id of choices) {
    const choice = node?.choices.find(c => c.id === id);
    if (!choice) throw Error("That choice is unavailable. Restart the conversation.");
    node = entity.nodes.find(n => n.id === choice.to);
  }
  if (!node) throw Error("This dialogue is unavailable.");
  return publicDialogue(node);
}
export function matchDialogueChoice(node, input) {
  const text = normalize(input);
  if (/^\d+$/.test(text)) return node.choices[Number(text) - 1] || null;
  return node.choices.find(c => normalize(c.label) === text) || null;
}
export function entityLocationAvailable(world, challenges, entities, map, x, y, id) {
  return world.canPlaceChallenge(map, x, y) &&
    !challenges.some(c => c.map === map && c.location.x === x && c.location.y === y) &&
    !entities.some(e => e.id !== id && e.map === map && e.location.x === x && e.location.y === y);
}
export function findEntityLocation(world, challenges, entities, map, preferred, id) {
  let best = null, distance = Infinity;
  for (let y = 0; y < 28; y++) for (let x = 0; x < 40; x++) {
    if (!entityLocationAvailable(world, challenges, entities, map, x, y, id)) continue;
    const d = Math.abs(x - preferred.x) + Math.abs(y - preferred.y);
    if (d < distance) { best = { x, y }; distance = d; }
  }
  return best;
}
