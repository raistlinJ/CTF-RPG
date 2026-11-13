# Doom’s Winter Dominion

A Doctor Doom × Christmas holiday capture-the-flag theme for CTF-RPG. In snowbound Latveria, Doom has seized the Holiday Star and diverted the sleigh network into his gift foundry. Marvel heroes follow the evidence through seventeen locations to restore it and negotiate a holiday truce.

Open **Manage → Theme → Theme library → Doom’s Winter Dominion**. **Use this theme** changes the world and artwork; **Load demo adventure** imports the matching world and 15 practice challenges together after the existing confirmation. Loading the adventure replaces the active challenge collection. Your current theme is not changed simply by adding this pack to the library.

## Cast and locations

The original cast contains 15 distinct character appearances: Doctor Doom, Winter Courier, Winter Guard Captain, Thor, Aurora Engineer, Lantern Warden, Ribbon Weaver, Doctor Strange, Radio Archivist, Snowglobe Keeper, Hearth Tender, Gift Hauler, Squirrel Girl, Santa Claus, and a Holiday Doombot. Twelve original adventurers are selectable player appearances and also populate the world as NPEs. The supporting cast mixes the successfully generated Marvel characters with nine original Latverian holiday characters; several other requested character illustrations were rejected by the image tool and are not presented as available artwork. Doom, Santa, and the Doombot are NPE appearances. Doom’s artwork is available as the final boss. The reserved administrator appearance uses the application’s original Overseer artwork. In the paired adventure he appears as the boss encounter; the reusable world includes his dialogue NPE. Player accounts keep their existing `web`, `thunder`, and `shield` IDs for Winter Courier, Thor, and Winter Guard Captain.

| Map | Location | Role |
| --- | --- | --- |
| `town` | Doomstadt Winter Square | Arrival, mission briefing, parcel manifest, acorn audit, hidden gift |
| `toy-workshop` | Doombot Gift Foundry | Base64 terminal and binary parcel sentry |
| `post-office` | Sleigh Signal Relay | Captured dispatch headers and mirrored memo |
| `cocoa-cottage` | Snowglobe Sanctum | Caesar shift, encoded ornament, Secret Santa |
| `elf-house` | Aurora Reactor Vault | Power budget and RGB sentinel |
| `castle` | Castle Doom: The Holiday Throne | Final decree and 3×3 Doom encounter |
| `bakery` | The Holiday Truce Hall | Restored Holiday Star and instructor-reviewed debrief |
| `latverian-offices` | Latverian Office Wing | Executive office, records room, staff workroom, conference room |
| `orbital-station` | Orbital Gift Station | Command bridge, observation room, cargo bay, reactor room |
| `castle-corridors` | Castle Doom: The Secret Galleries | Library, armory, treasury, feast chamber, antechamber |
| `royal-archives` | Castle Doom: The Royal Archives | Book-stack galleries, reading alcoves, offset loops |
| `parcel-depot` | Doomstadt Parcel Depot | Sorting aisles, loading booths, conveyor bays |
| `service-tunnels` | Latverian Service Tunnels | Zigzag passages, utility alcoves, eastern bypass |
| `frozen-canals` | Doomstadt Frozen Canals | Towpaths, footbridges, water barriers |
| `winter-hedge-maze` | Doom’s Winter Hedge Maze | Snow paths, switchbacks, side loops and dead ends |
| `orbital-labs` | Doom’s Orbital Research Labs | Pressurized corridors, sealed machinery bays, labs |
| `mountain-observatory` | Latverian Mountain Observatory | Telescope rooms, enclosed galleries, glass skywalks |

The expansion adds **five Marvel heroes**—Beta Ray Bill, Rocket Raccoon, Moon Knight, Hercules, and Silver Surfer—and **five Marvel villains**—Green Goblin, Dormammu, Ultron, Doctor Octopus, and Taskmaster. All ten have holiday artwork and dialogue NPEs; the five heroes are also selectable player appearances. The combined pack has **25 appearances, 17 player choices, and seventeen maps**.

Every map has its own generated background. All maps use a 40×28 logical grid. The original seven use open floors with perimeter decorations. The ten expansion maps use a cutaway perspective with wall fronts, arches, and connected corridors; their explicit walkable tiles enforce walls and solid furniture. You can move left and right along galleries and enter or leave side rooms through their doorways. Seven glowing transport tiles in the square lead to the original rooms and the office wing. After entering a room, step off its arrival tile, then return to that tile to travel back. The reusable world has no key locks; the paired adventure adds the red vault lock and gold throne lock.

