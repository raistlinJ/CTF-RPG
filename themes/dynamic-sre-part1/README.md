# Dynamic SRE Part 1: Breakpoint Rebellion

Climb a four-floor reverse-engineering tower with the AVALANCHE analysis crew. Luminous 1s and 0s, disassembly screens, branching instruction graphs, register banks, and memory circuits make each floor part of the binary-analysis story. Three scored checkpoints sit on each of the first three floors. The fourth and highest floor is the congratulations room, with trophies and a cheering crew.

Open **Manage → Theme → Theme library → Dynamic SRE Part 1: Breakpoint Rebellion → Load assignment** to load the world and all nine challenges. **Use this theme** loads the artwork and guides alone. Loading an assignment replaces the current world and challenges after the usual confirmation; accounts and recorded scores remain saved.

| Order | Checkpoint | Exercise reference | Floor | Tile |
| --- | --- | --- | --- | --- |
| 00 | Mission Briefing | Exercise PDF | 1 · Source & Disassembly | 6,22 |
| 01 | Map the C Code | Step 1, #3 · Table 1 | 1 · Source & Disassembly | 31,22 |
| 02 | Find the String Reference | Step 2, #6 | 1 · Source & Disassembly | 14,7 |
| 03 | Trace the Print Call | Step 3, #7 | 2 · Breakpoints & Registers | 6,22 |
| 04 | Predict the Branch | Step 3, #12 | 2 · Breakpoints & Registers | 31,22 |
| 05 | Inspect the Input Register | Step 3, #21 | 2 · Breakpoints & Registers | 14,7 |
| 06 | Locate the Stack Argument | Step 3, #22 | 3 · Memory & Patching | 6,22 |
| 07 | Apply the Binary Patch | Step 4, #7 | 3 · Memory & Patching | 31,22 |
| 08 | Individual Debrief | Final deliverable | 3 · Memory & Patching | 14,7 |

The three analysis floors use map IDs `analysis-bunker`, `debugging-floor`, and `patch-floor`; Floor 4 is `celebration-hall`. On each analysis floor, start at the lower left, travel right along the bottom corridor, turn up at the far right, then return left across the upper corridor. The upward lift is at **4,7**, approached from **5,7** by stepping left. It takes you to the next floor. Each floor has a guide near the start.

On Floors 2–4, step off the purple arrival tile and then back onto it to return to the previous floor's up stairway at **4,7**. Arrival does not immediately send you upstairs again; step away and back onto the stair to ascend again. Return trips preserve the nested floor history. Upward arrival tiles on analysis floors are **5,23**; the congratulations room arrival tile is **20,23**.

Only Mission Briefing initially unlocks. Each subsequent challenge has a server-enforced `dependsOn` reference to its predecessor, including across floors. Students can explore ahead, but cannot answer later checkpoints early. Complete the intervening exercise instructions while moving between scored questions.

## Source conversion

The assignment comes from `Dynamic SRE 1.2025-03-22_19_41_03-ctfd-3.8.7.zip`, checked against `07_assignment_dynamicSRE_v2.docx` in the Fall 2026 `07_DynamicSRE_part1` course folder. The original export and course documents are unchanged. `SOURCE.json` records the export and exercise hashes, source record order, and conversion counts.

All **9 source challenges, 37 points, 5 free hints, 20 static accepted answers, and the challenge-linked exercise PDF** are retained. The two `esp+4h` variants keep their original case-sensitive rules; the other alternatives retain their case-insensitive rules. Original challenge definitions, flags, hints, and attachment references remain in each challenge's `ctfd` metadata. There are no regex alternatives or unsupported grading plugins in this export.

Checkpoint names and exercise references clarify the original numbered questions. The new prerequisite chain follows the exercise order; the export had no explicit prerequisites. No additional scored requirements were added. The Step 4 `OK` answer remains an acknowledgment that the patch was applied and tested. The Uber Challenge remains optional.

The final checkpoint preserves **Assignment-DynReverse1** and the exercise's individual one–two paragraph write-up. Students submit that document through the course email process. Entering `OK` records acknowledgment; it does not send or verify the email.

Only the PDF linked to challenge 18 is included in the content pack. The large source export also contains unrelated uploads, including solution documents; these are excluded along with accounts, passwords, teams, submissions, and solve history.

## Congratulations on Floor 4

