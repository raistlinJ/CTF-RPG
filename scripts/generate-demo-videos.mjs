// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
// Optional authoring tool: ffmpeg generates short, silent MP4 demo cutscenes.
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const scenes = [
  { file: 'public/videos/agentic-circuit/binary-welcome.mp4', background: '071923', grid: '1a6471', accent: '62e6d3', title: 'BINARY WELCOME', subtitle: 'DECODE THE GATE' },
  { file: 'public/videos/agentic-circuit/tool-gremlin-solved.mp4', background: '101729', grid: '453e78', accent: 'c5a3ff', title: 'TOOL GREMLIN', subtitle: 'WORKSHOP CLEARED' },
  { file: 'public/videos/north-pole/packing-list.mp4', background: '102a39', grid: '376274', accent: 'bdefff', title: 'ELF PACKING LIST', subtitle: 'COUNT THE GIFTS' },
  { file: 'public/videos/north-pole/toy-gremlin-solved.mp4', background: '271d34', grid: '624564', accent: 'ffd18c', title: 'TOY GREMLIN', subtitle: 'WORKSHOP CLEARED' },
  { file: 'public/videos/halloween/lantern-welcome.mp4', background: '180f2b', grid: '513565', accent: 'ffa54b', title: 'LANTERN WELCOME', subtitle: 'COUNT THE CARVINGS' },
  { file: 'public/videos/halloween/potion-gremlin-solved.mp4', background: '201125', grid: '5e3157', accent: '90ebd4', title: 'POTION GREMLIN', subtitle: 'GOLD KEY FOUND' },
  { file: 'public/videos/solstice-vanguard/beacon-welcome.mp4', background: '10243b', grid: '225b69', accent: 'f6d176', title: 'BEACON CALL', subtitle: 'COUNT THE POWER CELLS' },
  { file: 'public/videos/solstice-vanguard/parcel-drone-solved.mp4', background: '102c36', grid: '386977', accent: '8ce9da', title: 'PARCEL DRONE', subtitle: 'GOLD KEY FOUND' },
];

const selected = process.argv[2];
for (const scene of scenes.filter(scene => !selected || scene.file.includes(`/${selected}/`))) {
  const output = resolve(scene.file);
  mkdirSync(dirname(output), { recursive: true });
  const filter = [
    `drawgrid=w=40:h=40:t=1:c=0x${scene.grid}@0.3`,
    `drawbox=x=24:y=24:w=592:h=312:t=2:c=0x${scene.accent}@0.8`,
    `drawbox=x=86:y=108:w=468:h=3:t=fill:c=0x${scene.accent}@0.7`,
    `drawbox=x=160:y=250:w=320:h=3:t=fill:c=0x${scene.accent}@0.7`,
    `drawtext=font=Sans:text='${scene.title}':fontsize=43:fontcolor=0x${scene.accent}:x=(w-text_w)/2:y=135:enable='gte(t,0.35)'`,
    `drawtext=font=Sans:text='${scene.subtitle}':fontsize=23:fontcolor=white:x=(w-text_w)/2:y=205:enable='gte(t,0.85)'`,
    'fade=t=in:st=0:d=0.25',
    'fade=t=out:st=2.1:d=0.3',
  ].join(',');
  const result = spawnSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', `color=c=0x${scene.background}:s=640x360:r=24:d=2.4`,
    '-vf', filter, '-an', '-c:v', 'libx264', '-preset', 'veryfast',
    '-crf', '26', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output,
  ], { stdio: 'inherit' });
  if (result.status !== 0) throw Error(`Could not generate ${scene.file}. Install ffmpeg and rerun this script.`);
  console.log(`Generated ${scene.file}`);
}
