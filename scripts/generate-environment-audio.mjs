// Original quiet commissioning-deck MIDI loop.
import { mkdirSync, writeFileSync } from "node:fs";
import midiPackage from "@tonejs/midi";
const destination = new URL("../public/themes/environment-development/audio/", import.meta.url);
mkdirSync(destination, { recursive: true });
const midi = new midiPackage.Midi();
midi.header.setTempo(84);
const pad = midi.addTrack();
pad.name = "Orbital systems";
pad.instrument.number = 89;
const pulse = midi.addTrack();
pulse.name = "Commissioning pulse";
pulse.instrument.number = 80;
const beat = 60 / 84;
const chords = [[50, 57, 62, 65], [46, 53, 58, 62], [48, 55, 60, 64], [45, 52, 57, 60]];
for (let bar = 0; bar < 16; bar++) {
  const chord = chords[bar % chords.length];
  for (const note of chord) pad.addNote({ midi: note, time: bar * 4 * beat, duration: 3.8 * beat, velocity: 0.2 });
  for (let step = 0; step < 4; step++) pulse.addNote({ midi: chord[step] + 12, time: (bar * 4 + step) * beat, duration: 0.3 * beat, velocity: 0.22 });
}
writeFileSync(new URL("launch-protocol.mid", destination), Buffer.from(midi.toArray()));
