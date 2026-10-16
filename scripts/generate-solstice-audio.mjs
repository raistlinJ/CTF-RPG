// Original festive hero MIDI loops and short sound cues for Solstice Vanguard.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import midiPackage from "@tonejs/midi";
import { SOUND_EVENTS } from "../lib/sound-events.mjs";

const { Midi } = midiPackage;
const base = resolve(dirname(fileURLToPath(import.meta.url)), "../public/themes/solstice-vanguard/audio");
mkdirSync(resolve(base, "sounds"), { recursive: true });

function music(name, tempo, chords, melody) {
  const midi = new Midi();
  midi.header.setTempo(tempo);
  const pad = midi.addTrack();
  pad.name = "Aurora strings";
  pad.instrument.number = 48;
  const bass = midi.addTrack();
  bass.name = "Beacon bass";
  bass.instrument.number = 38;
  const lead = midi.addTrack();
  lead.name = "Starlight bells";
  lead.instrument.number = 9;
  const beat = 60 / tempo;
  for (let bar = 0; bar < 16; bar++) {
    const chord = chords[bar % chords.length];
    const time = bar * 4 * beat;
    for (const note of chord) pad.addNote({ midi: note, time, duration: 3.6 * beat, velocity: 0.26 });
    bass.addNote({ midi: chord[0] - 12, time, duration: 1.5 * beat, velocity: 0.36 });
    bass.addNote({ midi: chord[0] - 12, time: time + 2 * beat, duration: 1.4 * beat, velocity: 0.32 });
    for (let step = 0; step < 4; step++) {
      const note = melody[(bar * 4 + step) % melody.length];
      if (note != null) lead.addNote({ midi: note, time: time + step * beat, duration: 0.62 * beat, velocity: step === 0 ? 0.46 : 0.33 });
    }
  }
  writeFileSync(resolve(base, name), Buffer.from(midi.toArray()));
}

music("city-in-lights.mid", 104,
  [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]],
  [76, 79, 84, 79, 76, 81, 84, 81, 77, 81, 84, 81, 74, 79, 83, 79]);
music("aurora-rise.mid", 92,
  [[53, 57, 60], [55, 59, 62], [60, 64, 67], [57, 60, 64]],
  [72, 77, 81, 84, 74, 79, 83, 86, 76, 79, 84, 88, 72, 76, 81, 84]);

const motifs = {
  mapEntry: [72, 76, 79], spawn: [60, 67, 72], footsteps: [], transport: [79, 76, 72],
  discovery: [67, 72, 76], correct: [60, 64, 67, 72], bossSolved: [48, 55, 60, 67, 72],
  keyObtained: [72, 79, 84], incantationObtained: [69, 72, 76, 81],
  expeditionComplete: [60, 67, 72, 76, 84], submitted: [64, 69],
  incorrect: [66, 60], interaction: [72, 67], hintUnlocked: [67, 71, 74],
  lockedRoute: [60, 57], routeUnlocked: [60, 67, 76], searchEmpty: [60, 59],
};
const rate = 22050;
function cue(notes) {
  const step = 0.12;
  const seconds = notes.length ? notes.length * step + 0.12 : 0.09;
  const count = Math.ceil(rate * seconds);
  const data = Buffer.alloc(44 + count * 2);
  data.write("RIFF", 0); data.writeUInt32LE(data.length - 8, 4);
  data.write("WAVEfmt ", 8); data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
  data.writeUInt32LE(rate, 24); data.writeUInt32LE(rate * 2, 28);
  data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34);
  data.write("data", 36); data.writeUInt32LE(count * 2, 40);
  for (let i = 0; i < count; i++) {
    const t = i / rate;
    let sample;
    if (!notes.length) {
      const envelope = Math.min(1, t / 0.004) * Math.exp(-t * 50);
      sample = (Math.sin(2 * Math.PI * 520 * t) + 0.2 * Math.sin(2 * Math.PI * 1040 * t)) * envelope * 0.16;
    } else {
      const n = Math.floor(t / step);
      const phase = (t - n * step) / step;
      const note = notes[n];
      const hz = note == null ? 0 : 440 * 2 ** ((note - 69) / 12);
      const envelope = Math.min(1, phase * 19) * Math.max(0, 1 - phase) ** 2.2;
      sample = hz ? (0.58 * Math.sin(2 * Math.PI * hz * t) + 0.2 * Math.sin(2 * Math.PI * hz * 2 * t) + 0.12 * Math.sin(2 * Math.PI * hz * 4.01 * t)) * envelope * 0.43 : 0;
    }
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sample)) * 32767), 44 + i * 2);
  }
  return data;
}
for (const id of ["mapEntry", ...SOUND_EVENTS.map(event => event.id)]) {
  writeFileSync(resolve(base, "sounds", `${id}.wav`), cue(motifs[id]));
}
