# Author challenges in YAML

You can create and edit challenges through the [admin studio](ADMIN_GUIDE.md), with admin-only YAML export. `content/challenges.yaml` provides the initial set; after the first admin save, the persistent database set is authoritative. For your own Node server, restart the service after editing; no frontend rebuild is needed. In Docker, run `docker compose restart ctf-rpg`. For the hosted Sites version, rebuild and republish. To use another server-side YAML file, set `CHALLENGES_CONFIG=/absolute/path/challenges.yaml` when starting your Node server.

## Complete example

```yaml
challenges:
  - id: secret-scroll
    object: Secret scroll
    location: { x: 11, y: 19 }
    region: Lantern Lane
    text: |
      Download the scroll and find the flag hidden inside it.
      Submit the flag exactly as you find it.
    points: 100
    flags:
      - "FLAG{NorthPole}"
      - "FLAG{WinterVillage}"
    caseSensitive: true
    hints:
      - id: first-look
        label: A small nudge
        text: "Look at the first letter of each line."
        cost: 10
      - id: closer-look
        label: A stronger clue
        text: "Read those first letters from top to bottom."
        cost: 20
      - id: free-help
        label: Getting started
        text: "Download the file below before looking for the flag."
        cost: 0
    downloads:
      - name: Secret scroll
        url: /downloads/secret-scroll.txt
        filename: secret-scroll.txt
      - name: Reference document
        url: https://your-school.example/files/reference.pdf
```

The example URL and local scroll are illustrative: replace them with your own files. The included Lantern Lane challenge has a working `/downloads/packing-list.txt` download.

## Challenge fields