Enter the office wing from Doomstadt **(3,13)**. Its northern lift at **(20,3)** reaches the orbital station; the station’s northern airlock at **(20,3)** reaches the castle galleries. Step off and return to each arrival tile **(20,23)** to retrace the exact route. These exploration areas are optional in the existing 15-challenge adventure and ready for additional administrator-authored challenges. Their floor-plan references are saved in `layout-references/`; collision rectangles and cast placement are authored in `scripts/doom-holiday-expansion-layouts.mjs`.

## Additional path routes

All seven additional maps are optional exploration areas with space for administrator-authored challenges. Each uses its own painted background, floor mask, and solid barriers.

| Start | Door tile | Destination |
| --- | --- | --- |
| Castle secret galleries | (20,4) | Royal Archives |
| Royal Archives | (35,5) | Winter Hedge Maze |
| Latverian offices | (3,12) | Parcel Depot |
| Parcel Depot | (35,5) | Service Tunnels |
| Service Tunnels | (5,5) | Frozen Canals |
| Orbital station | (16,12) | Orbital Research Labs |
| Orbital Research Labs | (35,5) | Mountain Observatory |

Step off the arrival tile and return to it to travel back. The Service Tunnels and Orbital Research Labs arrive at (20,22); the other five additions arrive at (20,23). `scripts/doom-holiday-path-maps.mjs` authors these maps and links; their initial floor-plan references are in `layout-references/` and their final generation prompts are in `ART_PROMPTS.json`.

## Adventure route

1. Talk to Winter Guard Captain at Doomstadt (25,19) and choose **What should I investigate?** The briefing reveals challenge 01 at (18,20).
2. Decode the winter signal; inspect the parcel manifest in the square. The Gift Foundry and Sleigh Relay investigations become available.
3. Recover the gift terminal’s red key. The red key unlocks the **Aurora Reactor Vault** transport at Doomstadt (34,12).
4. Read the relay response header and mirrored memo. Visit the Snowglobe Sanctum for the Caesar-shift and URL-encoding puzzles.
5. Ask Squirrel Girl about the hidden gift. Stand on Doomstadt’s exact tile **(15,21)** and **Search**. Wave **👋** at the invisible gift to reveal the Secret Santa challenge in the Sanctum at (12,18). It has no visible map marker and does not block movement. This discovery is personal, so each teammate who needs its challenge must find and wave at the gift.
6. Restore the reactor power budget to earn the gold key. Solve the 2×2 Aurora Sentinel. The gold key unlocks Castle Doom’s northern transport at (20,4).
7. The 3×3 Doom encounter requires the sentinel, parcel sentry, mirrored memo, and Secret Santa. Reassemble Doom’s final decree, then restore Santa’s final dispatch in the Truce Hall.
8. Submit the short written debrief. The instructor grades it through **Challenges → Review answers**. Squirrel Girl’s acorn audit is an optional side quest; its answer-reveal hint forfeits only its optional orange key.

The challenges use static local evidence files and introductory encodings. No live target, network scanning, or exploitation is required. All sample flags are public in source; replace flags, challenge text, files, and challenge IDs before using them as a graded holiday event. Reusing IDs preserves prior completion history.

## Portable files

- `theme-packs/doom-holiday.zip`: reusable artwork, world, appearances, dialogue, hidden gift, original music, and sound effects.
- `theme-packs/doom-holiday-demo-theme.zip`: matching world with key locks and the adventure’s hidden-gift reply.
- `theme-packs/doom-holiday-demo-content.zip`: 15 challenges, accepted flags, hints, rewards, and six downloadable evidence files.

For a manual import, select the demo theme ZIP and its **Matching content ZIP** together. Neither pack contains accounts, credentials, or student progress. Full backups preserve the active imported theme and its progression using the game’s existing backup format.

## Artwork, music, and authoring

Character sprites and seventeen map paintings are generated with the built-in image tool; the exact prompts and source paths are recorded in [ART_PROMPTS.json](ART_PROMPTS.json). Optimized WebP copies live under `public/themes/doom-holiday/`. These are newly generated fan-theme illustrations, not extracted film stills or game assets.

Three original MIDI loops—**Winter Dominion**, **Iron and Mistletoe**, and **The Holiday Truce**—combine celesta, strings, and bass. The theme includes distinct short event cues and follows the existing mute/volume controls. It uses no film score or existing holiday recording.

`node scripts/generate-doom-holiday-theme.mjs` rebuilds the authored manifests, challenge YAML, and evidence files. `node scripts/generate-doom-holiday-audio.mjs` rebuilds music and WAV effects. These generators overwrite their authored outputs; do not run them after hand-editing those files unless you update the generator as well. `npm run themes:build` validates and rebuilds all portable packs and generated runtime challenge JSON.
