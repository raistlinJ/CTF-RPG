// Original quiet reverse-engineering bunker MIDI loop.
import { mkdirSync, writeFileSync } from "node:fs";
import midiPackage from "@tonejs/midi";

const destination = new URL("../public/themes/dynamic-sre-part1/audio/", import.meta.url);
mkdirSync(destination, { recursive: true });
const midi = new midiPackage.Midi();
midi.header.setTempo(92);
const pad = midi.addTrack();
pad.name = "Bunker ambience";
pad.instrument.number = 89;
const pulse = midi.addTrack();
pulse.name = "Breakpoint pulse";
pulse.instrument.number = 80;
const bass = midi.addTrack();
bass.name = "Reactor hum";
bass.instrument.number = 38;
const beat = 60 / 92;
const chords = [[45, 52, 57, 60], [41, 48, 53, 57], [43, 50, 55, 59], [40, 47, 52, 55]];
for (let bar = 0; bar < 16; bar++) {
  const chord = chords[bar % chords.length];
  for (const note of chord) pad.addNote({ midi: note, time: bar * 4 * beat, duration: 3.8 * beat, velocity: 0.16 });
  bass.addNote({ midi: chord[0] - 12, time: bar * 4 * beat, duration: 3.5 * beat, velocity: 0.12 });
  for (const [step, offset] of [0, 2, 1, 3].entries())
    pulse.addNote({ midi: chord[offset] + 12, time: (bar * 4 + step) * beat, duration: 0.28 * beat, velocity: 0.18 });
}
writeFileSync(new URL("breakpoint-rebellion.mid", destination), Buffer.from(midi.toArray()));
