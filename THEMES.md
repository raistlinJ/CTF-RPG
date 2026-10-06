# Reusable themes and challenge content

Open **Manage → Themes & content** (`/admin/packs`) as an administrator. Both exports and both imports require administrator authorization on the server. Student access to the game does not grant pack-management access.

## What each pack contains

| Pack | Includes | Excludes |
| --- | --- | --- |
| Theme ZIP | Title/description, map images and names, spawn points, walkable bounds, blocked tiles, building entrances and exits, character IDs/names/sprites, MIDI music settings and files | Challenge flags/text/hints, accounts, passwords, teams, scores |
| Content ZIP | Challenge text, points, flags and case sensitivity, hints and costs, map IDs/locations, local downloadable files, external HTTPS download links | Theme maps/art/music, accounts, passwords, teams, scores |
| Full backup ZIP | Runnable application/source, both active packs and assets, configuration, accounts/password hashes, teams/membership/size limit, scores/hint purchases | Active login sessions and environment secrets |

Content ZIPs contain accepted answers and locked hints: keep them private. Theme exports contain no account or challenge data. The public game can read active theme metadata and images so students can explore; administrative import/export routes remain protected.

## Export and reuse

1. Export the theme and/or content ZIP from the admin page.
2. Import the theme on another installation of this application. If its map IDs or geometry differ from the currently loaded challenges, also select its matching content ZIP in **Matching content ZIP**.
3. Confirm the replacement. Paired files are validated together and committed together. Invalid packs leave the current theme and challenges active.
4. Reload the game and challenge editor. Existing students retain their accounts, teams, and earned points.

Content can also be imported independently when its map locations work with the current theme. A theme can be imported independently when current challenge locations still work with its maps. Existing character IDs used by accounts must remain in the imported theme; use account management to reassign characters before removing their IDs.

The theme page previews the current title, map/character counts, and challenge count. Changing a pack replaces its active collection; it does not append to it. Old progress is preserved. Use new challenge IDs and hint IDs for a distinct activity so previous completions and purchases do not apply to new questions. Exports are portable ZIPs, rather than links to the originating server.

## Edit a theme ZIP

Extract an exported pack. Its structure is:

```text
 theme.yaml
 assets/
   maps/town.png
   sprites/web.png
   audio/north-pole.mid
```

Only referenced local assets are required. The exact paths may differ: assets exported after an import commonly appear under `assets/api/assets/` with names derived from their contents. Keep the manifest paths and corresponding `assets` paths together. You can rename them together to friendly paths before importing.

Example `theme.yaml` for a single-map world:

```yaml
format: quest-theme
version: 1
title: Island Quest
description: Explore together
world:
  startMap: island
  renderer: tiles
  buildings: []
  trees: []
  maps:
    - id: island
      name: The Island
      bounds: {left: 1, right: 38, top: 1, bottom: 26}
      spawn: {x: 18, y: 20}
      exit: null
      background: /maps/island.png
      floor: '#dfedef'
      wall: '#1b2e39'
      obstacles:
        - {x: 25, y: 12, w: 3, h: 4}
characters:
  - id: web
    name: Island Explorer
    subtitle: Ready to explore.
    sprite: /sprites/explorer.png
    fallback: web
audio:
  midi: /audio/island.mid
  loop: true
  volume: 0.15
```

Place the image at `assets/maps/island.png`, sprite at `assets/sprites/explorer.png`, and MIDI at `assets/audio/island.mid`. Set `audio.midi` or an image path to `null` to omit it. Preserve other character IDs if destination accounts already use them. Import matching content referring to `island` rather than `town`.

Maps share a **40×28 tile grid**. Coordinates are integers; x is 0–39, y is 0–27. Bounds are inclusive. Map images should be **960×672 pixels** (24 pixels per tile); other sizes are scaled to fill the map. The image supplies the visual world, while `bounds` and `obstacles` determine movement. A background-less map uses floor/wall colors and visible obstacle/entrance tiles. PNG, JPEG, WebP, and GIF are supported for map images and sprites. Transparent single-frame PNG sprites work best; sprites are centered on the player's tile and drawn about 42 pixels tall. MIDI files provide muteable background music.

For each interior map, add exactly one `world.buildings` entry whose `id` matches that map. Its x/y/w/h locate the building on the starting world map. Its door must lie on the building's bottom edge. The tile immediately below the door must be reachable. Walking onto the door takes the player to that interior's `spawn`. Walking onto the interior's `exit` returns the player to the tile below the world-map door. Spawns and exits must be reachable and cannot be blocked. Buildings cannot overlap.

Example entrance (the referenced interior must also appear in `maps`):

```yaml
buildings:
  - id: lodge
    name: Island Lodge
    x: 20
    y: 9
    w: 3
    h: 4
    door: {x: 21, y: 12}
    color: '#654321'
```

The existing North Pole is now defined in `lib/default-world.json`, with map PNGs in `public/maps` and hero PNGs in `public/sprites`. These are baseline theme assets. `content/game.yaml` supplies baseline character/music settings. Admin imports persist the active theme in the database and override those baselines without rebuilding. Shared interface controls and the fallback character renderer remain application code, while the theme owns world artwork, layout, and characters.

## Edit a content ZIP

A content pack contains `content.yaml` and `assets/` files for local downloads:

