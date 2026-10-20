// A playable standard MIDI with optional sequencer-specific metadata.
export function midiFixture({pitch = 60, metadataBytes = 0} = {}) {
  const length = [metadataBytes & 127];
  for (let value = Math.floor(metadataBytes / 128); value; value = Math.floor(value / 128)) length.unshift((value & 127) | 128);
  const meta = metadataBytes ? [0, 255, 127, ...length] : [];
  const notes = [0, 144, pitch, 100, 131, 96, 128, pitch, 0, 0, 255, 47, 0];
  const trackLength = meta.length + metadataBytes + notes.length;
  const bytes = new Uint8Array(22 + trackLength);
  bytes.set([77, 84, 104, 100, 0, 0, 0, 6, 0, 0, 0, 1, 1, 224, 77, 84, 114, 107]);
  new DataView(bytes.buffer).setUint32(18, trackLength);
  bytes.set(meta, 22);
  if (metadataBytes) bytes[22 + meta.length] = 125;
  bytes.set(notes, 22 + meta.length + metadataBytes);
  return bytes;
}
