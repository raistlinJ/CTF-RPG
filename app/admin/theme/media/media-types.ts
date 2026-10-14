// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
export type Media = { id: string; name: string; src: string; source: "upload" | "theme" };
export type Character = { id: string; name: string; subtitle: string; sprite: string | null; fallback: "web" | "thunder" | "shield"; appearanceFor: "player" | "entity" | "both" };
export type MapArtwork = { id: string; name: string; background: string | null; originalBackground?: string | null };
export type Settings = { media: Media[]; suppliedMedia: { name: string; src: string }[]; characters: Character[]; bossSprites: Record<string, string>; maps: MapArtwork[]; revision: number };
