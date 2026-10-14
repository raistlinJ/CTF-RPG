# Agentic Circuit — Agentic AI course theme

A digital campus for question-based assessments: cyan circuitry on dark navy boards, amber signal lights, processor rooms, server labs, three explorers, and a quiet electronic MIDI loop.

## Use it

As an admin, open **Manage → Theme → Theme library → Agentic Circuit**. **Use this theme** loads the complete built-in pack and asks you to confirm the change. **Download theme ZIP** gives you the same portable pack for another installation. Existing questions, accounts, teams, scores, and written responses remain saved. The theme retains the original map and character IDs so existing bindings continue to work. Its interiors have clear floors for placing test questions.

| Course location | Map ID | Example reachable question tile |
| --- | --- | --- |
| Circuit Campus | `town` | x18, y19 (near the starting tile) |
| Reasoning Core | `castle` | x20, y10 |
| Tool Workshop | `toy-workshop` | x15, y15 |
| Memory Lab | `cocoa-cottage` | x20, y12 |
| API Gateway | `post-office` | x20, y12 |
| Safety Lab | `elf-house` | x20, y12 |
| Evaluation Lab | `bakery` | x20, y12 |

Each room has its own map, so equal coordinates in different rooms are distinct locations. Cyan entrance/exit outlines mark the exact movement tiles. Building artwork is decorative; the theme's validated tile geometry controls movement.

The characters keep existing account IDs: `web` becomes **Circuit Scout**, `thunder` becomes **Prompt Pilot**, and `shield` becomes **Guardrail Sentinel**. Theme artwork lives in `public/themes/agentic-circuit/maps` and `public/themes/agentic-circuit/sprites`. The original MIDI tracks live at `public/themes/agentic-circuit/audio/circuit.mid` and `reflection.mid` and start muted.

## Prepare your test

1. Export your current content pack and full backup if you want to preserve a copy before replacing questions.
2. Open **Challenges**, select a map and a reachable tile, name the question, and paste your test text.
3. Choose **Answer checking → Automatic** for short answers checked against accepted flags, or **Manual grading** for written responses reviewed by an admin. This choice is available in every theme.
4. Set the maximum points, optional hints/costs, and downloadable question files. Save the challenge.
5. Use new question IDs for each distinct test so past completions, submissions, and hint purchases remain separate.
6. Students sign in, create/join their team, explore question locations, and submit answers. Correct automatic answers award points immediately. Written answers show **Awaiting admin review** and award no points until graded.
7. Open **Challenges → Grade written answers** to grade written responses and give feedback. Grade from 0 to the saved maximum; hint costs are deducted automatically, with a minimum final award of zero. Regrading updates the existing award rather than adding points twice.

Pending written responses may be updated until grading. New hints cannot be purchased after a written answer is submitted. Students can reopen their own response from the journal to see its status and feedback. Admin review uses per-student responses even when students share a team; points retain the existing individual scoreboard behavior. Full backups preserve responses, feedback, grades, and reviewers; reusable theme/content packs contain no student responses.

The artwork-only theme contains no assessment answers. The optional demo content contains beginner practice answers. Add your actual test through the editor or separate content import. `question-template.yaml` is an authoring example with clearly marked placeholders, not an active test or a ready content pack.

## Artwork and music

Six bitmap assets were created with the built-in image generator. Exact prompts are saved in `ART_PROMPTS.json`. Images are used without raster edits; the renderer fits the visible sprite pixels and scales map artwork onto its 40×28 grid. Three map images cover the campus, the Reasoning Core, and the shared lab shell used for the other five rooms. Three PNG sprites retain genuine transparent alpha.

The MIDI is an original sixteen-bar electronic arpeggio and bass pattern at 96 BPM, with low volume and no soundfont dependency. Theme assets and the manifest are bundled into the admin-only ZIP download. The manifest is `theme.json`; exported packs use the standard `theme.yaml` format described in `THEMES.md`.

## Beginner demo adventure

Open **Manage → Theme → Theme library → Agentic Circuit → Load demo adventure**. The confirmation imports its matching world and example content together. It replaces the active challenge collection; accounts, teams, and recorded scores stay saved. Export your current content first if you want to keep a reusable copy. **Use this theme** still changes only the world, without demo locks. Neither pack includes accounts, passwords, or student answers.

The demo has ten simple challenges (nine visible, one hidden instructor example): star markers, 1×1/2×2/3×3 boss encounters, automatic and instructor grading, case-sensitive flags, free and paid hints, a downloadable text file, and an optional hint priced in a bonus reward. Guides have branching dialogue, and the host appears after the final boss. Both variants now have two original MIDI tracks that shuffle during playback and can be muted.

Follow this route:

1. Talk to the guide at town (18,17), then solve the starter at (18,19) for the **red key**.
2. Solve the star at town (11,19) for the **shortcut incantation**. Touch the shortcut at (16,21) to travel to Memory Lab and return using its exit.
3. Visit Tool Workshop and solve the **1×1 boss** at (15,15) for the **gold key**.
4. Use that key to enter Safety Lab and solve the **2×2 boss** at (20,12). Its prerequisites are the starter route and incantation challenge.
5. Download the note in API Gateway at (20,12) and enter its flag with exact capitalization.
6. Use the red key to enter Reasoning Core. The **3×3 boss** starts at (19,10) and unlocks after the 2×2 boss and file challenge. Its full nine-tile footprint is usable ground.
7. Submit the written reflection at castle (25,18). An admin grades it under **Challenges → Submissions**. The host at (25,16) is now available to talk to.

The Evaluation Lab bonus at (20,12) awards a green key. Its answer-reveal hint costs 5 points and forfeits that optional key; no required route uses it. The Memory Lab has another short question at (20,12). The hidden example at town (29,8) can be enabled in the challenge editor.

Portable files, generated by `npm run themes:build`:

- `theme-packs/agentic-circuit.zip`: reusable world/artwork/music and guide, with no demo locks or challenges.
- `theme-packs/agentic-circuit-demo-theme.zip`: world with matching locks, shortcut, and progression dialogue.
- `theme-packs/agentic-circuit-demo-content.zip`: challenges, answers, rewards, hints, and downloads.

To import manually, choose the demo theme ZIP plus its **Matching content ZIP** in Import & backup → Theme, content & backups. Keep these paired so every lock has its reward source. Author questions in `demo-challenges.yaml`; `demo-content.json` is generated for the runtime. World changes are in `demo-theme.json`; edit the unlocked variant separately in `theme.json`. IDs use theme-specific `np-demo-v2-` / `ac-demo-v2-` prefixes to keep these examples distinct from previous challenges. Reimporting the same demo keeps its existing completion history; change IDs when starting a fresh assessment.

These are practice questions with public source answers, not a secure exam. Replace text, flags, hints, downloads, and IDs before using them for a real test.
