// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
// Regenerate the small, original sound cues bundled with both built-in themes.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOUND_EVENTS, defaultSoundConfig } from '../lib/sound-events.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rate = 22050;
const motifs = {
  mapEntry: [60, 67, 72], spawn: [60, 64, 67, 72], transport: [72, 67, 60],
  discovery: [67, 72, 76], correct: [60, 64, 72], bossSolved: [60, 64, 67, 72, 79],
  keyObtained: [72, 79, 84], incantationObtained: [69, 72, 76, 81],
  expeditionComplete: [60, 67, 72, 76, 84], submitted: [64, 67],
  incorrect: [66, 60], interaction: [60, 64], hintUnlocked: [67, 71, 74],
  lockedRoute: [60, 57], routeUnlocked: [60, 67, 72], searchEmpty: [60, 58],
};

function wav(notes, circuit, signature) {
  const noteSeconds = circuit ? 0.105 : 0.16;
  const length = Math.ceil((notes.length * noteSeconds + 0.13) * rate);
  const bytes = Buffer.alloc(44 + length * 2);
  bytes.write('RIFF', 0); bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write('WAVEfmt ', 8); bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(rate, 24); bytes.writeUInt32LE(rate * 2, 28);
  bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36); bytes.writeUInt32LE(length * 2, 40);
  for (let i = 0; i < length; i++) {
    const t = i / rate;
    const index = Math.floor(t / noteSeconds);
    let sample = 0;
    if (index < notes.length) {
      const phase = (t - index * noteSeconds) / noteSeconds;
      const hz = 440 * 2 ** ((notes[index] - 69) / 12) * (1 + signature * 0.0007);
      const envelope = Math.min(1, phase * 18) * Math.max(0, 1 - phase) ** 1.6;
      const wave = circuit
        ? 0.55 * Math.sin(2 * Math.PI * hz * t) + 0.2 * Math.sin(2 * Math.PI * hz * 2 * t)
        : 0.65 * Math.sin(2 * Math.PI * hz * t) + 0.18 * Math.sin(2 * Math.PI * hz * 3 * t);
      sample = wave * envelope * 0.45;
    }
    bytes.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sample)) * 32767), 44 + i * 2);
  }
  return bytes;
}

for (const [name, id, location, circuit] of [
  ['North Pole', 'north-pole', 'public/audio/sounds/north-pole', false],
  ['Agentic Circuit', 'agentic-circuit', 'public/themes/agentic-circuit/audio/sounds', true],
]) {
  const dir = resolve(root, location);
  mkdirSync(dir, { recursive: true });
  for (const [signature, cueId] of ['mapEntry', ...SOUND_EVENTS.map(event => event.id)].entries()) {
    writeFileSync(resolve(dir, `${cueId}.wav`), wav(motifs[cueId], circuit, signature));
  }
  const basePath = '/' + location.slice('public/'.length);
  for (const filename of ['theme.json', 'demo-theme.json']) {
    const path = resolve(root, 'themes', id, filename);
    const theme = JSON.parse(readFileSync(path, 'utf8'));
    theme.sounds = defaultSoundConfig(basePath, theme.world.maps.map(map => map.id));
    writeFileSync(path, JSON.stringify(theme, null, 2) + '\n');
  }
  console.log(`Generated ${Object.keys(motifs).length} ${name} sound cues.`);
}
