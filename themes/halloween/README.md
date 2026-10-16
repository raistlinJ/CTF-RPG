# Halloween Hollow theme

An original Halloween world for CTF-RPG. Select **Manage → Theme → Theme library → Halloween Hollow → Use this theme**, or import `theme-packs/halloween.zip` through **Import & backup**. The reusable pack contains no challenges, answers, accounts, or progress. Existing challenge locations use the same seven map IDs and 40 × 28 grid as the other built-in worlds; review their positions after importing.

The theme includes Hollowbrook Village, Moonfall Manor, and a cozy shop interior reused by the Potion Atelier, Witch's Library, Raven Post, Ghost Conservatory, and Pumpkin Bakery. Players can choose Pumpkin Scout, Moon Witch, or Ghost Guardian. Morrow the Raven offers in-world guidance. Pumpkin Wraith is available as a custom boss appearance in the challenge editor.

Three map paintings and five transparent character images were generated with the built-in image tool and packaged as WebP. Their prompts are in `ART_PROMPTS.json`. The two original MIDI tracks and 17 short WAV cues are generated from `scripts/generate-halloween-audio.mjs`. Music and effects use the existing player mute controls. To rebuild the ZIPs after edits, run `npm run themes:build`.

## Beginner demo adventure

Open **Manage → Theme → Theme library → Halloween Hollow → Load demo adventure**. The confirmation imports the matching world and ten practice challenges together. This replaces the active challenge collection; accounts, teams, and recorded scores stay saved. Export your current content first if you need a copy. **Use this theme** changes only the world and leaves out demo locks. The reusable theme pack contains no answers.

Follow this route:

1. Talk to Morrow at village (18,17), then solve the lantern puzzle at (18,19) for the **red key**.
2. Solve the moonstone riddle at (11,19) for the **silver moon** incantation. The shortcut at (16,21) leads to Witch's Library.
3. In Potion Atelier, solve the 1×1 Potion Gremlin at (15,15) for the **gold key**.
4. Use the gold key to enter Ghost Conservatory. Its 2×2 Ghost Warden at (20,12) needs the gremlin and moonstone challenges solved.
5. Download the letter in Raven Post at (20,12) and enter its flag with exact capitalization.
6. Use the red key to enter Moonfall Manor. The 3×3 Pumpkin Wraith at (19,10) needs the Ghost Warden and the letter challenge solved.
7. Submit the written reflection at manor (25,18). An instructor reviews it under **Challenges → Submissions**. The Manor Keeper appears after the wraith is solved.

Pumpkin Bakery offers an optional green key at (20,12). Its answer-reveal hint costs 5 points and gives up that key. Witch's Library has another short question. A hidden instructor example sits at village (29,8). The starter and Potion Gremlin have short silent cutscenes; press **Space** to skip them.

Portable files:

- `theme-packs/halloween.zip`: reusable artwork, world, music, and guide without demo locks or questions.
- `theme-packs/halloween-demo-theme.zip`: the world with matching locks, shortcut, dialogue, and host.
- `theme-packs/halloween-demo-content.zip`: questions, answers, hints, rewards, a downloadable note, and two MP4 cutscenes.

Import the demo theme ZIP with its **Matching content ZIP**. Author questions in `demo-challenges.yaml`; `demo-content.json` is generated for runtime use. These answers are public examples, so replace them and their IDs before a graded assessment.