```yaml
format: quest-content
version: 1
challenges:
  - id: island-clue-1
    map: island
    object: Buried clue
    location: {x: 19, y: 20}
    region: East beach
    text: Read the attached file. What is the answer?
    points: 100
    flags: ['YOUR-ANSWER']
    caseSensitive: false
    hints:
      - id: clue
        label: A small clue
        text: Look at the first line.
        cost: 10
    downloads:
      - name: Puzzle file
        url: /downloads/puzzle.txt
        filename: puzzle.txt
```

Place the file at `assets/downloads/puzzle.txt`. PDF, UTF-8 TXT/CSV, ZIP, images, and MIDI retain their types. Other downloadable file types (for example PCAP, documents, or binary puzzles) are stored as opaque attachments; their original download filename is preserved. External HTTPS URLs remain links; their external bytes are not downloaded or bundled. See `CHALLENGES.md` for challenge behavior. Use the normal challenge editor for daily authoring, then export the collection as a content pack.

Rezip **the manifest and assets directory at the ZIP root**, not an enclosing folder. The importer rejects unknown manifest versions, duplicate IDs, blocked/unreachable challenge locations, unsupported or disguised theme/media file types, missing files, and unsafe archive paths. Each ZIP is limited to **8 MB compressed and expanded**, **4 MB per file**, and **250 entries**. Two paired ZIPs can be imported together. Theme images cannot be SVG/HTML, and theme music must be MIDI. Other challenge attachments are served as opaque downloads rather than executable website assets.

## Storage and self-hosting

Hosted assets live in the `QUEST_FILES` object-storage binding; active theme metadata and challenge collections live in the database. Self-hosted assets live in `data/pack-assets` (override with `ASSET_PATH`), alongside the persistent SQLite database. Keep this directory with the database when moving a server. Docker's existing `quest-data` volume persists both.

Full backups include imported asset bytes under `data/pack-assets` and the active theme in `backup.json`. Follow `BACKUPS.md` to recreate the application, restore accounts, and preserve both active packs. Older backups without a theme continue to use the bundled default theme.

Theme manifests may set `badge: cpu`, `badge: snowflake`, or `badge: compass` for the game/scoreboard icon. Omitted badges use the compass. The built-in Agentic Circuit course theme is selectable from the admin page; see `themes/agentic-circuit/README.md`. Challenge grading modes remain independent of every theme.

### Automatic placement repair

Importing a theme or content pack preserves valid, unique challenge positions first. Questions on blocked, unreachable, entrance/exit, duplicate, out-of-grid, or missing-map positions move to the nearest free reachable tile in their map (Manhattan distance; ties by row, then column). If that map is full or missing, the start map and remaining maps are used. Each tile holds one challenge; there is no fixed number of predefined placement slots.

If every map is full, the import pauses before changing data or storing assets. The admin sees the excluded question names and IDs and can cancel to choose a larger theme/reduce the content, or explicitly import only what fits. Keep the source ZIP or export current content before excluding questions. Import reports show relocated coordinates and excluded IDs. Accounts, teams, historical points, and written responses remain saved. Theme-only relocation updates the challenge catalog atomically with the theme; stale approvals are rejected.

### Edit artwork and ground in the challenge studio

Under **Map**, open **Map artwork & reachable ground**. Upload a PNG, JPEG, WebP, or GIF up to 4 MB; the artwork stretches over the 40 × 28 tile grid. Select **Paint walkable**, **Paint blocked**, or **Set spawn**, then click or drag. Tile X/Y and **Apply tool at tile** provide an alternative to painting. Fill/block controls are local edits until **Save map**. Map boundaries can also be adjusted.

Green tiles are reachable from the yellow spawn. In the painter, amber tiles are painted walkable but disconnected (portal tiles also have a cyan outline); gray tiles are blocked. The placement preview grays out all locations that cannot hold challenges. Cyan outlines mark portals. Artwork and portals stay in place; saves reject blocked spawns or unreachable door/exit approaches. Questions displaced by terrain changes move automatically; if no space remains, the admin chooses whether to cancel or exclude extras. Map artwork and painted ground belong to the theme and travel with theme export/import and full backups. Keep the total theme assets within the 8 MB pack limit.

The YAML/JSON map field `ground` is an optional list of `[x, y]` walkable tiles (maximum 1,120). Omitted or `null` uses the existing bounds/obstacle rules. A list defines walking directly within the map bounds, overriding legacy obstacle and building collision tiles. Portals retain their destinations, and challenge placement still excludes portal tiles. The painter replaces the selected map's obstacle rectangles with this tile list. Other maps keep their existing layout.

**Location label** describes a challenge to students; changing it does not move the challenge. The selected map and X/Y coordinates set its actual position.

**Reset** discards unsaved artwork, ground, boundary, name, and spawn edits, returning to the last saved map. **Undo last save** restores the map from before the latest successful save made on the current page, including its prior artwork and collision settings. Undo is available until the page is reloaded or a different map is selected; exports/full backups preserve longer-term copies. Restoring a map rechecks challenge placement and keeps historical points and responses.

Painting fills skipped pointer positions with a continuous, connected stroke. Walkable floor needs a path to spawn to be reachable; paint that connection when an isolated tile turns amber. Tiles outside the boundary cannot be painted until the boundary is expanded.
