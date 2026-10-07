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

Keep your existing character, audio, and other configuration. Student is the default role. Admin accounts are explicitly designated in server-side YAML or created/promoted through authenticated user management; registering a student account cannot grant admin privileges. Admin sign-in uses the same salted password hashes and server sessions as the game. For unmanaged YAML accounts, removing `role: admin` revokes management access on subsequent API requests. Studio-managed roles take precedence; use the Accounts screen to change them.

The standalone server never uses incoming platform identity headers to grant admin access. Keep the account YAML private, as described in [SELF_HOSTING.md](SELF_HOSTING.md).

### Hosted Sites version

Your private site's owner email is configured in `admin.platformEmails`. The hosted server checks the trusted Sites-authenticated email against this allowlist, so the owner can open the studio without creating another password. Other authorized visitors still need a YAML-admin account or an explicitly allowed platform email. The list is server-only; it is not included in `/api/config`. This platform allowlist has no effect on your standalone Node server.

## Create and edit discoveries

1. Select the town, castle, or a house from **Map**.
2. Click reachable ground or floor. The highlighted tile and coordinates identify the location. You can also focus the map and use arrow keys, or type X/Y coordinates.
3. Give the discovery a name and location clue. Add challenge text, points, and accepted flags (one per line).
4. Choose whether flags are case-sensitive. Add optional hints and costs, plus downloadable file links.
5. Click **Save challenge**.

Gold sparkles and the saved-discoveries list identify existing challenges. Select one to edit it. Clicking another clear tile moves the selected challenge within its map; numeric coordinates also move it. **New challenge** starts a separate discovery. Switching maps starts a new draft on that map. Unsaved content prompts before being discarded.

The editor rejects walls, water, furniture, doorways, exits, and unreachable tiles. It also rejects duplicate coordinates within a map, duplicate references, invalid file URLs, excessive hint costs, and invalid flags. There can be at most 100 challenges; accepted flags are limited to 100 per challenge. The whole saved set is limited to 1.5 MB.

Save makes the definition available through the game API immediately. Students see updates when they reload the expedition, return focus to the game tab, or refresh their game state through a challenge action. Already earned scores are preserved. Existing challenges keep their IDs automatically, so edits cannot award another completion for the same object. Existing purchased hint costs also remain unchanged. The editor supports links to files; it does not upload file contents. Place local assets in `public/downloads/` or use an external HTTPS URL.

## Persistence, YAML, and backups

`content/challenges.yaml` supplies the starting set. Before any admin save, restarting with an edited YAML file changes that starting set as before. **After the first admin save, the database-backed set becomes authoritative**, including across restarts and hosted publications. Editing the baseline YAML alone no longer replaces the saved admin set.

Use **Export YAML** to download the current complete definitions, including accepted flags and hint text. Export is admin-only; treat the file as teacher material and keep it out of `public/`. It uses the same format documented in [CHALLENGES.md](CHALLENGES.md), so it can be used as the starting YAML for a fresh installation. Existing installations keep their saved database set; copying an export into the baseline does not overwrite that database.

Challenge edits, student progress, and hint purchases live in the same persistent SQLite/D1 database. Include the database in your backups. Self-hosting adds `challenge_catalog` automatically on startup. The Cloudflare preview needs `drizzle/0002_melodic_stephen_strange.sql` applied once; hosted publication applies that migration automatically. See [SELF_HOSTING.md](SELF_HOSTING.md) for restart and backup instructions.

Concurrent admin saves use a revision check. If another admin saves first, your draft is preserved and the request is rejected with a clear message. **Reload saved version** loads the current definition before you reapply changes; it asks before discarding your unsaved draft. The studio creates and edits challenges without deleting student progress or uploading file contents. **Accounts** opens user management; **Full backup** exports the complete recreation package. See [BACKUPS.md](BACKUPS.md).

## Teams

