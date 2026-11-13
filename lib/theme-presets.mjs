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
import solstice from "../themes/solstice-vanguard/theme.json" with { type: "json" };
import solsticeDemo from "../themes/solstice-vanguard/demo-theme.json" with { type: "json" };
import solsticeChallenges from "../themes/solstice-vanguard/demo-content.json" with { type: "json" };
import environment from "../themes/environment-development/theme.json" with { type: "json" };
import environmentChallenges from "../themes/environment-development/demo-content.json" with { type: "json" };
import dynamicSre from "../themes/dynamic-sre-part1/theme.json" with { type: "json" };
import dynamicSreChallenges from "../themes/dynamic-sre-part1/demo-content.json" with { type: "json" };
import doomHoliday from "../themes/doom-holiday/theme.json" with { type: "json" };
import doomHolidayDemo from "../themes/doom-holiday/demo-theme.json" with { type: "json" };
import doomHolidayChallenges from "../themes/doom-holiday/demo-content.json" with { type: "json" };
import { parseTheme } from "./theme-schema.mjs";
export const themePresets = [
  { id: "agentic-circuit", theme: parseTheme(circuit), demoTheme: parseTheme(circuitDemo), challenges: circuitChallenges },
  { id: "north-pole", theme: parseTheme(winter), demoTheme: parseTheme(winterDemo), challenges: winterChallenges },
  { id: "halloween", theme: parseTheme(halloween), demoTheme: parseTheme(halloweenDemo), challenges: halloweenChallenges },
  { id: "solstice-vanguard", theme: parseTheme(solstice), demoTheme: parseTheme(solsticeDemo), challenges: solsticeChallenges },
  {
    id: "doom-holiday", theme: parseTheme(doomHoliday), demoTheme: parseTheme(doomHolidayDemo), challenges: doomHolidayChallenges,
    demoDescription: "A 15-challenge Marvel holiday CTF: recover the Holiday Star across seventeen Latverian locations with 25 character appearances, three boss encounters, hidden gifts, emoji secrets, downloadable evidence, and a team debrief.",
  },
  {
    id: "environment-development", theme: parseTheme(environment), demoTheme: parseTheme(environment), challenges: environmentChallenges,
    demoDescription: "Ten sequential checkpoints from the Environment Development CTFd export: VM addresses, SQL diagnostics, nginx hosting, Webmin research and analysis, and the individual debrief.",
    contentLabel: "assignment",
  },
  {
    id: "dynamic-sre-part1", theme: parseTheme(dynamicSre), demoTheme: parseTheme(dynamicSre), challenges: dynamicSreChallenges,
    demoDescription: "Four floors of binary-themed reverse engineering: source and disassembly, breakpoints and registers, memory and patching, then congratulations. Nine sequential checkpoints preserve the original Dynamic SRE Part 1 assignment.",
    contentLabel: "assignment",
  },
];
export const presetCatalog = () => themePresets.map(p => ({
  id:p.id, title:p.theme.title, description:p.theme.description, preview:p.theme.world.maps[0].background,
  locations:p.theme.world.maps.map(m=>m.name), demoCount:p.challenges?.length || 0,
  ...(p.demoDescription ? { demoDescription: p.demoDescription } : {}),
  ...(p.contentLabel ? { contentLabel: p.contentLabel } : {}),
}));
