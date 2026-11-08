// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
// Optional authoring tool: render the eight captioned, silent assignment clips.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const spec = JSON.parse(readFileSync(resolve(root, 'themes/dynamic-sre-part1/CUTSCENES.json'), 'utf8'));
const output = resolve(root, 'public/videos/dynamic-sre-part1');
const scratch = mkdtempSync(join(tmpdir(), 'sre-cutscenes-'));
mkdirSync(output, { recursive: true });
let textId = 0;

function text(filters, value, { x = '(w-text_w)/2', y, size = 22, color = 'white', start = 0.4 } = {}) {
  const file = join(scratch, `caption-${++textId}.txt`);
  writeFileSync(file, value);
  const escaped = file.replace(/[\\':,]/g, '\\$&');
  filters.push(`drawtext=font=Monospace:textfile='${escaped}':expansion=none:fontsize=${size}:fontcolor=${color}:x=${x}:y=${y}:enable='gte(t,${start})'`);
}
function box(filters, x, y, w, h, color, start = 0.7, fill = false) {
  filters.push(`drawbox=x=${x}:y=${y}:w=${w}:h=${h}:c=${color}:t=${fill ? 'fill' : 2}:enable='gte(t,${start})'`);
}
function cards(filters, labels, accent) {
  labels.forEach((label, index) => {
    const x = 122 + index * 248, start = 0.8 + index * 0.5;
    box(filters, x, 278, 220, 80, '0x061820@0.95', start, true);
    box(filters, x, 278, 220, 80, accent, start);
    text(filters, label, { x: `${x}+(220-text_w)/2`, y: 308, size: 20, start, color: accent });
    if (index < labels.length - 1) text(filters, '>', { x: x + 228, y: 305, color: accent, start: start + 0.35 });
  });
}
function diagram(filters, scene, phase, accent) {
  if (scene.diagram === 'mission') return cards(filters, ['SOURCE', 'DISASSEMBLY', 'DEBUGGER'], accent);
  if (scene.diagram === 'debrief') return cards(filters, ['PURPOSE', 'CHALLENGES', 'LESSONS'], accent);
  if (scene.diagram === 'branch') {
    box(filters, 370, 242, 220, 52, '0x061820@0.95', 0.7, true);
    box(filters, 370, 242, 220, 52, accent);
    text(filters, 'BREAKPOINT', { y: 258, size: 20, color: accent, start: 0.7 });
    box(filters, 479, 294, 2, 28, accent, 1.3, true);
    box(filters, 260, 320, 440, 2, accent, 1.6, true);
    box(filters, 260, 320, 2, 24, accent, 1.8, true);
    box(filters, 698, 320, 2, 24, accent, 1.8, true);
    for (const [x, label] of [[165, 'PATH A'], [605, 'PATH B']]) {
      box(filters, x, 344, 190, 52, '0x061820@0.95', 2, true);
      box(filters, x, 344, 190, 52, accent, 2);
      text(filters, label, { x: `${x}+(190-text_w)/2`, y: 360, size: 20, color: accent, start: 2 });
    }
    return;
  }
  if (scene.diagram === 'patch') {
    box(filters, 220, 244, 520, 146, '0x061820@0.95', 0.7, true);
    box(filters, 220, 244, 520, 146, accent);
    for (const [index, bit] of [...'1011001011000100'].entries())
      text(filters, bit, { x: 285 + index * 24 + (index >= 8 ? 12 : 0), y: 266, size: 28, color: '0x86a5ae', start: 0.9 });
    text(filters, 'v', { y: 304, size: 20, color: accent, start: 1.5 });
    for (const [index, bit] of [...'1011001011000101'].entries())
      text(filters, bit, { x: 285 + index * 24 + (index >= 8 ? 12 : 0), y: 341, size: 28, color: accent, start: 2 });
    box(filters, 653, 335, 25, 38, accent, 2.2);
    if (phase === 'post') text(filters, 'PATCH  >  RUN  >  OBSERVE', { y: 405, size: 17, color: accent, start: 2.5 });
  }
}

try {
  for (const scene of spec.scenes) for (const phase of ['pre', 'post']) {
    const caption = scene[phase];
    const accent = phase === 'pre' ? '0x65ecd2' : '0xffd58c';
    const filters = [
      `scale=${spec.width}:${spec.height}:force_original_aspect_ratio=decrease`,
      `pad=${spec.width}:${spec.height}:(ow-iw)/2:(oh-ih)/2:color=0x06131f`,
      'setsar=1',
      'drawbox=x=0:y=0:w=iw:h=ih:c=0x03111a@0.77:t=fill',
      'drawgrid=w=40:h=40:t=1:c=0x419a91@0.08',
    ];
    for (const [x, offset] of [[15, 0], [930, 180]]) text(filters, '0\n1\n0\n1\n1\n0\n0\n1\n0', {
      x, y: `'mod(t*23+${offset},720)-180'`, size: 14, color: '0x65ecd2@0.28', start: 0,
    });
    box(filters, 36, 24, 888, 492, `${accent}@0.65`, 0);
    box(filters, 64, 88, 832, 2, `${accent}@0.55`, 0, true);
    text(filters, scene.name, { x: 64, y: 47, size: 18, color: accent, start: 0.15 });
    text(filters, phase === 'pre' ? 'BEFORE CHALLENGE' : 'AFTER COMPLETION', { x: '896-text_w', y: 47, size: 15, color: '0xa7c5ce', start: 0.15 });
    text(filters, caption.title, { y: 123, size: 37, color: accent, start: 0.35 });
    text(filters, caption.subtitle, { y: 183, size: 21, color: '0xe5f2f5', start: 0.65 });
    diagram(filters, scene, phase, accent);
    text(filters, caption.next, { y: 449, size: 18, color: '0xe5f2f5', start: 2.8 });
    box(filters, 64, 491, 832, 3, '0x34525c', 0, true);
    for (let index = 0; index < 12; index++) box(filters, 64 + index * 70, 491, 62, 3, accent, index * 0.5, true);
    filters.push('fade=t=in:st=0:d=0.25', `fade=t=out:st=${spec.durationSeconds - 0.3}:d=0.3`);
    const result = spawnSync('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y', '-loop', '1', '-framerate', String(spec.fps),
      '-i', resolve(root, 'public/themes/dynamic-sre-part1/maps', caption.background || scene.background),
      '-t', String(spec.durationSeconds), '-vf', filters.join(','), '-an', '-c:v', 'libx264',
      '-preset', 'medium', '-crf', '30', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
      '-metadata', `title=${scene.name} / ${phase}`, join(output, `${scene.stem}-${phase}.mp4`),
    ], { stdio: 'inherit' });
    if (result.status !== 0) throw Error(`Could not generate ${scene.stem}-${phase}.mp4. Check that ffmpeg is installed.`);
    console.log(`Generated ${scene.stem}-${phase}.mp4`);
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
