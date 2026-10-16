// Original Halloween MIDI loops and short sound cues for the built-in theme.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import midiPackage from "@tonejs/midi";
import { SOUND_EVENTS } from "../lib/sound-events.mjs";

const { Midi } = midiPackage;
const base = resolve(dirname(fileURLToPath(import.meta.url)), "../public/themes/halloween/audio");
mkdirSync(resolve(base, "sounds"), { recursive: true });

function music(name, tempo, chords, melody) {
  const midi = new Midi();
  midi.header.setTempo(tempo);
  const pad = midi.addTrack();
  pad.name = "Haunted chimes";
  pad.instrument.number = 10;
  const bass = midi.addTrack();
  bass.name = "Cellar bass";
  bass.instrument.number = 32;
  const lead = midi.addTrack();
  lead.name = "Lantern melody";
  lead.instrument.number = 8;
  const beat = 60 / tempo;
  for (let bar = 0; bar < 16; bar++) {
    const chord = chords[bar % chords.length];
    const time = bar * 4 * beat;
    for (const note of chord) pad.addNote({ midi: note, time, duration: 3.7 * beat, velocity: 0.28 });
    bass.addNote({ midi: chord[0] - 12, time, duration: 1.7 * beat, velocity: 0.44 });
    bass.addNote({ midi: chord[0] - 12, time: time + 2 * beat, duration: 1.6 * beat, velocity: 0.35 });
    for (let step = 0; step < 4; step++) {
      const note = melody[(bar * 4 + step) % melody.length];
      if (note != null) lead.addNote({ midi: note, time: time + step * beat, duration: 0.68 * beat, velocity: step === 0 ? 0.48 : 0.36 });
    }
  }
  writeFileSync(resolve(base, name), Buffer.from(midi.toArray()));
}

music("moonlit-village.mid", 88,
  [[48, 55, 63], [46, 53, 62], [44, 51, 60], [43, 50, 58]],
  [72, 75, 79, 75, 70, 74, 77, 74, 68, 72, 75, 72, 67, 70, 74, 70]);
music("manor-waltz.mid", 78,
  [[48, 55, 60], [45, 52, 60], [41, 48, 56], [43, 50, 59]],
  [79, 75, 72, 75, 77, 72, 69, 72, 75, 72, 68, 72, 74, 71, 67, 71]);

const motifs = {
  mapEntry: [60, 63, 67], spawn: [60, 67, 72], footsteps: [], transport: [72, 67, 60],
  discovery: [67, 70, 75], correct: [60, 63, 67, 72], bossSolved: [48, 55, 60, 67, 72],
  keyObtained: [72, 75, 79], incantationObtained: [68, 72, 75, 80],
  expeditionComplete: [60, 63, 67, 72, 79], submitted: [63, 67],
  incorrect: [61, 57], interaction: [67, 63], hintUnlocked: [63, 67, 70],
  lockedRoute: [55, 49], routeUnlocked: [55, 60, 67], searchEmpty: [60, 58],
};
const rate = 22050;
function cue(notes) {
  const step = 0.14;
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
      const envelope = Math.min(1, t / 0.004) * Math.exp(-t * 42);
      sample = (Math.sin(2 * Math.PI * 155 * t) + 0.28 * Math.sin(2 * Math.PI * 310 * t)) * envelope * 0.18;
    } else {
      const n = Math.floor(t / step);
      const phase = (t - n * step) / step;
      const note = notes[n];
      const hz = note == null ? 0 : 440 * 2 ** ((note - 69) / 12);
      const envelope = Math.min(1, phase * 15) * Math.max(0, 1 - phase) ** 1.8;
      sample = hz ? (0.57 * Math.sin(2 * Math.PI * hz * t) + 0.18 * Math.sin(2 * Math.PI * hz * 2.01 * t) + 0.1 * Math.sin(2 * Math.PI * hz * 3 * t)) * envelope * 0.46 : 0;
    }
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sample)) * 32767), 44 + i * 2);
  }
  return data;
}
for (const id of ["mapEntry", ...SOUND_EVENTS.map(event => event.id)]) {
  writeFileSync(resolve(base, "sounds", `${id}.wav`), cue(motifs[id]));
}
