import { Midi } from "@tonejs/midi";
export type MusicConfig = {
  midi: string | null;
  loop: boolean;
  volume: number;
};
/** Small retro synthesizer: MIDI note/tempo data, without external soundfont downloads. */
export class MidiPlayer {
  private context: AudioContext;
  private master: GainNode;
  private timer: ReturnType<typeof setInterval> | null = null;
  private notes: {
    time: number;
    duration: number;
    midi: number;
    velocity: number;
    type: OscillatorType;
  }[] = [];
  private cursor = 0;
  private startTime = 0;
  private duration = 0;
  private closed = false;
  private abort = new AbortController();
  private ready = false;
  constructor(private config: MusicConfig) {
    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.master.gain.value = config.volume;
    this.master.connect(this.context.destination);
  }
  async play() {
    if (this.closed) return;
    await this.context.resume();
    if (!this.ready) {
      if (!this.config.midi) throw Error("No background MIDI is configured.");
      const r = await fetch(this.config.midi, { signal: this.abort.signal });
      if (!r.ok) throw Error("Background music could not be loaded.");
      const data = await r.arrayBuffer();
      if (data.byteLength > 5 * 1024 * 1024)
        throw Error("MIDI files must be smaller than 5 MB.");
      const midi = new Midi(data);
      if (
        !Number.isFinite(midi.duration) ||
        midi.duration <= 0 ||
        midi.duration > 86400
      )
        throw Error("The MIDI file has no playable notes.");
      this.notes = midi.tracks
        .flatMap((track) =>
          track.notes.map((n) => ({
            time: n.time,
            duration: Math.min(n.duration, 60),
            midi: n.midi,
            velocity: n.velocity,
            type: (
              ["triangle", "sine", "square", "sawtooth"] as OscillatorType[]
            )[Math.floor(track.instrument.number / 32) % 4],
          })),
        )
        .sort((a, b) => a.time - b.time);
      if (this.notes.length > 100000)
        throw Error("The MIDI file contains too many notes.");
      if (this.closed) return;
      this.duration = midi.duration + 0.3;
      this.startTime = this.context.currentTime + 0.08;
      this.ready = true;
      this.timer = setInterval(() => this.schedule(), 40);
      this.schedule();
    }
  }
  private schedule() {
    if (this.closed || this.context.state !== "running") return;
    const horizon = this.context.currentTime + 0.15;
    let count = 0;
    while (
      this.cursor < this.notes.length &&
      this.startTime + this.notes[this.cursor].time < horizon &&
      count++ < 256
    ) {
      const n = this.notes[this.cursor++],
        when = Math.max(this.context.currentTime, this.startTime + n.time),
        o = this.context.createOscillator(),
        g = this.context.createGain();
      o.type = n.type;
      o.frequency.value = 440 * Math.pow(2, (n.midi - 69) / 12);
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(n.velocity * 0.08, when + 0.008);
      g.gain.exponentialRampToValueAtTime(
        0.0001,
        when + Math.max(0.03, n.duration),
      );
      o.connect(g);
      g.connect(this.master);
      o.start(when);
      o.stop(when + Math.max(0.04, n.duration) + 0.01);
      o.onended = () => {
        o.disconnect();
        g.disconnect();
      };
    }
    if (
      this.cursor === this.notes.length &&
      horizon >= this.startTime + this.duration
    ) {
      if (this.config.loop) {
        this.startTime += this.duration;
        this.cursor = 0;
      } else if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    }
  }
  async mute() {
    await this.context.suspend();
  }
  dispose() {
    this.closed = true;
    this.abort.abort();
    if (this.timer) clearInterval(this.timer);
    void this.context.close();
  }
}
