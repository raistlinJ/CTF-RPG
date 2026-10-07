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

In **Manage → Challenges → Map artwork & reachable ground → Transport**, the list includes predefined theme entrances and exits as well as added transports. Each predefined entry is labeled **Theme predefined**, and all transport tiles have purple arrows in the map preview.

Click **Edit** (or click an existing transport tile), change **Destination map**, or click a free reachable tile to move the selected transport. Use **Add new transport** to leave editing mode. A moved entrance keeps its interior link, with the matching exit returning to the tile below the new entrance. Changing a predefined destination sends the player to that destination's spawn; edit the exit separately if you want a different return route. Keep the arrival tile reachable.

**Undo transport edit** reverses unsaved transport operations. **Reset to theme** restores a predefined entrance or exit's original location and destination; save the map to persist the reset. The footer's **Reset** discards all unsaved map edits, and **Undo last save** restores the prior saved map and its transports while the editor remains open. Invalid tiles, overlapping links, and challenges on transport tiles prevent saving.

Theme packs and full backups retain edits through `world.portalOverrides`, while original `world.buildings[].door` and `world.maps[].exit` locations remain available for reset. IDs are `entrance-<building-id>` and `exit-<building-id>`, with each override containing `id`, `location: { x, y }`, and `to: <map-id>`. An empty override list restores all original theme entrances and exits. Existing theme packs continue to work unchanged.