Students create a team with a name and password, or join an existing team after signing in. Team passwords have 8–128 characters and are stored as salted hashes. Team names are unique ignoring case. Membership persists across logins; students cannot leave or switch teams. Only admins may disband a team, which releases its members to choose again without changing individual scores.

Admins see **Manage** in the game header. `/admin/teams` links to challenges, accounts, and scores. Set the maximum team size from 1–100 (default 4, initially configured by `teams.maxMembers` in `content/game.yaml`). The creator and disabled members count toward capacity. Lowering the limit retains existing members but prevents joins to full teams. Team management routes enforce admin authorization.

Full backups include teams, team password hashes, memberships, and the saved size limit. Older backups without teams still restore successfully.

## Theme and content packs

Administrators can use **Manage → Themes & content** (`/admin/packs`) to export/import reusable themes separately from challenge content. Themes own map artwork/layout, entrances, characters/sprites, and MIDI; content owns challenge text/flags/points/hints/locations/downloads. Neither includes accounts or progress. Full backup still includes the complete system, including imported assets and the active theme. See [THEMES.md](THEMES.md) for formats, limits, authoring, and paired imports. Self-hosters must preserve `data/pack-assets` together with their SQLite database (the Docker data volume already covers it).

## Automatic and manual grading

Every challenge supports `grading: automatic` (the default) or `grading: manual`, selected with **Answer checking** in the challenge editor. Automatic challenges require accepted flags. Manual challenges accept a written response of up to 20,000 characters and do not require flags. Responses are private to the student and admins, can be updated until graded, and freeze new hint purchases once submitted.

Admins use `/admin/review` (**Manage → Review answers**) to award a whole-number grade from 0 to the submission's saved maximum and provide feedback. Recorded hint costs are subtracted, with a minimum final award of 0. Regrading updates the existing award and scoreboard. Response revisions prevent stale edits or grades from overwriting newer work. Full backups retain responses/grades/feedback; theme and content packs exclude them. Use new IDs for new tests; grading mode cannot be changed after responses or awards exist.

The built-in **Agentic Circuit** theme is available under **Themes & content**. See [the course theme guide](themes/agentic-circuit/README.md) for activation, maps, and test preparation.

## Starting positions and live players

Use **Manage → Accounts**, select an explorer, choose **Starting map**, and click reachable ground in the map preview. **Use this map’s spawn** chooses its normal arrival tile; **Theme default** clears the account-specific assignment. Save the account. This starting position applies at sign-in and reload; students cannot choose or override it. Gray tiles are unavailable. New or incompatible theme layouts safely use the main map’s default spawn until you update the assignment. YAML accounts can set `spawn: { map: castle, location: { x: 20, y: 23 } }`; studio edits take priority.

**Manage → Teams → Players visible on the map** offers **Teammates only** (default), **All players**, or **Off**. With visibility enabled, students also see instructors on their map; administrators see active students so they can moderate them. Live explorers appear with their assigned sprites and usernames on the same map; teammate labels use green. Players do not block one another or reveal challenge answers. Visibility is enforced by the server. Each visible game tab exchanges positions every three seconds. Hidden tabs pause, stationary positions refresh less often, and disconnected players disappear within 20 seconds. The response is capped at 100 other players per map. This is a shared exploration view, not synchronized combat.

Standalone YAML can set `presence: { visibility: team }` (`team`, `all`, or `off`). Once an admin saves visibility, the database setting takes priority. Full backups retain assigned starts and visibility; theme/content packs exclude these account/classroom settings, and temporary live positions are never exported.

## Team cards and messages

Click **Teams** in the game header or your team banner to open a team card. Clicking an avatar opens player cards with each username, permitted team name and score, and a **Send message to team** button when messaging is enabled. Clicking a shared tile lists every visible player there, including yourself, in a scrollable popup. Cards refresh as players move and respect the separate own-team and other-team admin controls. Administrators use a distinct purple game-master avatar across themes; it is not selectable by student accounts. Cards show member count and, when enabled, the name and aggregate score. Scores sum the earned net points of active student members; administrator and disabled accounts are excluded. **Manage → Teams** also opens cards by clicking team names.

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

