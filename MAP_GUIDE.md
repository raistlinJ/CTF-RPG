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

Clicking the map opens the matching **Ground** or **Transport** section and selects the item there. Clicking a non-player entity opens its separate Theme page. Empty tiles open **Ground** without changing the map. Choose a ground tool to paint or set a location; **New transport** arms placement of a new link. Press Escape to leave an active tool.

In **Manage → Theme → Maps & transport → Transport**, rows below the map list predefined theme entrances and exits as well as added transports. The **New transport** button sits above the destination and lock controls. Each predefined entry is labeled **Theme predefined**, and all transport tiles have purple arrows in the map preview.

Click **Edit** (or click an existing transport tile) to select it and change **Destination map**. Drag the transport to a free reachable tile to move it. Press Escape to cancel a drag. Use **New transport** to leave editing mode. A moved entrance keeps its interior link, with the matching exit returning to the tile below the new entrance. Changing a predefined destination sends the player to that destination's spawn; edit the exit separately if you want a different return route. Keep the arrival tile reachable.

**Undo transport edit** reverses unsaved transport operations. **Reset to theme** restores a predefined entrance or exit's original location and destination; save the map to persist the reset. The footer's **Reset** discards all unsaved map edits, and **Undo last save** restores the prior saved map and its transports while the editor remains open. Invalid tiles, overlapping links, and challenges on transport tiles prevent saving.

Theme packs and full backups retain edits through `world.portalOverrides`, while original `world.buildings[].door` and `world.maps[].exit` locations remain available for reset. IDs are `entrance-<building-id>` and `exit-<building-id>`, with each override containing `id`, `location: { x, y }`, and `to: <map-id>`. An empty override list restores all original theme entrances and exits. Existing theme packs continue to work unchanged.

## Locked transports

Doors and transport tiles can require a colored key or an incantation. Configure the requirement in the admin map editor’s **Transport** section. Locked routes show a colored lock on the game map and prompt when approached. Each player retains their earned keys, learned phrases, and unlocked routes across logins. Use **Inventory rewards** in the challenge editor to award the needed items. See [the admin guide](ADMIN_GUIDE.md#locked-doors-portals-and-inventory).

## Non-player entities and dialogue

Open **Theme → Maps, entities & transport → Non-player entities**, select a map, and click **Add character**. Enter its name, choose an appearance from your theme’s characters, and click a free map tile to place it. Non-walkable tiles are allowed; characters still need separate locations away from challenges, doors and transport. Keep a walkable tile beside the character so players can speak with it. Drag a character on the map to move it. Press Escape to cancel a drag. Coordinates can also be entered directly. Click **Save entities** before opening the dialogue graph.

Open **Edit dialogue graph** on the character. Each card is a dialogue screen; each labeled arrow is a player choice leading to its response. Use **Add dialogue** in the graph toolbar or right-click empty canvas and choose **New dialogue** to create a screen. Double-click a card, or right-click it and choose **Edit dialogue**, to view and edit its text in the same popup. Right-click a card and choose **Set as first dialogue** to change the opening screen. Drag the background or scroll to pan; hold Ctrl/Command while scrolling to zoom at the pointer. The zoom buttons, Fit graph, Arrange graph, and keyboard shortcuts match the challenge dependency canvas. Each card has controls to add a choice or remove the screen, and each choice line has a remove control. Drag a card’s right handle onto another card’s left handle, then enter the text the player will select in the popup. You can also click the two handles in sequence. Double-click a choice connection, or right-click it and choose **Edit connection**, to change its text or **Respond with** target. A screen without choices ends the conversation. Choices can return to an earlier screen. Change the first dialogue and remove incoming choices before deleting a linked screen.

Choose **Conversation replay** above the graph: **Can be restarted** lets players explore branches again, while **One-time** remembers the last dialogue they saw. On a later interaction, a one-time conversation shows that dialogue without choices and ends. **Preview conversation** lets you try branches before saving. Click **Save dialogue** to publish the conversation; **Reset** discards unsaved dialogue edits. Dialogue saves preserve map geometry, transports and challenge placements. Definitions travel with theme packs and full backups.

Players see characters with speech bubbles. Within one tile horizontally or vertically, **Search nearby** opens the conversation or a chooser when characters and challenges are both nearby. Replies can be clicked or entered by their displayed number or exact text; matching ignores case and extra spaces. Only the current dialogue and its choices are sent to the player. Restartable conversations offer **Restart conversation** and start again when reopened. Characters provide dialogue without spending or awarding inventory/points. Limits: 100 characters per world, 50 dialogue screens per character, 10 choices per screen, 5,000 characters of dialogue text and 120 characters per choice label.

To control when characters appear, open **Challenges → Dependencies**. Connected characters appear automatically; use **Add non-player entity** below the connection selectors or right-click empty canvas to add an existing character from Theme. Create and edit characters in Theme. Connect **challenge → entity** to reveal the character after solving the challenge, then **entity → challenge** to reveal the next challenge. For an entity connection, choose **Any dialogue** to unlock on first contact or select a final dialogue to unlock only when that ending is reached. Double-click or right-click an entity connection to change its output. Click **Save dependencies** to apply the graph. Every incoming prerequisite is required, and unlocks follow each player's own progress.

A successful nearby conversation activates that character once, as soon as its first dialogue opens. Reaching a final dialogue records that output for the player. Both milestones survive reloads and logins; repeating a conversation does not erase them. Admin preview conversations do not advance player progress. **Delete** in Dependencies removes the character and all its connections; **Undo change** restores the draft until saved. If a character is still referenced by the graph, delete it through Dependencies before removing it from a theme/map configuration. See [the dependency guide](ADMIN_GUIDE.md#challenge-dependencies).
