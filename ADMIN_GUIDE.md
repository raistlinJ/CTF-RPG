# Challenge management

Open `/admin` (or **Manage challenges** in the game's header when authorized). The editor shows the entire town or selected interior, with a tile grid, saved discoveries, and a challenge form. It uses the same map geometry as the game.

## Admin access

Set `ADMIN_USERNAME` and `ADMIN_PASSWORD` in the project root `.env` before the first local launch. Copy `.env.sample` as a starting point:

```dotenv
ADMIN_USERNAME=ctf-admin
ADMIN_PASSWORD='choose-a-unique-password'
```

The named account is created with the admin role and cannot be deleted, disabled or demoted. If it already exists, startup preserves its password and character and restores its admin access. `ADMIN_PASSWORD` is used only to create a missing account; change an existing password in **Users → select account → Reset password → Save user**.

Create additional accounts and assign their admin/student role in **Users**. Users choose among all player appearances at first sign-in; later logins keep their saved character. Admin accounts use the reserved admin appearance. Management access follows the authenticated account's admin role, in both hosting modes. Platform owner emails and incoming identity headers do not grant administrator privileges. Hosted Sites uses server-side `ADMIN_USERNAME` / `ADMIN_PASSWORD` runtime values; local Node and Compose read `.env`.

`content/game.yaml` has been removed. Registration, accounts, spawn points, team size, player visibility, messaging, appearances and audio are managed through the UI and persisted in the database/theme.

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

Every admin page shows the same primary links: **Challenges**, **Theme**, **Users**, **Teams**, **Notifications**, and **Import & backup**, with **Play game** and **View scoreboard** shortcuts. **Challenges** has Manage challenges, Submissions, Review answers, and Dependencies. **Theme** has Maps, entities & transport, Appearances, Media Library, and Theme library. Appearances manages character and map artwork assignments. Media Library has Image and Audio tabs for uploads, galleries, and the MIDI playlist. **Teams** has Manage teams, Team size, Players & messages, and Scoreboard. Each subpage has its own address and highlights the active section.

The discovery editor uses **Challenge**, **Rewards**, **Cutscenes**, and **Hints & files** tabs. Switching tabs retains the current draft; **Save challenge** saves every section together. Missing required fields open the relevant tab. Navigate to **Theme → Maps & transport** to edit artwork, ground and transport. Unsaved challenge and map changes trigger a navigation warning.

## Teams

Students create a team with a name and password, or join an existing team after signing in. Team passwords have 8–128 characters and are stored as salted hashes. Team names are unique ignoring case. Membership persists across logins; students cannot leave or switch teams. Only admins may disband a team, which releases its members to choose again without changing individual scores.

Admins use **Manage** in the game header. **Teams → Team size** (`/admin/teams/configuration`) sets the team limit. **Players & messages** (`/admin/teams/players`) controls player visibility and team messaging; **Scoreboard** (`/admin/teams/scoreboard`) controls ranking access and defaults. **Teams → Manage teams** (`/admin/teams`) shows searchable team rows with names, status, members, scores and point gifts. Check individual rows or **Select all shown teams**, then use **Mute chat**, **Unmute chat**, **Disable**, **Enable**, or **Delete**. Selection remains available while filtering; **Clear selection** removes all selected teams. Muted team rows also show an **Unmute** button for that team. Click a team row to view its card and messages; **Gift points** and expandable gift history remain available on each row. Set the maximum team size from 1–100 (default 4). The creator and disabled members count toward capacity. Lowering the limit retains existing members but prevents joins to full teams. All management pages enforce admin authorization.

Team mute prevents all current and future members from sending team or instructor messages; they can still receive and read messages. Unmuting a team keeps any individual account mutes. Disable pauses student access and sign-in, prevents new joins, and hides the team from player lists and rankings without changing individual account flags, memberships or earned progress. **Enable** restores participation. Administrators retain access to management. **Delete** requires confirmation, disbands selected teams, removes team-owned chat and point gifts, and releases members to choose a team again. Accounts, individual points and challenge progress remain saved. A stale selected team rejects the entire bulk action; refresh before retrying. Full backups retain team mute/disable status and revisions.

Use **Gift points** on a team to award 1–10,000 whole points with a required comment. Gifts count once toward the team total and remain separate from individual earned points. Members see **+N pts added** on the game screen; hover, focus, or tap to read the comment. Manage shows gift history. Full backups preserve gifts and comments. Disbanding a team removes its gifts; members retain individual progress.

Full backups include teams, team password hashes, memberships, and the saved size limit. Older backups without teams still restore successfully.

The admin-only `POST /api/admin/teams` bulk API accepts `{action, teams: [{id, revision}]}` with `action` set to `mute`, `unmute`, `disable`, `enable` or `delete` (1–1,000 unique teams). Read current revisions from `GET /api/admin/teams`; successful writes return `updated` and the current team list, and stale selections return HTTP 409. Writes require the existing session and same-origin checks.

## Theme and content packs

Administrators can use **Manage → Import & backup → Theme, content & backups** (`/admin/data`) to export/import reusable themes separately from challenge content. Themes own map artwork/layout, entrances, characters/sprites, and MIDI; content owns challenge text/flags/points/hints/locations/downloads. Neither includes accounts or progress. Full backup still includes the complete system, including imported assets and the active theme. See [THEMES.md](THEMES.md) for formats, limits, authoring, and paired imports. Self-hosters must preserve `data/pack-assets` together with their SQLite database (the Docker data volume already covers it).

## Automatic and manual grading

Every challenge supports `grading: automatic` (the default) or `grading: manual`, selected with **Answer checking** in the challenge editor. Automatic challenges require accepted flags. Manual challenges accept a written response of up to 20,000 characters and do not require flags. Responses are private to the student and admins, can be updated until graded, and freeze new hint purchases once submitted.

Admins use `/admin/challenges/review` (**Challenges → Grade written answers**) to award a whole-number grade from 0 to the submission's saved maximum and provide feedback. Recorded hint costs are subtracted, with a minimum final award of 0. Regrading updates the existing award and scoreboard. Response revisions prevent stale edits or grades from overwriting newer work. Full backups retain responses/grades/feedback; theme and content packs exclude them. Use new IDs for new tests; grading mode cannot be changed after responses or awards exist.

The built-in **Agentic Circuit** theme is available under **Theme → Theme library**. See [the course theme guide](themes/agentic-circuit/README.md) for activation, maps, and test preparation.

## Starting positions and live players

Use **Manage → Users**, select an explorer, choose **Starting map**, and click reachable ground in the map preview. **Use this map’s spawn** chooses its normal arrival tile; **Theme default** clears the account-specific assignment. Save the account. This starting position applies at sign-in and reload; students cannot choose or override it. Gray tiles are unavailable. New or incompatible theme layouts safely use the main map’s default spawn until you update the assignment.

**Manage → Teams → Players & messages → Players visible on the map** offers **Teammates only** (default), **All players**, or **Off**. With visibility enabled, students also see instructors on their map; administrators see active students so they can moderate them. Live explorers appear with their assigned sprites and usernames on the same map; teammate labels use green. Players do not block one another or reveal challenge answers. Visibility is enforced by the server. Each visible game tab exchanges positions every three seconds. Hidden tabs pause, stationary positions refresh less often, and disconnected players disappear within 20 seconds. The response is capped at 100 other players per map. This is a shared exploration view, not synchronized combat.

Visibility (`team`, `all`, or `off`) is managed through the UI and stored in the database. Full backups retain assigned starts and visibility; theme/content packs exclude these account/classroom settings, and temporary live positions are never exported.

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

Team and everyone visibility/message switches are managed independently in the UI and saved to the database. Full backups include these switches and private messages; theme/content packs exclude them. Disbanding a team removes conversations involving it and preserves account progress.

## Teammate halos and leading-team crowns

A green halo marks your explorer and visible teammates, distinguishing them from other players in **All players** mode. A gold crown appears above each visible avatar in the highest-scoring team, including your own explorer when applicable. Tied leading teams share the crown; no crowns appear while all teams have zero points. Rankings use the same earned net points, team gifts, and active-student rules as team cards, including players who are offline. They update with the existing three-second position refresh. Crowns follow the corresponding own-team or other-team score-visibility control, so a hidden team score also hides that team's crown.

## Instructor conversations and message badges

Students can click an administrator's avatar and **Message instructors**, or choose **Teams → Instructors**. This is a shared conversation between that student's team and all administrators. Other teams cannot read it. Administrators choose **Teams → Instructor inbox**, then **Reply to…** to answer a team; replies appear in the student's instructor conversation and team inbox. The **Your team → Messaging** control also governs instructor conversations. The five-message-per-minute limit is shared across team and instructor sends.

New incoming messages briefly show a number above your own avatar. The number counts newly received messages, excluding your own sends, and disappears five seconds after the latest arrival. Notifications use the existing three-second presence polling, including when player visibility is off. The badge represents recent arrivals, not an unread-message total.

## Chat moderation

An administrator can click a player avatar and choose **Mute user** or **Unmute user**. In **Manage → Users**, select the user, change **Mute chat**, and save. A mute blocks all outgoing team and instructor messages on the server, while leaving gameplay, incoming messages, and stored progress available. Changes use the account revision so a stale mute cannot overwrite another account edit. Mute status is retained in full backups.

## Challenge dependencies

Open **Challenges → Dependencies** (`/admin/challenges/dependencies`) to edit progression as a graph. Drag a challenge or entity’s right handle to another card’s left handle, or choose **Prerequisite** and **Unlocks** under the graph. For an entity prerequisite, choose **Any dialogue** or a specific final dialogue as the required output; double-click or right-click its connection to edit that choice. The arrow points from the prerequisite to the challenge or entity it unlocks. Drag cards to rearrange them, pan the background, and use **Fit graph**, **Zoom in**, **Zoom out**, or **Arrange graph** to navigate. Fit centers all cards, including cards moved beyond the viewport. Zoom stays anchored on the current view; press the percentage button to return to 100%. Scroll or use a trackpad to pan; Ctrl/Command plus the wheel zooms at the pointer. With the graph focused, use +/− to zoom and Home to fit. Each challenge card’s info icon opens a summary with points, prerequisites, answer checking, and up to 400 characters of challenge text. Entity cards show their activation rule and opening dialogue. Select a connection and choose **Remove connection**, use Delete while its edge is focused, or remove it from the connection list. **Undo change** restores recent edits; **Save dependencies** applies connections to active games. Card positions are a viewing aid; saved connections determine progression.

A player must complete every incoming prerequisite before a challenge or entity appears on the map. Locked challenges cannot be discovered, answered, or have their hints purchased; locked entities cannot be spoken to. Unlocks follow each player’s progress. Written prerequisites unlock after grading. Already completed challenges remain available, and hidden challenges retain their visibility restrictions. Admins can preview every challenge and entity; preview conversations do not activate entities. Self-links, duplicate prerequisites, unknown IDs, and dependency loops are rejected. If another admin edits the catalog or graph, reload the saved graph before saving again.

Use **Add non-player entity** below the connection selectors, or right-click empty canvas, to add an existing Theme character as a purple graph card. Connected entities appear automatically. **Edit in Theme** opens the non-player entity page; **Remove from graph** removes the card and its connections while preserving the character in Theme. Save dependency changes to apply them; **Undo change** restores draft edits. Create and edit characters in **Theme → Maps, entities & transport → Non-player entities**.

Connect **challenge → entity** to make the character appear after solving that challenge. Connect **entity → challenge** to make the challenge appear after the player speaks to the character. A successful nearby conversation activates the entity once for that player, even if the conversation has more choices. Activation persists across reloads and does not award points or inventory. Solved challenges and activated entities stay available if prerequisites are later changed. Mixed challenge/entity dependency loops are rejected.

YAML definitions use `dependsOn: [first-challenge-id, second-challenge-id]` for challenges or `dependsOn: ["npe:guide-id"]` for an entity prerequisite. Entity definitions also accept `dependsOn`, such as `[first-challenge-id]`; older definitions default to no prerequisites. The challenge editor displays prerequisites and preserves them when editing other fields. YAML exports, content packs, and full backups retain connections. Import previews include any dependents whose prerequisites cannot be placed, so the overflow decision covers the whole affected chain.

## Scoreboard controls and discovered questions

Under **Manage → Teams → Scoreboard**, choose **All signed-in players** or **Administrators only**, and the default admin score view. Players open **Scores** in a modal showing team names and totals. Admins can switch **User scores** / **Team scores** in the modal or `/scoreboard`; this toggle changes only their view. Private scoreboards deny students at the API and hide the Scores button. Team totals include earned net points from active student members plus team gifts; administrators and disabled accounts do not contribute earned points. Scoreboard access settings remain separate from team-card score switches; hidden team names continue to use team references. Full backups retain settings and gifts; theme/content packs exclude them.

The game journal shows only discovered, submitted, and solved questions, with a count such as **3 solved**. It does not show an undiscovered question list or a solved/total fraction. Opening a question saves its discovery for that account so it stays listed after reload or on another device. Solving and submitting remain separate actions.

### Challenge visibility
At the top right of Challenge studio, use **Challenge availability** to choose **All** or **Admins-only**. Changes save automatically. **All** lets students see challenges marked **Visible**; **Admins-only** hides all challenges from students. Each challenge also has a **Visible/Hidden** dropdown saved with its definition. Hidden challenges remain available to administrators for testing and editing. Visibility changes reach active games on the next three-second update; student requests for hidden questions, hints, and answers are rejected. Existing progress and scores are preserved.

Challenge YAML supports `visibility: visible` or `visibility: hidden` (defaults to `visible`). This field travels with content export/import. Full backups also preserve the global visibility setting; older backups default to All. Theme-only packs do not change challenge visibility.

### Theme pages and MIDI playlists
**Theme → Theme library** contains ready-made themes. **Import & backup → Theme, content & backups** contains independent theme/content pack import and export controls. **Theme → Maps & transport** opens the map editor, including locked doors and portals. **Theme → Media Library** uploads and browses image files. **Theme → Appearances** assigns those images to existing player and non-player appearances, boss styles, and map backgrounds. You can add a new appearance for players, non-player entities, or both. Uploaded images can be deleted when no role uses them. Artwork supplied by an imported theme or the game is read only. All active theme images, including unassigned uploads, travel with theme exports and full backups. Importing a theme pack marks its media as theme artwork; restoring a full backup retains the upload labels. **Theme → Media Library → Audio** lets administrators add multiple `.mid` or `.midi` files, preview and remove tracks, set volume, and choose whether the shuffled playlist repeats. Select your files and click **Upload & Save**. Reload the game to load the new playlist. Players still control sound with the game's sound/mute button. Each shuffle round plays every track once; when possible, the next round starts with a different track than the previous round ended with. Removing a track from the playlist does not delete an asset that another export or map may reference.

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

Supply the MIDI files in the server's public directory when configuring paths in YAML. A nonempty playlist takes precedence over `audio.midi`. Uploads skip MIDI files whose contents are already in the retained playlist or the same batch, and report the skipped filenames. Invalid files identify the filename and leave the saved playlist unchanged. Admin uploads accept up to 20 tracks, 5 MB per file; the complete theme pack must remain within the 32 MB asset limit (including artwork, retained originals, and unused uploads).

### Challenge submissions
Open **Challenges → Submissions** to inspect automatic attempts and each user's latest written response. Filter by **All**, **Correct**, **Incorrect**, **Pending**, or **Partial credit**; select an entry to see the submitted answer, challenge text, user, team, and submission time. Automatic attempts are recorded from this update onward; earlier incorrect attempts were not stored. Existing written responses appear, with **Not recorded** for missing historical team information.

For written responses, full marks before hint deductions count as Correct, zero marks as Incorrect, intermediate grades as Partial credit, and ungraded answers as Pending. Use **Review written answers** to grade them. The team name is captured when an answer is submitted and remains visible if a team is later renamed or disbanded. Full backups include attempt history and recorded submission teams; older backups remain supported.

The saved challenge list in **Challenges → Manage challenges** has a **Filter challenges** search. It matches challenge names, IDs, question text, location labels, and map names without case sensitivity. Enable **Regular expression** for patterns such as `compass|lantern`; invalid patterns show an error. **All maps** searches the complete catalog instead of the selected map. Clearing the search restores the list. Filtering does not change saved definitions or the map artwork.

### Notifications
Open **Manage → Notifications** (or the Notifications link in Challenge studio). Send a title and message to **Everyone**, **Selected teams**, or **Selected users**. Team notifications capture the active members at send time; future members do not inherit private notifications. Everyone announcements are visible to any signed-in user, including accounts that sign in later. Notifications work independently of chat permissions and mute status.

Players see an unread count on the bell in the game header, with a brief indication when a new notice arrives. Open the inbox to read announcements, mark individual notices read, or mark all read. Read status belongs to each account. Notification history and read status travel with full backups, while theme/content packs exclude announcements.

### Importing CTFd exports
Under **Import & backup → Import CTFd** (`/admin/data/ctfd`), select a standard CTFd export ZIP and choose whether to include users and teams. The importer reads `db/*.json` tables and `uploads/` files, as used by CTFd 3.8.7 and newer exports with the same layout. Preview the placements, username/team name mappings, and compatibility notes before applying. Imported content is added to the current catalog; existing accounts, progress, and theme are retained. The same ZIP cannot be applied twice.

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

Disable revokes current sessions and retains progress. Mute chat prevents outgoing messages. Remove from team preserves progress and the team; members can choose a new team. Delete requires confirmation and permanently removes the selected users’ progress and memberships. The configured protected administrator cannot be deleted, disabled, or demoted. Select all/delete and bulk disable keep that account and act on the other selections; confirmation counts and lists exclude it. Local startup requires the matching protected admin in YAML. Stale revisions or changed memberships reject the entire action; refresh before retrying. Deleted YAML users remain absent after restart and backup restore. Admins can explicitly create a new user with the same username and fresh credentials.

## Configure non-player entities

Non-player entities support a **Tile allocation** of **1 × 1**, **2 × 2**, or **3 × 3** under **Theme → Maps & transport → Non-player entities**. The selected entity has an outline showing its full allocation. Coordinates specify its top-left tile; dragging any allocated tile keeps that grab position. The whole allocation must fit inside the grid and remain clear of challenges, spawns, doors, transports and other entities before saving. Non-walkable ground is allowed. Players can talk from any tile beside an edge; diagonal corners are out of range. Theme YAML uses `size: 1`, `size: 2`, or `size: 3` on each `world.entities` entry; omitted sizes default to 1. Theme packs and full backups retain the allocation. Artwork fits inside the allocated tiles. The entire allocation blocks movement, even when ground beneath it is painted walkable. Moving or removing an entity restores the underlying terrain. In-game names appear only when the player is one tile beside an edge, within interaction range, and hide again when they walk away; the admin placement editor always shows names.

Under **Theme → Maps, entities & transport → Non-player entities**, select a map. Add a character, choose its appearance and name, and click a free map tile. Non-walkable tiles are allowed; players need a walkable tile beside the character to speak with it. **Save entities**, then open **Edit dialogue graph** for that character. Add dialogue screens and connect player choices to their responses in the graph. Choose whether the conversation can restart or is one-time, preview it, and **Save dialogue**. Players find characters through **Search nearby** within one tile horizontally or vertically and can click a reply or enter its number/text. See [the dialogue guide](MAP_GUIDE.md#non-player-entities-and-dialogue) for placement, branches, endings and limits.

## Replace a map image

To replace an existing map’s image, open **Theme → Maps & transport → Artwork**, select an image under **Replace map image**, and click **Replace image**. This changes artwork only; challenge and transport placements, walkable ground, spawns, and locks are preserved. **Cancel upload** clears a pending selection; **Reset image** restores the artwork from before the first replacement, including after reloads. Save or reset other map edits first.

## Locked doors, portals, and inventory

Under **Theme → Maps & transport → Transport**, select an existing transport or a predefined building entrance/exit using **Edit**, or use **New transport**. The **Transports on this map** table has a **Locks** column showing the required key color, the actual incantation, or **None** for an unlocked route. Choose **Lock requirement**: **No lock**, **Locked door · colored key**, or **Locked portal · incantation**. Select the required key color or enter a short phrase before clicking a free tile to place a new transport. Save the map to apply the requirement. Moving a transport or editing its destination retains its lock. **Reset to theme** restores a predefined door’s original settings.

Players use the **Inventory** link to the left of **Search nearby** below the map to see earned keys and learned phrases. Walking toward a locked door shows the required key color and their inventory: select a key and choose **Use selected key**, or **Cancel**. A locked portal opens an incantation search: filter and select a learned phrase or type a phrase, then choose **Submit** or **Cancel**. Incantations ignore case and extra spaces. Keys are kept after use; unlocks persist per account across logins. Changing a route’s destination or lock requirement requires a new unlock. Transport return trips remain available without spending another key or casting again.

Challenge rewards are configured in **New discovery / Edit discovery → Rewards → Inventory rewards**. Rewards and locks are independent: a challenge can grant the same key used by several doors, or teach an incantation used by multiple portals. Place reward challenges on a route players can reach before its lock. If you want every route into a map locked, configure its building entrance and any alternate transports as well.

### Challenge map icons

In each challenge editor, choose **Map icon → Star** (the existing marker) or **Boss**, then choose **Boss size → 1 × 1, 2 × 2, or 3 × 3 tiles** and one of six **Boss appearance** styles. The location is the top-left corner. All covered tiles must be reachable, usable, and free of other challenges, characters, doors, and transport. Players can search near any edge of the boss. Theme relocation respects the entire footprint; icons survive content exports and full backups.

Challenge YAML uses `icon: star` or `icon: boss` with `iconSize: 1`, `2`, or `3`, plus optional `bossStyle: classic`, `frost`, `clockwork`, `shadow`, `ember`, or `serpent`. Omitted fields retain the original 1×1 star or classic boss.

The player sidebar lists only solved challenges. **Review Solved** hides the answer input and offers **Reveal answer** to show the player’s recorded successful entry (or graded written response). **Hide answer** conceals it again; closing and reopening the review starts hidden. Each player can reveal only their own answer. Older solves without a recorded answer show an availability message instead of an accepted flag. Discovered but unsolved challenges and pending written submissions are reached through Search nearby on the map. Solved stars and bosses remain on the map with a small green check; click the completed marker to see its name.

### Search and delete submissions

On **Challenges → Submissions**, **Search submissions** matches literal text (case insensitive for English text) across usernames, submission teams, challenge IDs/names, questions, answers, feedback, grading/status labels, grades, and timestamps. It searches the full collection, combines with the status dropdown, and paginates matching results. `%` and `_` are literal characters, not wildcards.

Check individual submissions or **Select page**, then **Delete selected**. Selection clears when changing pages or filters. The confirmation names affected users/challenges. Deletion resets every selected user/challenge pair: all answer attempts (including unchecked attempts for that pair), written response/grade, completion/points, earned rewards, purchased hints, discovery, and cutscene history are removed. Team totals recalculate from remaining awards. Other users, other challenges, direct team point awards, and previously unlocked routes are preserved. Students can submit again; refresh their game if an old pending response or hint remains visible. Export a full backup beforehand if you need to retain deleted records.

Admin REST: `GET /api/admin/submissions?status=all&search=literal-text&offset=0`; `POST /api/admin/submissions` with `{ "action": "delete", "submissions": [{ "id": "the-row-id", "revision": 0, "submittedAt": 1234567890 }] }`. Use row tokens from the GET response; at most 100 selections per request. Origin and admin access are enforced. A changed/deleted selection rejects the entire reset with HTTP 409.

Challenge management has separate **All challenges** and **Edit discovery** views. The collection opens by default and provides text/regex and map filters. Select a challenge or choose New challenge to open the map and discovery form. Returning to the collection prompts before discarding unsaved changes. Links with `/admin?map=MAP_ID` still open the map editor directly.

On All challenges, check individual rows or Select filtered, then Enable selected or Disable selected. These set visibility to visible or hidden in one revision-checked operation; scores, submissions, and dependencies are preserved. Selection clears when filters change. Rows spread the name, location, prerequisites, unlocks, and points/status across columns, with a stacked layout on narrow screens. Hover or keyboard-focus a row to preview the first 12 words of its challenge text and up to three accepted flags; long flags are shortened. Instructor-graded challenges show their grading mode instead of automatic flags. From (requires) lists prerequisites; To (unlocks) lists dependent challenges and characters, including those on other maps. Their names are also searchable. Global availability and prerequisite rules continue to apply. REST uses `POST /api/admin/challenges` with `{ "action": "bulk-visibility", "ids": ["challenge-id"], "visibility": "visible", "revision": 1, "themeRevision": 0 }`.

Theme → Appearances begins with selectable player character previews, followed by the reserved admin wizard and non-player appearances. Previews use the game renderer, so appearances without image files still show their fallback sprite. The admin wizard is reserved for administrators and cannot be selected by students. Choose its image from the same Media Library and Save appearances; Use built-in wizard restores the default drawing. The image appears in the admin preview, on the game map, and in player popups, and travels with theme exports and full backups.

Upload map artwork in Theme → Media Library. In Theme → Appearances, choose the image under Map artwork, then Save appearances. Reset original artwork restores the first saved background after saving. Artwork changes preserve map geometry, challenges, entities, and transport. Maps & transport now has a Non-player entities tab for character placement and dialogue links; map names remain under Advanced. Section navigation uses blue accents; local tabs use smaller type and purple accents to distinguish them from the main header.

### Admin navigation

Primary sections are Challenges, Theme, Users, Teams, Notifications, and Import & backup. Play game and View scoreboard are separate shortcuts. Grading lives alongside Submissions under Challenges. Import & backup owns theme/content packs, full backup downloads, and CTFd imports, including accounts and teams. Theme owns Maps, entities & transport, Appearances, Media Library, and the Theme library. Non-player entity placement is part of Maps; a character’s dialogue graph includes a breadcrumb back to that character on its map. Scoreboard settings remain under Teams, distinct from viewing the live scoreboard.

Canonical pages are `/admin/challenges/review`, `/admin/data`, `/admin/data/ctfd`, and `/admin/theme/maps/dialogue`. Non-player entity links use `/admin/theme/maps?tab=entities&map=MAP_ID&entity=ENTITY_ID`. Redundant old pages were removed. Appearances lives at `/admin/theme/appearances`. Media Library lives at `/admin/theme/media`, with Audio at `/admin/theme/media?tab=audio`. Image and Audio retain unsaved edits while switching tabs, warn before leaving Media Library, and synchronize revision tokens after saves in either tab.

## Appearance catalogs and new locations

**Theme → Appearances** separates character appearances into **Players**, **Non-playable**, and **Admins**, with additional **Bosses** and **Map artwork** tabs. A shared player/non-playable appearance appears in both corresponding categories. The reserved admin wizard is configured in Admins. New player and non-playable appearances have their own name/image forms. Upload images in **Media Library → Image**, then assign them here. Switching tabs keeps drafts; **Save appearances** saves every tab together.

Under **Bosses**, give **Add a boss appearance** a name and image. It becomes a choice in the challenge editor’s **Boss appearance** dropdown and uses the challenge’s selected 1 × 1, 2 × 2 or 3 × 3 allocation. A theme supports up to 30 custom bosses in addition to the six built-in styles. Theme YAML stores their stable `boss-...` IDs and labels in `bosses`, and their images in `bossSprites`; content references that ID in `bossStyle`. A content pack used with a theme missing its custom appearance retains the reference and displays a classic fallback until that appearance is supplied or changed.

Under **Map artwork**, **Add a map location** creates a real map from a name and image. Each new location has a 40 × 28 walkable grid, a center spawn at (20,14), and no predefined building doorway. Open **Edit ground, spawn & transport** to paint blocked areas and set the spawn. Create a transport from an accessible map to connect the new location; players can step off the destination spawn and back onto it to return. Add challenges to the location in the challenge editor. Themes support up to 30 maps, including their starting map and interiors. Existing artwork assignments preserve map geometry; **Reset original artwork** remains available for replaced backgrounds. Theme packs and full backups retain the new appearances, boss IDs/images, maps, ground and transports.

## Unmute users and teams

In **Users**, check one or more accounts and click **Unmute chat**, or click **Unmute** on a muted user's row. In **Teams → Manage teams**, use the same bulk control or the **Unmute** button on a muted team's row. These actions save immediately without a profile save. Unmuting a user keeps any team mute in place; unmuting a team keeps any individual user mutes. Progress, memberships and account disabled states are unchanged. The in-game avatar popup also offers **Unmute user** for a muted account.
