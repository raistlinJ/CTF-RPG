# Importable CTF-RPG packs

Copyright © 2026 Jaime C Acosta.

Each theme has a reusable theme ZIP and a paired demo adventure:

- `north-pole.zip` and `agentic-circuit.zip` contain the theme manifest, maps, sprites, MIDI music, sound effects, and default sound assignments. They contain no challenges or student progress.
- `north-pole-demo-theme.zip` and `agentic-circuit-demo-theme.zip` add the matching demo routes and progression.
- `north-pole-demo-content.zip` and `agentic-circuit-demo-content.zip` contain practice challenges, answers, downloads, and two short MP4 cutscenes per theme. Keep these files private if you plan to reuse their answers.

Import packs through **Manage → Import & backup → Theme, content & backups**. Select a demo theme and its **Matching content ZIP** together. See the [North Pole](../themes/north-pole/README.md) and [Agentic Circuit](../themes/agentic-circuit/README.md) guides for the demo routes.

Source manifests live in `themes/`; media files live in `public/`. After editing source manifests or assets, run `npm run themes:build` to regenerate the ZIPs and runtime demo JSON. To regenerate the bundled WAV effects, run `node scripts/generate-theme-sounds.mjs` first. To regenerate the MP4 demo cutscenes, install `ffmpeg` and run `node scripts/generate-demo-videos.mjs` first. Both media scripts overwrite their generated files.