| Field | Meaning |
| --- | --- |
| `id` | Required unique, stable lowercase identifier using letters, digits, and hyphens. Keep it unchanged to preserve completions and hint purchases. |
| `map` | Optional map ID, default `town`. Use `castle`, `toy-workshop`, `cocoa-cottage`, `post-office`, `elf-house`, or `bakery` for interiors. See [MAP_GUIDE.md](MAP_GUIDE.md). |
| `object` | Required name of the hidden object. |
| `dependsOn` | Optional list of prerequisite challenge IDs or `npe:<entity-id>` references, default `[]`. Every prerequisite must be completed by the player before this challenge unlocks. |
| `location` | Required `{x, y}` map tile coordinates, x 0–39 and y 0–27. See the [map guide](README.md#map-coordinates-and-locations). |
| `region` | Required location clue shown in the treasure journal. |
| `text` | Required challenge instructions, up to 20,000 characters. YAML `|` preserves paragraphs and line breaks. Text is displayed as plain text, not HTML or Markdown. |
| `points` | Required reward before hints: an integer from 0 to 10,000. |
| `flags` | Required list of accepted answers, each a nonempty string up to 500 characters. Any one correct flag solves the challenge. Quote numeric flags, such as `"24"`. |
| `caseSensitive` | Optional boolean, default `false`. If `true`, capitalization must match. |
| `hints` | Optional list of up to 20 hints. Use `[]` or omit it for no hints. |
| `downloads` | Optional list of up to 20 downloadable file links. |
| `discoveryVideo`, `solveVideo` | Optional direct MP4/WebM HTTPS URL or local video path. See [Challenge cutscenes](#challenge-cutscenes). |

Matching ignores leading and trailing whitespace. Internal spaces and line breaks are significant. With `caseSensitive: false`, `FLAG{Snow}` and `flag{snow}` match. With `caseSensitive: true`, they differ. `"24"` and `"twenty-four"` must be listed separately when both are accepted. Flags remain on the server and are not included in the game response.

## Challenge cutscenes

Set optional `discoveryVideo` and `solveVideo` fields to a direct MP4/WebM HTTPS URL or a local path such as `/videos/intro.mp4`. Omit a field or set it to `null` to disable that cutscene. GIFs are images, not challenge cutscenes. The challenge editor’s **Cutscenes** tab also supports MP4/WebM uploads up to 4 MB, previews, and removal. Save the challenge after uploading.

The discovery video plays in a browser modal the first time each player opens the challenge. The solve video plays after a correct answer or when a manually graded completion reaches the player’s next game update. Playback history persists per account across logins and devices. Press **Space** or click **Skip cutscene** to continue; browsers that block autoplay show a **Play cutscene** button. Players can reopen any discovered or completed challenge from the journal and use **Replay discovery cutscene** or **Replay solve cutscene**. The solve video is unlocked only after completion.

Local videos travel with content packs and full backups; packs retain the existing 4 MB per-file and 8 MB total limits. HTTPS videos remain external links. Each bundled demo adventure has a short starter discovery video and a boss solve video; see the [North Pole](themes/north-pole/README.md) and [Agentic Circuit](themes/agentic-circuit/README.md) demo guides.

## Inventory rewards

Configure **Rewards → Inventory rewards** in New discovery / Edit discovery to grant any combination of red, orange, yellow, green, blue, purple, silver, or gold keys. You can also teach short incantations, one phrase per line (up to 80 characters each). In YAML:

```yaml
rewards:
  keys: [red, blue]
  incantations: [open sesame]
```

Automatic challenges award inventory with the first correct answer. Manual challenges save the reward definition with the first submitted response and award it on first grading, including a zero-point grade. Repeated answers and regrading do not duplicate items. Keys are reusable, and each color appears once in Inventory. Editing a challenge preserves previously earned rewards; existing completions do not receive newly added rewards retroactively. Definitions travel in content packs; earned inventory and unlocks travel in full backups.

## Challenge prerequisites

Use `dependsOn: [first-challenge-id, second-challenge-id]` to require both challenges before this one appears. Use `dependsOn: ["npe:guide-id"]` to require speaking to that entity first. Entity definitions in theme `world.entities` can require solved challenges using their own `dependsOn`. Referenced IDs must exist in the active challenge catalog or theme; self-links, duplicate prerequisites, and dependency loops are rejected. A written-response prerequisite counts as completed after grading. Previously completed challenges remain available, while hidden challenges retain their visibility restrictions.

Admins edit these connections in **Challenges → Dependencies**, with zoom, fit, and challenge summaries. Exports, content packs, and full backups preserve them. Standard CTFd prerequisites are mapped to these IDs during import; missing references keep the affected challenge hidden for review. See [the dependency guide](ADMIN_GUIDE.md#challenge-dependencies) and [CTFd import guide](ADMIN_GUIDE.md#importing-ctfd-exports).

## Hint fields and scoring

Each hint has a unique `id` within its challenge, required `text`, and optional nonnegative integer `cost` (default `0`). `label` is optional and defaults to `Hint 1`, `Hint 2`, etc. Hint text supports line breaks. The total configured hint cost cannot exceed the challenge's points.

Optional `rewardCost` selects keys and incantations from this challenge's `rewards` to withhold when the team completes it. Combine it with `cost` or use it alone. The management editor provides checkboxes under **Hints & files → Rewards to forfeit**. A hint with zero point cost and no selected rewards is free.

```yaml
rewards:
  keys: [red, blue]
  incantations: [open sesame]
hints:
  - id: help
    text: Look beneath the clock.
    cost: 10
    rewardCost:
      keys: [red]
      incantations: [open sesame]
```

Taking this hint leaves the blue key and deducts 10 completion points. Keys or incantations earned from other challenges stay in Inventory. Each reward can pay for one hint across the whole team: if two hints cost the same reward, purchasing either makes the other unavailable. Incantation prices show a count to students, keeping unearned phrases private. Manual answers save the team’s remaining rewards and hint costs at submission and award them on first grading. Once a teammate submits, new hints for that challenge are locked for everyone so the saved costs remain consistent.

Students see hint labels and prices before choosing **Unlock**. Locked hint text is withheld from the browser. Unlocking a hint stores its cost and reveals its text to every current teammate; subsequent requests, teammate purchases, and page reloads do not charge again. Hints can be purchased in any order, including before the student earns any expedition points.

**Hints reduce the reward for their own challenge.** They do not spend points already earned from other challenges. For a 100-point challenge, unlocking 10-point and 20-point hints leaves a 70-point team reward, even when different teammates buy the hints. The journal and challenge window show that remaining reward. Any teammate solving the challenge adds those 70 points to the shared team total once. An incorrect answer has no cost. Free hints have no effect on the reward.

New hint purchases are blocked after completion. Previously unlocked hints remain available through the API; the map's existing interaction hides collected objects. The server uses atomic inserts to prevent double charges, shared reward double spending, duplicate rewards, or inconsistent scores when teammates solve and purchase at the same time.

Older duplicate purchases count the highest saved point cost once per team/hint and retain all recorded reward forfeitures.

Keep hint IDs stable. Changing a hint's text updates what its purchaser sees; changing its point or item costs does not reprice past purchases. If you remove a purchased hint, its recorded costs still count toward the challenge's reward. Completion stores the final awarded points and items, so later edits do not alter earned rewards. If older stored point costs exceed a newly reduced reward, the remaining points are clamped to zero. Existing hints without `rewardCost` retain their point-only pricing.

## Download fields and files

Each download requires:

- `name`: the label students click, up to 200 characters.
- `url`: a local URL beginning with `/`, or an external `https://` URL. Relative filesystem paths, `..`, and unsafe URL schemes are rejected.
- `filename`: optional suggested download filename, using letters, digits, periods, underscores, or hyphens.

In the admin challenge editor, open **Hints & files → Challenge files → Upload files** to select one or more files directly (up to 4 MB each, 20 attachments per challenge). The editor fills in the URL, label, and a safe download filename. Use **Upload or replace this file** on a row to replace an existing attachment while keeping its label. Click **Save challenge** after uploading. Uploaded files are stored as binary downloads, including packet captures, SQL scripts, PDFs, archives, and other analysis formats. Saved attachments travel with content exports and full backups; the existing 8 MB content asset limit still applies to combined attachments. Removing a row detaches it from that challenge.

For a local file, put it in `public/downloads/`:

```text
public/downloads/secret-scroll.txt  →  /downloads/secret-scroll.txt
public/downloads/worksheet.pdf     →  /downloads/worksheet.pdf
public/downloads/puzzle.zip        →  /downloads/puzzle.zip
```

The YAML only links to the file; it does not embed or upload its contents. Local links request a browser download with the suggested filename. External links open in a new tab; whether the external file downloads depends on that server's headers and browser behavior.

Local downloads are public assets, accessible by URL without a game login. They are suitable for challenge materials, not private student data. Keep credential YAML, accepted flags, and teacher-only solutions outside `public/`. File replacements are picked up by the Node server immediately; deploying new hosted assets requires publication.

## Compatibility and validation

The original `prompt`, `answers`, and single `hint` fields still work. They are converted to `text`, `flags`, and one free hint with ID `hint`. Use the new fields for new challenges. Do not supply both old and new forms of the same field. Previously completed challenges retain their earned points.

Startup/build validation rejects invalid coordinates, duplicate challenge IDs or positions within the same map, duplicate hint IDs, negative costs, total costs above the reward, whitespace-only flags, and invalid download URLs. Unknown challenge/hint/download fields are rejected to catch spelling errors. Maximum 100 challenges. Place treasures on accessible ground or within two walkable tiles; the [map guide](README.md#map-coordinates-and-locations) lists suggested locations.

Node/SQLite self-hosting automatically adds the hint-purchase table on startup without changing old scores. For a local Cloudflare preview, apply the new `drizzle/0001_white_maria_hill.sql` migration once; production Sites applies it during publication.

## Automatic and manual grading

Every challenge supports `grading: automatic` (the default) or `grading: manual`, selected with **Answer checking** in the challenge editor. Automatic challenges require accepted flags. Manual challenges accept a written response of up to 20,000 characters and do not require flags. Responses are private to the student and admins, can be updated until graded, and freeze new hint purchases once submitted.

Admins use `/admin/review` (**Manage → Review answers**) to award a whole-number grade from 0 to the submission's saved maximum and provide feedback. Recorded hint costs are subtracted, with a minimum final award of 0. Regrading updates the existing award and scoreboard. Response revisions prevent stale edits or grades from overwriting newer work. Full backups retain responses/grades/feedback; theme and content packs exclude them. Use new IDs for new tests; grading mode cannot be changed after responses or awards exist.

The built-in **Agentic Circuit** theme is available under **Theme → Theme library**. See [the course theme guide](themes/agentic-circuit/README.md) for activation, maps, and test preparation.
