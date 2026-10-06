import circuit from "../themes/agentic-circuit/theme.json" with { type: "json" };
import { parseTheme } from "./theme-schema.mjs";
export const themePresets = [
  { id: "agentic-circuit", theme: parseTheme(circuit) },
];
export const presetCatalog = () =>
  themePresets.map((p) => ({
    id: p.id,
    title: p.theme.title,
    description: p.theme.description,
    preview: p.theme.world.maps[0].background,
  }));
