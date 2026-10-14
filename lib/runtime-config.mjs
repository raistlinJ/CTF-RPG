// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
import winter from "../themes/north-pole/theme.json" with { type: "json" };
import { parseGame } from "./config-schema.mjs";
import { stringify } from "yaml";

// Themes and database settings supply the game; no startup game YAML is read.
export function defaultGameConfig() {
  return parseGame(stringify({ characters: winter.characters, audio: winter.audio }));
}
export function runtimeConfig(environment = {}) {
  const username = environment.ADMIN_USERNAME?.trim().toLowerCase();
  if (!username || !/^[a-z0-9_-]{3,24}$/.test(username))
    throw Error("Set ADMIN_USERNAME in the project root .env to a 3–24 character protected administrator username (letters, numbers, _ or -).");
  const config = defaultGameConfig();
  config.admin = { protectedUsername: username };
  return config;
}