After the individual debrief on Floor 3, take that floor's upper-left lift to **Floor 4 · Congratulations**. Binary wall displays frame the banner **Congratulations You Completed the Assignment**, trophy cups, and a cheering crew. Talk to the Mission Coordinator, Breakpoint Specialist, and Patch Engineer for congratulatory dialogue. Step off the purple arrival lift and back onto it to return to Floor 3. As in the Environment Development theme, travel is open; scored progress is enforced by the challenge prerequisites.

## Files and reuse

### Intro and completion cutscenes

Four challenges each have a before-challenge and after-completion video:

| Challenge | Intro | Completion |
| --- | --- | --- |
| 00 · Mission Briefing | Enter the Binary Tower | Analysis Crew Ready |
| 04 · Predict the Branch | Pause at the Fork | Control Flow Traced |
| 07 · Apply the Binary Patch | Change the Bytes | Patch Checkpoint Complete |
| 08 · Individual Debrief | Make the Work Your Own | Mission Complete |

The eight silent MP4s are 6.4 seconds each, with readable captions, staged diagrams, moving binary digits, and the existing floor artwork. Intro scenes avoid revealing accepted answers. The final completion video uses the Floor 4 celebration artwork. Opening a selected challenge plays its intro once per player; completing it unlocks the completion video. Players can press **Space** to skip or replay unlocked videos from the challenge. The other five challenges have no cutscenes.

Files live in `public/videos/dynamic-sre-part1/`, with `-pre.mp4` and `-post.mp4` suffixes. `CUTSCENES.json` contains the captions and storyboard. Run `node scripts/generate-dynamic-sre-videos.mjs` with ffmpeg installed to regenerate the clips, then `npm run themes:build` to include them in the assignment content pack. Challenge fields `discoveryVideo` and `solveVideo` link the media to the four selected checkpoints. This uses the app's existing cutscene playback.

For an installation already using this four-floor assignment, import the updated `dynamic-sre-part1-demo-content.zip` to add the videos. Stable challenge IDs retain recorded scores and completions.

### Packs

- `theme-packs/dynamic-sre-part1.zip`: reusable four-floor tower, artwork, characters, guides, MIDI, and effects; no challenge questions or answers.
- `theme-packs/dynamic-sre-part1-demo-theme.zip`: matching assignment world.
- `theme-packs/dynamic-sre-part1-demo-content.zip`: all nine ordered challenges, answer rules, hints, source metadata, the original exercise PDF, and eight intro/completion MP4s. This is instructor material.

The `-demo-` filenames follow the existing builder convention; the library action is **Load assignment**. Import the matching theme and content ZIPs together under **Import & backup** for a fresh assignment. For layout changes, import the matching content alongside the theme so questions move to their intended floors. Stable challenge IDs preserve recorded completion history. Theme-only updates are suitable when the current questions already use the four-floor layout.

Edit `demo-challenges.yaml`, then run `npm run themes:build` to regenerate runtime `demo-content.json` and the ZIPs. Keep the dependency chain consistent when changing IDs. Use fresh IDs for a new assignment run if earlier completions should not carry over. Theme and demo-theme manifests intentionally match because progression lives in the content dependencies.

## Assets and verification

All four original floor maps were generated with the built-in image tool. The game uses high-quality WebP copies (quality 95) to keep theme packs and full backups compact; source PNGs remain in the image tool's generated-images folder. The complete prompt set is recorded in `ART_PROMPTS.json`. Project assets are in `public/themes/dynamic-sre-part1/maps/`:

- `floor-1-source.webp`: binary code, source analysis, and disassembly workstations.
- `floor-2-debugging.webp`: breakpoints, branching execution, and register displays.
- `floor-3-patching.webp`: stack memory, changed bits, and patch workstations.
- `floor-4-congratulations.webp`: binary celebration room at the top of the tower.

Painted ground follows the clear corridors and the central congratulations floor. Player and celebration sprites reuse Agentic Circuit artwork; floor guides and the administrator use the Core Curator sprite. Effects reuse Agentic Circuit cues. All referenced bytes are included in theme exports.

The original quiet MIDI loop is generated by `node scripts/generate-dynamic-sre-audio.mjs`. Music and effects use the normal mute controls. Regression checks in `tests/dynamic-sre-theme.test.mjs` cover source counts and case rules, packed attachment integrity, reachable checkpoints and guides, ascending and descending all four floors, paired import, sequential answer gating, the original point total, preservation of progress after theme-only updates, and full-backup packaging within the existing 64 MB limit.
