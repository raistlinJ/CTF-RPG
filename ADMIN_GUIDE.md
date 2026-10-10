# Challenge management

Open `/admin` (or **Manage challenges** in the game's header when authorized). The editor shows the entire town or selected interior, with a tile grid, saved discoveries, and a challenge form. It uses the same map geometry as the game.

## Admin access

### Your own server

Add a YAML-managed account with `role: admin` in `content/game.yaml` or your private `GAME_CONFIG` file, then restart the server:

```yaml
accounts:
  allowRegistration: false
  users:
    - username: teacher01
      password: replace-with-a-unique-password
      role: admin
      hero: shield
    - username: student01
      password: use-a-different-password
      role: student
```

Keep your existing character, audio, and other configuration. Student is the default role. Admin accounts are explicitly designated in server-side YAML or created/promoted through authenticated user management; registering a student account cannot grant admin privileges. Admin sign-in uses the same salted password hashes and server sessions as the game. For unmanaged YAML accounts, removing `role: admin` revokes management access on subsequent API requests. Studio-managed roles take precedence; use the Users screen to change them.

The standalone server never uses incoming platform identity headers to grant admin access. Keep the account YAML private, as described in [SELF_HOSTING.md](SELF_HOSTING.md).

### Hosted Sites version

Your private site's owner email is configured in `admin.platformEmails`. The hosted server checks the trusted Sites-authenticated email against this allowlist, so the owner can open the studio without creating another password. Other authorized visitors still need a YAML-admin account or an explicitly allowed platform email. The list is server-only; it is not included in `/api/config`. This platform allowlist has no effect on your standalone Node server.

## Create and edit discoveries

1. Select the town, castle, or a house from **Map**.
2. Click reachable ground or floor. The highlighted tile and coordinates identify the location. You can also focus the map and use arrow keys, or type X/Y coordinates.
3. Give the discovery a name and location clue. Add challenge text, points, and accepted flags (one per line).
4. Choose whether flags are case-sensitive. Under **Hints & files**, add hints with a **Point cost**, selected **Rewards to forfeit** from this challenge, or both. Use **Configure challenge rewards** to add available keys and incantations on the Rewards tab. A zero-point hint with no selected rewards is free. Add downloadable file links here too.
5. Optionally add a **Discovery video** or **Solve video** under **Cutscenes**, using a direct video URL or an MP4/WebM upload up to 4 MB. Preview or remove either video independently.
6. Optionally select colored keys and enter incantations under **Rewards → Inventory rewards**.
7. Click **Save challenge**.

Gold sparkles and the saved-discoveries list identify existing challenges. Click once to select one, then drag it onto valid, unoccupied ground on the current map. The destination shows green when available and red when invalid; invalid drops leave the challenge in place. Escape cancels a drag. **Move to…** below the map lists other maps; choosing one moves the selected challenge to the nearest available tile and opens that map. Maps without room are disabled. Both moves save the location immediately, preserve the challenge ID and student progress, and retain other unsaved draft edits. Clicking clear ground, using arrow keys, or typing X/Y coordinates selects a draft location that is saved with **Save challenge**. **New challenge** starts a separate discovery. The top **Map** selector starts a new draft on that map; unsaved content prompts before being discarded.

The editor rejects walls, water, furniture, doorways, exits, and unreachable tiles. It also rejects duplicate coordinates within a map, duplicate references, invalid file URLs, excessive hint costs, and invalid flags. There can be at most 100 challenges; accepted flags are limited to 100 per challenge. The whole saved set is limited to 1.5 MB.

Save makes the definition available through the game API immediately. Students see updates when they reload the expedition, return focus to the game tab, or refresh their game state through a challenge action. Already earned scores are preserved. Existing challenges keep their IDs automatically, so edits cannot award another completion for the same object. Existing purchased hint costs also remain unchanged. Challenge downloads use file links; cutscenes support video uploads as well as links. Place local assets in `public/downloads/` or use an external HTTPS URL.

## Persistence, YAML, and backups

`content/challenges.yaml` supplies the starting set. Before any admin save, restarting with an edited YAML file changes that starting set as before. **After the first admin save, the database-backed set becomes authoritative**, including across restarts and hosted publications. Editing the baseline YAML alone no longer replaces the saved admin set.

Use **Export YAML** to download the current complete definitions, including accepted flags and hint text. Export is admin-only; treat the file as teacher material and keep it out of `public/`. It uses the same format documented in [CHALLENGES.md](CHALLENGES.md), so it can be used as the starting YAML for a fresh installation. Existing installations keep their saved database set; copying an export into the baseline does not overwrite that database.

Challenge edits, student progress, and hint purchases live in the same persistent SQLite/D1 database. Include the database in your backups. Self-hosting adds `challenge_catalog` automatically on startup. The Cloudflare preview needs `drizzle/0002_melodic_stephen_strange.sql` applied once; hosted publication applies that migration automatically. See [SELF_HOSTING.md](SELF_HOSTING.md) for restart and backup instructions.

Concurrent admin saves use a revision check. If another admin saves first, your draft is preserved and the request is rejected with a clear message. **Reload saved version** loads the current definition before you reapply changes; it asks before discarding your unsaved draft. The studio creates and edits challenges without deleting student progress or uploading file contents. **Users** opens user management; **Full backup** exports the complete recreation package. See [BACKUPS.md](BACKUPS.md).

## Admin navigation

Every admin page shows the same primary links: **Challenges**, **Review answers**, **Theme**, **Teams**, **Users**, **Notifications**, **Scores**, and **Game**. **Challenges** has Manage challenges, Submissions, Dependencies, and Import CTFd. **Theme** has Maps & transport, Theme library, Audio, and Import / Export. **Teams** has Manage teams, Team size, Players & messages, and Scoreboard. Each subpage has its own address and highlights the active section.

The discovery editor uses **Challenge**, **Rewards**, **Cutscenes**, and **Hints & files** tabs. Switching tabs retains the current draft; **Save challenge** saves every section together. Missing required fields open the relevant tab. Navigate to **Theme → Maps & transport** to edit artwork, ground and transport. Unsaved challenge and map changes trigger a navigation warning.

## Teams

Students create a team with a name and password, or join an existing team after signing in. Team passwords have 8–128 characters and are stored as salted hashes. Team names are unique ignoring case. Membership persists across logins; students cannot leave or switch teams. Only admins may disband a team, which releases its members to choose again without changing individual scores.

Admins use **Manage** in the game header. **Teams → Team size** (`/admin/teams/configuration`) sets the team limit. **Players & messages** (`/admin/teams/players`) controls player visibility and team messaging; **Scoreboard** (`/admin/teams/scoreboard`) controls ranking access and defaults. **Teams → Manage teams** (`/admin/teams`) shows teams, point gifts, and disband controls. Set the maximum team size from 1–100 (default 4, initially configured by `teams.maxMembers` in `content/game.yaml`). The creator and disabled members count toward capacity. Lowering the limit retains existing members but prevents joins to full teams. All management pages enforce admin authorization.

Use **Gift points** on a team to award 1–10,000 whole points with a required comment. Gifts count once toward the team total and remain separate from individual earned points. Members see **+N pts added** on the game screen; hover, focus, or tap to read the comment. Manage shows gift history. Full backups preserve gifts and comments. Disbanding a team removes its gifts; members retain individual progress.

Full backups include teams, team password hashes, memberships, and the saved size limit. Older backups without teams still restore successfully.

## Theme and content packs

Administrators can use **Manage → Theme → Import / Export** (`/admin/theme/import-export`) to export/import reusable themes separately from challenge content. Themes own map artwork/layout, entrances, characters/sprites, and MIDI; content owns challenge text/flags/points/hints/locations/downloads. Neither includes accounts or progress. Full backup still includes the complete system, including imported assets and the active theme. See [THEMES.md](THEMES.md) for formats, limits, authoring, and paired imports. Self-hosters must preserve `data/pack-assets` together with their SQLite database (the Docker data volume already covers it).

## Automatic and manual grading

Every challenge supports `grading: automatic` (the default) or `grading: manual`, selected with **Answer checking** in the challenge editor. Automatic challenges require accepted flags. Manual challenges accept a written response of up to 20,000 characters and do not require flags. Responses are private to the student and admins, can be updated until graded, and freeze new hint purchases once submitted.

Admins use `/admin/review` (**Manage → Review answers**) to award a whole-number grade from 0 to the submission's saved maximum and provide feedback. Recorded hint costs are subtracted, with a minimum final award of 0. Regrading updates the existing award and scoreboard. Response revisions prevent stale edits or grades from overwriting newer work. Full backups retain responses/grades/feedback; theme and content packs exclude them. Use new IDs for new tests; grading mode cannot be changed after responses or awards exist.

The built-in **Agentic Circuit** theme is available under **Theme → Theme library**. See [the course theme guide](themes/agentic-circuit/README.md) for activation, maps, and test preparation.

## Starting positions and live players

Use **Manage → Users**, select an explorer, choose **Starting map**, and click reachable ground in the map preview. **Use this map’s spawn** chooses its normal arrival tile; **Theme default** clears the account-specific assignment. Save the account. This starting position applies at sign-in and reload; students cannot choose or override it. Gray tiles are unavailable. New or incompatible theme layouts safely use the main map’s default spawn until you update the assignment. YAML accounts can set `spawn: { map: castle, location: { x: 20, y: 23 } }`; studio edits take priority.

**Manage → Teams → Players & messages → Players visible on the map** offers **Teammates only** (default), **All players**, or **Off**. With visibility enabled, students also see instructors on their map; administrators see active students so they can moderate them. Live explorers appear with their assigned sprites and usernames on the same map; teammate labels use green. Players do not block one another or reveal challenge answers. Visibility is enforced by the server. Each visible game tab exchanges positions every three seconds. Hidden tabs pause, stationary positions refresh less often, and disconnected players disappear within 20 seconds. The response is capped at 100 other players per map. This is a shared exploration view, not synchronized combat.

Standalone YAML can set `presence: { visibility: team }` (`team`, `all`, or `off`). Once an admin saves visibility, the database setting takes priority. Full backups retain assigned starts and visibility; theme/content packs exclude these account/classroom settings, and temporary live positions are never exported.

## Team cards and messages

Click **Teams** in the game header or your team banner to open a team card. Clicking an avatar opens player cards with each username, permitted team name and score, and a **Send message to team** button when messaging is enabled. Clicking a shared tile lists every visible player there, including yourself, in a scrollable popup. Cards refresh as players move and respect the separate own-team and other-team admin controls. Administrators use a distinct purple game-master avatar across themes; it is not selectable by student accounts. Cards show member count and, when enabled, the name and aggregate score. Scores sum the earned net points of active student members plus team point gifts; administrator and disabled accounts do not contribute earned points. **Manage → Teams** also opens cards by clicking team names.

Use **Send message** to contact the selected team. Conversations are visible to all members of the sending and receiving teams; unrelated teams cannot read them. **Your team → Team inbox** collects messages, with **Reply to…** opening the sending team’s conversation. A dot next to **Teams** indicates incoming messages until the inbox is opened. Admins can send instructor messages from management and view conversations for the selected team. Messages are plain text (1–1000 characters), with at most five sends per explorer per minute and the latest 100 messages displayed. Retrying a send preserves its reference to avoid duplicate delivery.

Under **Manage → Teams → Team cards & messages**, **Your team** controls the name, score, and messages within each student’s team. **Other teams · All players** independently controls other teams’ names, scores, and messages between teams. These apply to the team list and to cards opened by clicking another team’s player in **All players** mode. You can show everyone’s sprites while allowing only internal team conversations, or enable other-team details while hiding your own team’s score.

Hidden names use `Team #…` references, including team-selection lists. Disabled scores are omitted from the corresponding student team APIs. These controls concern team cards; individual scores and player usernames retain their existing behavior. Turning off a messaging scope hides its history and blocks sending in that scope; stored messages return when it is enabled again. The team inbox only shows permitted internal or external conversations, and notifications follow the same rules. Instructor notes follow the within-team messaging setting. Open cards refresh every five seconds while visible; notifications use existing position updates, including when player visibility is off.

For standalone configuration:

```yaml
teams:
  maxMembers: 4
  features:
    names: true
    scores: true
    messaging: true
    everyone:
      names: true
      scores: true
      messaging: false
```

Saved admin settings take priority over YAML. Older saved settings and YAML without `everyone` initially apply their existing switches to both scopes; saving the new controls makes the scopes independent. Full backups include these switches and private messages; theme/content packs exclude them. Disbanding a team removes conversations involving it and preserves account progress.

## Teammate halos and leading-team crowns

A green halo marks your explorer and visible teammates, distinguishing them from other players in **All players** mode. A gold crown appears above each visible avatar in the highest-scoring team, including your own explorer when applicable. Tied leading teams share the crown; no crowns appear while all teams have zero points. Rankings use the same earned net points, team gifts, and active-student rules as team cards, including players who are offline. They update with the existing three-second position refresh. Crowns follow the corresponding own-team or other-team score-visibility control, so a hidden team score also hides that team's crown.

## Instructor conversations and message badges

Students can click an administrator's avatar and **Message instructors**, or choose **Teams → Instructors**. This is a shared conversation between that student's team and all administrators. Other teams cannot read it. Administrators choose **Teams → Instructor inbox**, then **Reply to…** to answer a team; replies appear in the student's instructor conversation and team inbox. The **Your team → Messaging** control also governs instructor conversations. The five-message-per-minute limit is shared across team and instructor sends.

New incoming messages briefly show a number above your own avatar. The number counts newly received messages, excluding your own sends, and disappears five seconds after the latest arrival. Notifications use the existing three-second presence polling, including when player visibility is off. The badge represents recent arrivals, not an unread-message total.

## Chat moderation

An administrator can click a player avatar and choose **Mute user** or **Unmute user**. In **Manage → Users**, select the user, change **Mute chat**, and save. A mute blocks all outgoing team and instructor messages on the server, while leaving gameplay, incoming messages, and stored progress available. Changes use the account revision so a stale mute cannot overwrite another account edit. Mute status is retained in full backups.

## Challenge dependencies

Open **Challenges → Dependencies** (`/admin/challenges/dependencies`) to edit progression as a graph. Drag a challenge or entity’s right handle to another card’s left handle, or choose **Prerequisite** and **Unlocks** under the graph. The arrow points from the prerequisite to the challenge or entity it unlocks. Drag cards to rearrange them, pan the background, and use **Fit graph**, **Zoom in**, **Zoom out**, or **Arrange graph** to navigate. Fit centers all cards, including cards moved beyond the viewport. Zoom stays anchored on the current view; press the percentage button to return to 100%. Scroll or use a trackpad to pan; Ctrl/Command plus the wheel zooms at the pointer. With the graph focused, use +/− to zoom and Home to fit. Each challenge card’s info icon opens a summary with points, prerequisites, answer checking, and up to 400 characters of challenge text. Entity cards show their activation rule and opening dialogue. Select a connection and choose **Remove connection**, use Delete while its edge is focused, or remove it from the connection list. **Undo change** restores recent edits; **Save dependencies** applies connections to active games. Card positions are a viewing aid; saved connections determine progression.

A player must complete every incoming prerequisite before a challenge or entity appears on the map. Locked challenges cannot be discovered, answered, or have their hints purchased; locked entities cannot be spoken to. Unlocks follow each player’s progress. Written prerequisites unlock after grading. Already completed challenges remain available, and hidden challenges retain their visibility restrictions. Admins can preview every challenge and entity; preview conversations do not activate entities. Self-links, duplicate prerequisites, unknown IDs, and dependency loops are rejected. If another admin edits the catalog or graph, reload the saved graph before saving again.

Use **Add non-player entity** to place and configure a new character and its dialogue. Existing entities from Theme appear automatically as purple graph cards. **Edit** opens the character editor; **Delete** removes the character from the map and removes all its connections. Additions, edits, and deletions are drafts until **Save dependencies**; **Undo change** restores them before saving. The same characters remain editable in **Theme → Maps & Transport → Non-Player Entities**.

Connect **challenge → entity** to make the character appear after solving that challenge. Connect **entity → challenge** to make the challenge appear after the player speaks to the character. A successful nearby conversation activates the entity once for that player, even if the conversation has more choices. Activation persists across reloads and does not award points or inventory. Solved challenges and activated entities stay available if prerequisites are later changed. Mixed challenge/entity dependency loops are rejected.

YAML definitions use `dependsOn: [first-challenge-id, second-challenge-id]` for challenges or `dependsOn: ["npe:guide-id"]` for an entity prerequisite. Entity definitions also accept `dependsOn`, such as `[first-challenge-id]`; older definitions default to no prerequisites. The challenge editor displays prerequisites and preserves them when editing other fields. YAML exports, content packs, and full backups retain connections. Import previews include any dependents whose prerequisites cannot be placed, so the overflow decision covers the whole affected chain.

## Scoreboard controls and discovered questions

Under **Manage → Teams → Scoreboard**, choose **All signed-in players** or **Administrators only**, and the default admin score view. Players open **Scores** in a modal showing team names and totals. Admins can switch **User scores** / **Team scores** in the modal or `/scoreboard`; this toggle changes only their view. Private scoreboards deny students at the API and hide the Scores button. Team totals include earned net points from active student members plus team gifts; administrators and disabled accounts do not contribute earned points. Scoreboard access settings remain separate from team-card score switches; hidden team names continue to use team references. Full backups retain settings and gifts; theme/content packs exclude them.

The game journal shows only discovered, submitted, and solved questions, with a count such as **3 solved**. It does not show an undiscovered question list or a solved/total fraction. Opening a question saves its discovery for that account so it stays listed after reload or on another device. Solving and submitting remain separate actions.

### Challenge visibility
At the top right of Challenge studio, use **Challenge availability** to choose **All** or **Admins-only**. Changes save automatically. **All** lets students see challenges marked **Visible**; **Admins-only** hides all challenges from students. Each challenge also has a **Visible/Hidden** dropdown saved with its definition. Hidden challenges remain available to administrators for testing and editing. Visibility changes reach active games on the next three-second update; student requests for hidden questions, hints, and answers are rejected. Existing progress and scores are preserved.

Challenge YAML supports `visibility: visible` or `visibility: hidden` (defaults to `visible`). This field travels with content export/import. Full backups also preserve the global visibility setting; older backups default to All. Theme-only packs do not change challenge visibility.

### Theme pages and MIDI playlists
**Theme → Theme library** contains ready-made themes. **Theme → Import / Export** contains independent theme/content pack import and export controls. **Theme → Maps & transport** opens the map editor, including locked doors and portals. **Theme → Audio** lets administrators add multiple `.mid` or `.midi` files, preview and remove tracks, set volume, and choose whether the shuffled playlist repeats. Select your files and click **Upload & Save**. Reload the game to load the new playlist. Players still control sound with the game's sound/mute button. Each shuffle round plays every track once; when possible, the next round starts with a different track than the previous round ended with. Removing a track from the playlist does not delete an asset that another export or map may reference.

Audio is part of the theme: theme packs and full backups contain every playlist file. Content-only packs contain challenges and do not change audio. The existing `audio.midi` setting is supported for single-file configurations. Multiple tracks can be configured as:

```yaml
audio:
  playlist:
    - name: Campus music
      midi: /music/campus.mid
    - name: Lab music
      midi: /music/lab.midi
  loop: true
  volume: 0.15
```

Supply the MIDI files in the server's public directory when configuring paths in YAML. A nonempty playlist takes precedence over `audio.midi`. Uploads skip MIDI files whose contents are already in the retained playlist or the same batch, and report the skipped filenames. Invalid files identify the filename and leave the saved playlist unchanged. Admin uploads accept up to 20 tracks, 5 MB per file; the complete theme pack must remain within the existing 8 MB asset limit.

### Challenge submissions
Open **Challenges → Submissions** to inspect automatic attempts and each user's latest written response. Filter by **All**, **Correct**, **Incorrect**, **Pending**, or **Partial credit**; select an entry to see the submitted answer, challenge text, user, team, and submission time. Automatic attempts are recorded from this update onward; earlier incorrect attempts were not stored. Existing written responses appear, with **Not recorded** for missing historical team information.

For written responses, full marks before hint deductions count as Correct, zero marks as Incorrect, intermediate grades as Partial credit, and ungraded answers as Pending. Use **Review written answers** to grade them. The team name is captured when an answer is submitted and remains visible if a team is later renamed or disbanded. Full backups include attempt history and recorded submission teams; older backups remain supported.

The saved challenge list in **Challenges → Manage challenges** has a **Filter challenges** search. It matches challenge names, IDs, question text, location labels, and map names without case sensitivity. Enable **Regular expression** for patterns such as `compass|lantern`; invalid patterns show an error. **All maps** searches the complete catalog instead of the selected map. Clearing the search restores the list. Filtering does not change saved definitions or the map artwork.

### Notifications
Open **Manage → Notifications** (or the Notifications link in Challenge studio). Send a title and message to **Everyone**, **Selected teams**, or **Selected users**. Team notifications capture the active members at send time; future members do not inherit private notifications. Everyone announcements are visible to any signed-in user, including accounts that sign in later. Notifications work independently of chat permissions and mute status.

Players see an unread count on the bell in the game header, with a brief indication when a new notice arrives. Open the inbox to read announcements, mark individual notices read, or mark all read. Read status belongs to each account. Notification history and read status travel with full backups, while theme/content packs exclude announcements.

### Importing CTFd exports
Under **Challenges → Import CTFd** (`/admin/challenges/import`), select a standard CTFd export ZIP and choose whether to include users and teams. The importer reads `db/*.json` tables and `uploads/` files, as used by CTFd 3.8.7 and newer exports with the same layout. Preview the placements, username/team name mappings, and compatibility notes before applying. Imported content is added to the current catalog; existing accounts, progress, and theme are retained. The same ZIP cannot be applied twice.

Challenges receive unique IDs and randomly distributed reachable positions on the current theme. Standard CTFd challenge prerequisites become connections under **Challenges → Dependencies**: players must solve every prerequisite before the dependent challenge appears. The preview lists these connections. Prerequisites are placed first; if a prerequisite must be skipped because the maps are full or the catalog reaches its 100-challenge limit, its dependents are also skipped. The preview explains each exclusion and requires an explicit choice to skip them. If imported memberships exceed the current team limit, an explicit checkbox allows raising that limit (up to 100). Users are assigned the current theme's first avatar and can be reassigned through Users. Banned users and members of banned teams are disabled. Imported CTFd admins are students until you promote them in Users.

Standard static flags preserve each flag's own case rule and exact string comparison. Points (including zero), descriptions, categories, connection information, attribution, tags, hint contents/costs, HTTPS links, and bundled challenge files are retained. The challenge editor exposes original CTFd details, including source flags, hints, solutions, scoring fields, and compatibility notes; these private source details are excluded from player APIs and remain in content exports and full backups.

Compatibility differences are shown in the preview:

- Regex/plugin flag types and unsupported grading need manual review. These challenges import as hidden; unsupported flags remain in private source details.
- Dynamic challenges use their current exported value as a fixed point count. Live decay is not reproduced.
- Missing prerequisite references and unsupported requirement fields keep the affected challenge hidden for review; valid connections and original requirements are retained. Malformed requirements, self-dependencies, and dependency loops reject the import. Locked challenges remain fully hidden rather than showing CTFd's anonymized or preview placeholders. Existing imports are not retroactively changed.
- Multi-flag logic, hint prerequisites, plugin behavior, and attempt limits are not executed. Affected challenges stay hidden until reviewed.
- Hint costs remain exact, but CTF-RPG deducts costs from that challenge's reward and clamps awards at zero. CTFd charges hints against the overall scoreboard balance.
- Markdown source and links are preserved. Embedded HTML and plugin interfaces are not executed. Runtime containers/services must be hosted separately.
- Prior solves/fails, awards, pages, CTFd notifications, ratings, and custom account fields are not migrated as live game state. Historical solutions remain private source details. Hidden-account/team scoreboard state has no direct equivalent.

CTFd passwords use different hashes and cannot be reused by this importer. On success, **Download temporary credentials CSV** provides new user and team passwords. Download it before leaving the page; plaintext credentials are not stored on the server. Account password resets are available through Users if the download is lost. CTFd names are normalized or suffixed where necessary; the preview, credentials CSV, and import history retain the original-to-new mappings.

Upload limit: 64 MB compressed / 128 MB expanded, with at most 10,000 ZIP entries. Challenge files remain subject to the native content-pack limits of 4 MB per file and 8 MB total referenced attachments. Oversized or unsupported data is reported before database changes. Full backups preserve imported accounts, memberships, source challenge data, attached assets, and import history.

Format reference: [CTFd 3.8.7 export implementation](https://github.com/CTFd/CTFd/blob/3.8.7/CTFd/utils/exports/__init__.py). Prerequisite reference: [CTFd challenge access checks](https://github.com/CTFd/CTFd/blob/3.8.7/CTFd/api/v1/challenges.py#L185-L227). Password reference: [CTFd password hashing](https://github.com/CTFd/CTFd/blob/3.8.7/CTFd/utils/crypto/__init__.py).

Notification API: `GET/POST /api/admin/notifications` lists/sends notices. Sending accepts `{id, title, body, scope, targets}`; `scope` is `all`, `teams`, or `users`, and `targets` contains team IDs or usernames (empty for Everyone). `GET /api/notifications` reads a user's inbox; `?summary=true` returns only unread counts. `POST /api/notifications` accepts `{action: "read", id}` or `{action: "readAll"}`. CTFd preview/apply uses `POST /api/admin/ctfd-import` with multipart `file`, `users`, `teams`, and `action`; applying also includes the preview's theme/content revisions and fingerprint, plus explicit overflow/team-limit decisions. These APIs use the existing authenticated session and same-origin write checks.

### Bulk user management
The **Users** page shows each user’s team in the roster and profile. Select users with their checkboxes, or **Select all shown users** after searching by username or team, then choose **Disable**, **Delete**, **Mute chat**, or **Remove from team**. The selected count includes selections outside the current search. Clear selection to start over.

Disable revokes current sessions and retains progress. Mute chat prevents outgoing messages. Remove from team preserves progress and the team; members can choose a new team. Delete requires confirmation and permanently removes the selected users’ progress and memberships. Your own administrator user cannot be disabled or deleted. Stale revisions or changed memberships reject the entire action; refresh before retrying. Deleted YAML users remain absent after restart and backup restore. Admins can explicitly create a new user with the same username and fresh credentials.

## Configure non-player entities

Under **Theme → Maps & transport**, choose **Non-Player Entities** to the right of **Ground**. Add a character, choose its appearance and name, and click its map location. Add dialogue screens and player choices, linking each choice to its response with **Respond with**. Preview the conversation, then **Save map**. Players find characters through **Search nearby** and can click a reply or enter its number/text. See [the dialogue guide](MAP_GUIDE.md#non-player-entities-and-dialogue) for placement, branches, endings and limits.

## Replace a map image

To replace an existing map’s image, open **Theme → Maps & transport → Artwork**, select an image under **Replace map image**, and click **Replace image**. This changes artwork only; challenge and transport placements, walkable ground, spawns, and locks are preserved. **Cancel upload** clears a pending selection; **Reset image** restores the artwork from before the first replacement, including after reloads. Save or reset other map edits first.

## Locked doors, portals, and inventory

Under **Theme → Maps & transport → Transport**, select an existing transport or a predefined building entrance/exit using **Edit**, or use **Add new transport**. Choose **Lock requirement**: **No lock**, **Locked door · colored key**, or **Locked portal · incantation**. Select the required key color or enter a short phrase before clicking a free tile to place a new transport. Save the map to apply the requirement. Moving a transport or editing its destination retains its lock. **Reset to theme** restores a predefined door’s original settings.

Players use the **Inventory** link to the left of **Search nearby** on the map to see earned keys and learned phrases. Walking toward a locked door shows the required key color and their inventory: select a key and choose **Use selected key**, or **Cancel**. A locked portal opens an incantation search: filter and select a learned phrase or type a phrase, then choose **Submit** or **Cancel**. Incantations ignore case and extra spaces. Keys are kept after use; unlocks persist per account across logins. Changing a route’s destination or lock requirement requires a new unlock. Transport return trips remain available without spending another key or casting again.

Challenge rewards are configured in **New discovery / Edit discovery → Rewards → Inventory rewards**. Rewards and locks are independent: a challenge can grant the same key used by several doors, or teach an incantation used by multiple portals. Place reward challenges on a route players can reach before its lock. If you want every route into a map locked, configure its building entrance and any alternate transports as well.
