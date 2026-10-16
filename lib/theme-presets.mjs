// CTF-RPG — Copyright Jaime C Acosta 2026
import circuit from "../themes/agentic-circuit/theme.json" with { type: "json" };
import winter from "../themes/north-pole/theme.json" with { type: "json" };
import circuitDemo from "../themes/agentic-circuit/demo-theme.json" with { type: "json" };
import winterDemo from "../themes/north-pole/demo-theme.json" with { type: "json" };
import circuitChallenges from "../themes/agentic-circuit/demo-content.json" with { type: "json" };
import winterChallenges from "../themes/north-pole/demo-content.json" with { type: "json" };
import halloween from "../themes/halloween/theme.json" with { type: "json" };
import halloweenDemo from "../themes/halloween/demo-theme.json" with { type: "json" };
import halloweenChallenges from "../themes/halloween/demo-content.json" with { type: "json" };
import { parseTheme } from "./theme-schema.mjs";
export const themePresets = [
  { id: "agentic-circuit", theme: parseTheme(circuit), demoTheme: parseTheme(circuitDemo), challenges: circuitChallenges },
  { id: "north-pole", theme: parseTheme(winter), demoTheme: parseTheme(winterDemo), challenges: winterChallenges },
  { id: "halloween", theme: parseTheme(halloween), demoTheme: parseTheme(halloweenDemo), challenges: halloweenChallenges },
];
export const presetCatalog = () => themePresets.map(p => ({
  id:p.id, title:p.theme.title, description:p.theme.description, preview:p.theme.world.maps[0].background,
  locations:p.theme.world.maps.map(m=>m.name), demoCount:p.challenges?.length || 0,
}));
