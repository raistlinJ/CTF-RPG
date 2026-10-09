# Agentic Circuit — Agentic AI course theme

A digital campus for question-based assessments: cyan circuitry on dark navy boards, amber signal lights, processor rooms, server labs, three explorers, and a quiet electronic MIDI loop.

## Use it

As an admin, open **Manage → Theme → Import / Export → Agentic Circuit**. **Use this theme** loads the complete built-in pack and asks you to confirm the change. **Download theme ZIP** gives you the same portable pack for another installation. Existing questions, accounts, teams, scores, and written responses remain saved. The theme retains the original map and character IDs so existing bindings continue to work. Its interiors have clear floors for placing test questions.

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

The characters keep existing account IDs: `web` becomes **Circuit Scout**, `thunder` becomes **Prompt Pilot**, and `shield` becomes **Guardrail Sentinel**. Theme artwork lives in `public/themes/agentic-circuit/maps` and `public/themes/agentic-circuit/sprites`. The original, generated MIDI lives at `public/themes/agentic-circuit/audio/circuit.mid` and starts muted.

## Prepare your test

1. Export your current content pack and full backup if you want to preserve a copy before replacing questions.
2. Open **Challenges**, select a map and a reachable tile, name the question, and paste your test text.
3. Choose **Answer checking → Automatic** for short answers checked against accepted flags, or **Manual grading** for written responses reviewed by an admin. This choice is available in every theme.
4. Set the maximum points, optional hints/costs, and downloadable question files. Save the challenge.
5. Use new question IDs for each distinct test so past completions, submissions, and hint purchases remain separate.
6. Students sign in, create/join their team, explore question locations, and submit answers. Correct automatic answers award points immediately. Written answers show **Awaiting admin review** and award no points until graded.
7. Open **Manage → Review answers** to grade written responses and give feedback. Grade from 0 to the saved maximum; hint costs are deducted automatically, with a minimum final award of zero. Regrading updates the existing award rather than adding points twice.

Pending written responses may be updated until grading. New hints cannot be purchased after a written answer is submitted. Students can reopen their own response from the journal to see its status and feedback. Admin review uses per-student responses even when students share a team; points retain the existing individual scoreboard behavior. Full backups preserve responses, feedback, grades, and reviewers; reusable theme/content packs contain no student responses.

No exam questions or accepted answers are included in this theme. Add your actual test through the editor or the separate content import. `question-template.yaml` is an authoring example with clearly marked placeholders, not an active test or a ready content pack.

## Artwork and music

Six bitmap assets were created with the built-in image generator. Exact prompts are saved in `ART_PROMPTS.json`. Images are used without raster edits; the renderer fits the visible sprite pixels and scales map artwork onto its 40×28 grid. Three map images cover the campus, the Reasoning Core, and the shared lab shell used for the other five rooms. Three PNG sprites retain genuine transparent alpha.

The MIDI is an original sixteen-bar electronic arpeggio and bass pattern at 96 BPM, with low volume and no soundfont dependency. Theme assets and the manifest are bundled into the admin-only ZIP download. The manifest is `theme.json`; exported packs use the standard `theme.yaml` format described in `THEMES.md`.
