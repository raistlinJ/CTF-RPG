// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
export const SOUND_EVENTS = [
  { id: "spawn", label: "Player spawn", description: "When the player enters the game." },
  { id: "footsteps", label: "Footsteps", description: "Each time the player takes a step." },
  { id: "transport", label: "Transport", description: "When a player enters another map." },
  { id: "discovery", label: "Challenge opened", description: "When a player opens a challenge." },
  { id: "correct", label: "Regular challenge solved", description: "When a regular challenge is solved." },
  { id: "bossSolved", label: "Boss challenge solved", description: "When a boss challenge is solved." },
  { id: "keyObtained", label: "Key obtained", description: "When a challenge awards a key." },
  { id: "incantationObtained", label: "Incantation obtained", description: "When a challenge awards an incantation." },
  { id: "expeditionComplete", label: "Expedition complete", description: "When the final required challenge is solved." },
  { id: "submitted", label: "Answer submitted", description: "When a written answer is saved for review." },
  { id: "incorrect", label: "Incorrect answer", description: "When an answer is rejected." },
  { id: "interaction", label: "Non-player entity interaction", description: "When a player talks to a nearby character." },
  { id: "hintUnlocked", label: "Hint unlocked", description: "When a player reveals a hint." },
  { id: "lockedRoute", label: "Locked route", description: "When a player reaches a locked door or transport." },
  { id: "routeUnlocked", label: "Route unlocked", description: "When a player opens a locked route." },
  { id: "searchEmpty", label: "Empty search", description: "When a nearby search finds nothing." },
  { id: "npcEmojiUnlocked", label: "NPC emoji secret unlocked", description: "When a player first discovers a character's secret emoji reaction, or an administrator previews it in the game." },
  { id: "highFive", label: "High-five", description: "When two players exchange waves to complete a high-five." },
  { id: "doubleWow", label: "Double wow", description: "When two players exchange wow emojis to start fireworks." },
];

export function defaultSoundConfig(basePath, mapIds) {
  const clips = [
    ...SOUND_EVENTS.map(event => ({ name: event.label, src: `${basePath}/${event.id}.wav`, source: "theme" })),
    { name: "Map entry", src: `${basePath}/mapEntry.wav`, source: "theme" },
  ];
  return {
    clips,
    maps: Object.fromEntries(mapIds.map(id => [id, `${basePath}/mapEntry.wav`])),
    events: Object.fromEntries(SOUND_EVENTS.map(event => [event.id, `${basePath}/${event.id}.wav`])),
  };
}