A green halo marks your explorer and visible teammates, distinguishing them from other players in **All players** mode. A gold crown appears above each visible avatar in the highest-scoring team, including your own explorer when applicable. Tied leading teams share the crown; no crowns appear while all teams have zero points. Rankings use the same earned net points and active-student rules as team cards, including players who are offline. They update with the existing three-second position refresh. Crowns follow the corresponding own-team or other-team score-visibility control, so a hidden team score also hides that team's crown.

## Instructor conversations and message badges

Students can click an administrator's avatar and **Message instructors**, or choose **Teams → Instructors**. This is a shared conversation between that student's team and all administrators. Other teams cannot read it. Administrators choose **Teams → Instructor inbox**, then **Reply to…** to answer a team; replies appear in the student's instructor conversation and team inbox. The **Your team → Messaging** control also governs instructor conversations. The five-message-per-minute limit is shared across team and instructor sends.

New incoming messages briefly show a number above your own avatar. The number counts newly received messages, excluding your own sends, and disappears five seconds after the latest arrival. Notifications use the existing three-second presence polling, including when player visibility is off. The badge represents recent arrivals, not an unread-message total.

## Chat moderation

An administrator can click a player avatar and choose **Mute user** or **Unmute user**. In **Manage → Accounts**, select the user, change **Mute chat**, and save. A mute blocks all outgoing team and instructor messages on the server, while leaving gameplay, incoming messages, and stored progress available. Changes use the account revision so a stale mute cannot overwrite another account edit. Mute status is retained in full backups.

## Scoreboard controls and discovered questions

Under **Manage → Teams → Scoreboard**, choose **All signed-in players** or **Administrators only**, then **Individual scores** or **Team scores**. Save to apply the settings. Private scoreboards deny students at the API and hide their Scores link. Team scores aggregate earned net points from active student members; administrators and disabled accounts do not contribute. Scoreboard access/scoring settings are separate from team-card score switches; hidden team names continue to use team references. Full backups retain these settings; theme/content packs exclude them.

The game journal shows only discovered, submitted, and solved questions, with a count such as **3 solved**. It does not show an undiscovered question list or a solved/total fraction. Opening a question saves its discovery for that account so it stays listed after reload or on another device. Solving and submitting remain separate actions.

### Challenge visibility
At the top right of Challenge studio, use **Challenge availability** to choose **All** or **Admins-only**. Changes save automatically. **All** lets students see challenges marked **Visible**; **Admins-only** hides all challenges from students. Each challenge also has a **Visible/Hidden** dropdown saved with its definition. Hidden challenges remain available to administrators for testing and editing. Visibility changes reach active games on the next three-second update; student requests for hidden questions, hints, and answers are rejected. Existing progress and scores are preserved.

Challenge YAML supports `visibility: visible` or `visibility: hidden` (defaults to `visible`). This field travels with content export/import. Full backups also preserve the global visibility setting; older backups default to All. Theme-only packs do not change challenge visibility.

### Theme pages and MIDI playlists
**Theme → Import / Export** contains the theme presets and independent theme/content pack import and export controls. **Theme → Audio** lets administrators add multiple `.mid` or `.midi` files, preview and remove tracks, set volume, and choose whether the shuffled playlist repeats. Click **Save audio** to publish changes, then reload the game to load the new playlist. Players still control sound with the game's sound/mute button. Each shuffle round plays every track once; when possible, the next round starts with a different track than the previous round ended with. Removing a track from the playlist does not delete an asset that another export or map may reference.

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

Supply the MIDI files in the server's public directory when configuring paths in YAML. A nonempty playlist takes precedence over `audio.midi`. Admin uploads accept up to 20 tracks, 5 MB per file; the complete theme pack must remain within the existing 8 MB asset limit.
