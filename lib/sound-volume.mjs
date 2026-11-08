// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
export function soundVolume(sounds, group, id, musicVolume = 0.15) {
  const value = sounds?.volumes?.[group]?.[id];
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : group === 'music' ? musicVolume : 0.25;
}
