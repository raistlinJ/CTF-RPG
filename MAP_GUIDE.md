# Town and interiors

The snowy town is a 40 × 28 tile map, with Santa’s Christmas castle at its northern end, a decorated town square, five other buildings, and a frozen lake. Use arrow keys, WASD, or the mobile direction buttons to move.

Walk onto a building's lit doorway to enter. Each building has its own furnished interior. Walk onto the southern exit tile to return to the tile just outside its door. Doors work automatically; E remains the search/interact key. Santa lives near the throne at (20,8) in the castle; search beside him for a greeting.

| Map ID | Building | Door in town | Indoor spawn | Indoor exit |
| --- | --- | --- | --- | --- |
| `town` | Snowy town | — | (18,20) | — |
| `castle` | Santa’s Christmas Castle | (20,6) | (20,23) | (20,25) |
| `toy-workshop` | Toy Workshop | (10,15) | (20,22) | (20,24) |
| `cocoa-cottage` | Cocoa Cottage | (27,14) | (20,22) | (20,24) |
| `post-office` | North Pole Post Office | (4,20) | (20,22) | (20,24) |
| `elf-house` | Evergreen Elf House | (11,4) | (20,22) | (20,24) |
| `bakery` | Gingerbread Bakery | (33,13) | (20,22) | (20,24) |

Map changes and movement are session-local; reloading starts you back in town. Account, hero, scores, and purchased hints persist as before. Every building has a walkable route from its spawn to its exit. Furniture, building walls, the town's Christmas tree, and the frozen lake block movement.

## Put a challenge inside a building

Challenge YAML now has an optional `map` field. It defaults to `town`, so existing YAML keeps working. Coordinates are local to the named map, measured from the top left. Treasures only render and can be discovered in their own map. Different maps can use the same coordinates; duplicate coordinates within one map are rejected.

```yaml
challenges:
  - id: castle-star
    map: castle
    object: Christmas star
    location: { x: 20, y: 10 }
    region: Santa’s Christmas Castle
    text: "What planet is known as the Red Planet?"
    flags: ["mars"]
    points: 200
```

The included Secret Present has moved into the castle without changing its ID or saved completion records. The Toy Workshop and Bakery also contain sample treasures. Keep challenge IDs globally unique across maps. Hints, scoring, downloadable files, and flag rules work the same indoors; see [CHALLENGES.md](CHALLENGES.md).

## Safe placements

Cottage floors cover x 10–29, y 6–24; castle floors cover x 6–33, y 4–25. Furniture occupies some tiles. Suggested placements include:

| Map | Suggested treasure coordinates |
| --- | --- |
| `castle` | (20,10), (16,18), (24,20) |
| `toy-workshop` | (15,15), (20,13) |
| `cocoa-cottage` | (20,11), (14,20) |
| `post-office` | (20,12), (20,19) |
| `elf-house` | (20,13), (25,20) |
| `bakery` | (20,12), (14,20) |

Town examples (8,8), (11,19), (29,8), and (32,20) remain reachable. Avoid doors and exits for treasures; use accessible floor or a point within two walkable tiles. The player's current coordinates appear in the map's bottom-left corner. Labels and the journal are clues, not separate map IDs.

`lib/world-data.mjs` owns map IDs, building footprints, door locations, furniture collision rectangles, and movement transitions. `lib/interior-renderer.ts` renders the rooms. `tests/world.test.mjs` checks door reachability, safe entry/exit, and every included YAML treasure. Restart your Node server after YAML changes; rebuild the frontend to change buildings, graphics, or collision rules. Hosted Sites changes require publication.

## Edit theme transports

In **Manage → Theme → Maps & transport → Transport**, the list includes predefined theme entrances and exits as well as added transports. Each predefined entry is labeled **Theme predefined**, and all transport tiles have purple arrows in the map preview.

Click **Edit** (or click an existing transport tile), change **Destination map**, or click a free reachable tile to move the selected transport. Use **Add new transport** to leave editing mode. A moved entrance keeps its interior link, with the matching exit returning to the tile below the new entrance. Changing a predefined destination sends the player to that destination's spawn; edit the exit separately if you want a different return route. Keep the arrival tile reachable.

**Undo transport edit** reverses unsaved transport operations. **Reset to theme** restores a predefined entrance or exit's original location and destination; save the map to persist the reset. The footer's **Reset** discards all unsaved map edits, and **Undo last save** restores the prior saved map and its transports while the editor remains open. Invalid tiles, overlapping links, and challenges on transport tiles prevent saving.

Theme packs and full backups retain edits through `world.portalOverrides`, while original `world.buildings[].door` and `world.maps[].exit` locations remain available for reset. IDs are `entrance-<building-id>` and `exit-<building-id>`, with each override containing `id`, `location: { x, y }`, and `to: <map-id>`. An empty override list restores all original theme entrances and exits. Existing theme packs continue to work unchanged.

## Locked transports

Doors and transport tiles can require a colored key or an incantation. Configure the requirement in the admin map editor’s **Transport** section. Locked routes show a colored lock on the game map and prompt when approached. Each player retains their earned keys, learned phrases, and unlocked routes across logins. Use **Inventory rewards** in the challenge editor to award the needed items. See [the admin guide](ADMIN_GUIDE.md#locked-doors-portals-and-inventory).

## Non-player entities and dialogue

Open **Theme → Maps & transport → Non-Player Entities**, beside **Ground**. Click **Add character**, enter its name, choose an appearance from your theme’s characters, and click a reachable tile to place it. Characters need separate locations away from challenges, doors and transport. Select a character in the list or on the map to edit or move it; coordinates can also be entered directly.

Write its greeting in **What this character says**. Use **Add dialogue** for each response, then select the greeting in **Dialogue to edit**. Under **Player choices**, add a choice label and choose the dialogue under **Respond with**. Repeat for other branches. **First dialogue** controls the opening screen; a screen without choices ends the conversation. Choices can return to an earlier screen. Change the first dialogue and remove incoming choices before deleting a linked screen.

**Preview conversation** lets you try branches before saving. Click **Save map** to publish the character and dialogue; **Reset** discards unsaved edits and **Undo last save** restores the preceding map/characters. A character-only save preserves map geometry, transports and challenge placements. Definitions travel with theme packs and full backups.

Players see characters with speech bubbles. Within two tiles, **Search nearby** opens the conversation or a chooser when characters and challenges are both nearby. Replies can be clicked or entered by their displayed number or exact text; matching ignores case and extra spaces. Only the current dialogue and its choices are sent to the player. **Restart conversation** returns to the opening; searching again starts a new conversation. Characters provide dialogue without spending or awarding inventory/points. Limits: 100 characters per world, 50 dialogue screens per character, 10 choices per screen, 5,000 characters of dialogue text and 120 characters per choice label.

To control when characters appear, open **Challenges → Dependencies**. Existing characters appear automatically; **Add non-player entity** also lets you create one there. Connect **challenge → entity** to reveal the character after solving the challenge, then **entity → challenge** to reveal the next challenge after speaking to the character. Click **Save dependencies** to apply the graph. Every incoming prerequisite is required, and unlocks follow each player's own progress.

A successful nearby conversation activates that character once, as soon as its first dialogue opens. Activation survives reloads and logins; restarting or replaying the conversation does not reset it. Admin preview conversations do not activate characters. **Delete** in Dependencies removes the character and all its connections; **Undo change** restores the draft until saved. If a character is still referenced by the graph, delete it through Dependencies before removing it from a theme/map configuration. See [the dependency guide](ADMIN_GUIDE.md#challenge-dependencies).
