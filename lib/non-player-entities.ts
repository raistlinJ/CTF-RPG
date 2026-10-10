export type EntityCharacter = { id: string; name: string; subtitle: string; sprite: string | null; fallback: "web" | "thunder" | "shield" };
export type EntitySummary = { id: string; name: string; characterId: string; map: string; location: { x: number; y: number } };
export type EntityChoice = { id: string; label: string; to: string };
export type EntityNode = { id: string; text: string; choices: EntityChoice[] };
export type NonPlayerEntity = EntitySummary & { startNode: string; nodes: EntityNode[]; dependsOn?: string[] };
export type PublicDialogue = { id: string; text: string; choices: { id: string; label: string }[] };
