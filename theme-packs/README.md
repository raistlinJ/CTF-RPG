# Importable CTF-RPG packs

Copyright © 2026 Jaime C Acosta.

Each theme has a reusable theme ZIP and a paired demo adventure:

- `north-pole.zip` and `agentic-circuit.zip` contain the theme manifest, maps, sprites, MIDI music, sound effects, and default sound assignments. They contain no challenges or student progress.
- `halloween.zip` contains the Halloween Hollow world, three heroes, a guide and boss appearance, MIDI music, and sound effects. Like the other reusable theme ZIPs, it has no demo content.
- `solstice-vanguard.zip` contains the original Solstice Vanguard holiday superhero world, three heroes, a guide and boss appearance, MIDI music, and sound effects. It has no demo content.
- `north-pole-demo-theme.zip`, `agentic-circuit-demo-theme.zip`, `halloween-demo-theme.zip`, and `solstice-vanguard-demo-theme.zip` add matching demo routes and progression.
- The corresponding `*-demo-content.zip` files contain practice challenges, answers, downloads, and two short MP4 cutscenes per theme. Keep these files private if you plan to reuse their answers.

Import packs through **Manage → Import & backup → Theme, content & backups**. Select a demo theme and its **Matching content ZIP** together. See the [North Pole](../themes/north-pole/README.md), [Agentic Circuit](../themes/agentic-circuit/README.md), [Halloween Hollow](../themes/halloween/README.md), and [Solstice Vanguard](../themes/solstice-vanguard/README.md) guides.

Source manifests live in `themes/`; media files live in `public/`. After editing source manifests or assets, run `npm run themes:build` to regenerate the ZIPs and runtime demo JSON. To regenerate the existing themes' WAV effects, run `node scripts/generate-theme-sounds.mjs` first. For Halloween music and effects, run `node scripts/generate-halloween-audio.mjs`. For Solstice Vanguard music and effects, run `node scripts/generate-solstice-audio.mjs`. To regenerate the MP4 demo cutscenes, install `ffmpeg` and run `node scripts/generate-demo-videos.mjs` first. Media scripts overwrite their generated files.
