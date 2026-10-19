# Environment Development: Launch Protocol

Students are the commissioning crew of an orbital cybersecurity laboratory. Configure the three assigned VMs, demonstrate the lab services and vulnerabilities, and deliver the individual debrief. An indoor systems deck provides a continuous route with cyan lighting, dark metal, and amber checkpoints. The top-left Celebration Airlock leads to a separate trophy hall with a cheering crew.

Open **Manage → Theme → Theme library → Environment Development: Launch Protocol → Load assignment** to load the deck and all ten challenges from `Environment Development.2026-03-23_19_14_22-ctfd-3.8.7.zip`. **Use this theme** loads the artwork and Flight Director alone. Loading the assignment replaces the current world and challenges after the normal confirmation; accounts and scores remain saved.

| Order | Checkpoint | Source reference | Tile |
| --- | --- | --- | --- |
| 00 | Mission Briefing | Exercise PDF | 4,22 |
| 01 | Kali VM Address | Step 1, #9(a) | 8,22 |
| 02 | Ubuntu VM Address | Step 1, #9(b) | 13,22 |
| 03 | Metasploitable VM Address | Step 1, #9(c) | 18,22 |
| 04 | SQL Diagnostic Analysis | Step 1, #17 | 24,22 |
| 05 | Host the nginx Service | Step 2, #8 | 32,22 |
| 06 | Identify the Vulnerable Version | Step 3, #2(b) | 34,8 |
| 07 | Verify the Webmin Endpoint | Step 3, #6 | 25,8 |
| 08 | Analyze the Remote Host | Step 3, #12 | 16,8 |
| 09 | Individual Debrief | Final deliverable | 7,8 |

All checkpoints use map ID `commissioning-deck`. Follow the lower row left to right, turn up at the right end, and return along the upper row. Only Mission Briefing initially unlocks. Each subsequent challenge has a server-enforced `dependsOn` reference to its predecessor. Students can walk ahead, but cannot answer later checkpoints early. The source had no explicit prerequisites; the new chain follows the attached PDF's exercise order rather than numeric record order.

## Conversion details

### Celebration area

After the individual debrief, approach the top-left airlock from tile **4,9** and step up onto **4,8**. It leads to `celebration-hall`, titled **Congratulations You Completed the Assignment**. Original artwork supplies gold trophies, a large completion banner, and celebrating people. Talk to the Lab Instructor, Systems Engineer, and Security Analyst for congratulatory dialogue. Leave through the south exit at **20,25** to return beside the deck's top-left door. The celebration route is open; the assignment's ten challenge prerequisites remain unchanged.

To update an existing remote assignment, import just the updated **environment-development.zip** as a theme. Existing question locations remain valid; no matching content import is needed for this addition. All ten challenges and their IDs are unchanged, so saved completion history continues to apply.

All ten source challenges, 42 total points, four free hints, seventeen static accepted answers with their per-answer case rules, and the challenge-linked exercise PDF are retained. Original challenge definitions, hints, and flags remain in each challenge's `ctfd` metadata. The source export is unchanged. Accounts, passwords, submissions, unrelated uploads, and solve history are excluded.

Two regex alternatives, on the SQL diagnostic and vulnerable-version questions, are retained in source metadata but not executed: the application supports exact static answers. Both questions retain their original static alternatives and remain automatically graded. Extra formatting variants accepted by those regexes may need instructor review; add specific accepted variants in the challenge editor if needed.

The original final challenge references `Assignment-StaticBinaryAnalysisP2`, while the linked PDF specifies `Assignment-EnvDev1`. The displayed challenge uses the PDF's subject and retains the original automatic `OK` acknowledgment and 5 points. The individual document is sent through the course email process; entering `OK` does not send or verify delivery. No new report, snapshot, or baseline requirements have been added.

## Files and reuse

- `theme-packs/environment-development.zip`: reusable world, artwork, characters, guide, MIDI, and effects; no questions or answers.
- `theme-packs/environment-development-demo-theme.zip`: matching assignment world.
- `theme-packs/environment-development-demo-content.zip`: all ten ordered challenges, accepted answers, source metadata, hints, and the original exercise PDF. Treat as instructor material.

The `-demo-` filenames follow the existing pack-builder convention; the library action is labeled **Load assignment**. For a fresh assignment, import the matching theme and content ZIPs together under **Import & backup**. Importing this layout over unrelated content can relocate questions; updating an existing Environment Development assignment preserves its locations.

Edit `demo-challenges.yaml`, then run `npm run themes:build`; runtime `demo-content.json` and the ZIPs are generated. Preserve the dependency chain when changing IDs. Use fresh IDs for a new assignment run if earlier completions should not carry over. Theme and demo-theme manifests intentionally match because progression lives in content dependencies.

## Assets

Both original maps were generated with the built-in image tool; their prompts are in `ART_PROMPTS.json`. Painted ground follows the empty deck corridors and celebration floor. Player sprites and celebrating engineers reuse Agentic Circuit artwork, the Flight Director and Lab Instructor reuse the Core Curator sprite, and event effects reuse Agentic Circuit cues. Referenced bytes are included in exported theme ZIPs. The original quiet MIDI is generated by `node scripts/generate-environment-audio.mjs`. Music and effects use the existing mute controls.
