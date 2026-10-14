# Scoreboard, users, and complete backups

## Scoreboard

Open **Scores** from the game to view the scoreboard in a modal, or visit `/scoreboard`. Players see team names and totals, including team gifts. Administrators can toggle **User scores** / **Team scores** without changing the player view. Access (**all signed-in players** or **admins only**) and the default admin view are set under **Manage → Teams → Scoreboard**. Server checks enforce private access. Individual scores are stored earned points after hint costs, with completed-treasure counts and character names. Ties share competition ranks (1, 1, 3). Admins and disabled accounts do not contribute earned points. Scores refresh automatically every five seconds while visible, on focus, or using **Refresh scores**.

## User management

Open `/admin/users` or **Users** in the challenge studio. Authorized admins can:

- Set **Account creation** to allow self-registration or restrict sign-in to admin-created accounts. The setting is stored in the database and included in full backups.

- Create student or administrator accounts with a default character and password. Users choose their appearance on first sign-in.
- Change an existing account's role, assigned character, and starting map/tile.
- Reset a password; the previous password stops working and existing sessions are revoked.
- Disable an account, blocking access and removing it from the scoreboard, or reactivate it with its progress intact.
- Mute or unmute chat without blocking gameplay or incoming messages. Use **Unmute chat** for checked users or **Unmute** directly on a muted row. User and team restrictions remain independent.
- View each user’s team and apply bulk actions with selection checkboxes.
- Remove selected users from their teams without disbanding the teams.
- Permanently delete selected users and their progress after confirmation.

Usernames stay fixed to preserve account identity and scores. Accounts and credentials are managed in the database. Admin-created accounts can sign in even with open registration disabled. Student self-registration never grants admin privileges. All API actions check the current role and disabled state on the server. The configured protected admin cannot be deleted, disabled or demoted. Other admins cannot disable or demote themselves. Management privileges follow the authenticated account role.

The user list never exposes passwords or hashes. Leaving the password field empty on an edit preserves it. Changes use revisions to reject stale simultaneous edits. Disabling is reversible and keeps history; deleting is permanent and removes the user’s progress and memberships. Select multiple users with their checkboxes to Disable, Delete, Mute chat, Unmute chat, or Remove from team. Delete requires confirmation. Bulk delete/disable preserves the configured protected administrator. Removed members can choose another team, while their individual progress remains saved. Deleted users stay deleted after restart and backup restore; creating a new user with that username gives it fresh credentials and progress.

## Full export

Use **Full backup** in either admin screen. `/api/admin/backup` is admin-only and downloads a ZIP containing:

- Application source, the ready-built standalone frontend, Node server, dependency lockfile, and hosting instructions.
- All local public assets included in the hosted build; on your own server, current files in `public/` are also collected at export time. This covers sprites, MIDI audio, and local challenge downloads.
- Effective game settings (stored in `backup.json`) and the current challenge set, including flags, hints, costs, file links, and challenge dependencies.
- Deleted-user markers and account revisions.
- Every account, including accounts that have not signed in, roles, heroes and first-login selection status, starting positions, disabled state, salted password hashes, and account IDs.
- Awarded scores/completions, purchased hints with their recorded point and item costs, earned inventory, unlocked transports, cutscene playback history, entity activations, and team point gifts with comments.
- `backup.json`, the restore program, and a short `RESTORE.md` guide.

Existing passwords work after restore. Plaintext account passwords are converted to salted hashes; raw account passwords and active login sessions are not exported. External file URLs are preserved as links and remain dependent on their external hosts. The export removes the original Sites project ID, so recreating it does not point at the original site's deployment. Environment secrets, machine-specific settings, and installed `node_modules` are excluded; use the supplied lockfile to install dependencies.

Keep backups private: account hashes, student records, accepted flags, and hint text are sensitive. This is separate from **Export YAML**, which exports only challenge definitions. The ZIP's expanded package is limited to 64 MB, with a 24 MB source/asset seed limit; oversized packages fail rather than silently omitting files. Compression uses [fflate](https://github.com/101arrowz/fflate).

## Recreate on a fresh server

Extract the ZIP into a new directory. With Node.js 24 installed:

```sh
npm ci
npm run restore -- backup.json
npm run start:selfhost
```

Open `http://localhost:3000`. The ready-built game is included, so a frontend build is not needed merely to run the restored application. You can edit the included source and run `npm run build:selfhost` later. The restore initializes a new SQLite database, restores account IDs and progress, writes the exported configuration, and activates the exported challenge catalogue. Every visitor must sign in again.

To designate a different restored account as the protected administrator, use:

```sh
npm run restore -- backup.json --admin teacher01
```

That player keeps their password and gains admin access. Restore writes the protected username to the recreated root `.env`; credentials remain in the database. If you need a new account instead, set `ADMIN_USERNAME` and `ADMIN_PASSWORD` in `.env` before launching, following [ADMIN_GUIDE.md](ADMIN_GUIDE.md).

The restore refuses to replace a populated database by default. When you explicitly intend to replace its accounts and progress, stop the game server, back up that database, then use:

```sh
npm run restore -- backup.json --replace
```

Use `DATABASE_PATH` to select a different database path. Restore writes the protected admin name to the root `.env` and challenge definitions to `content/challenges.yaml`. Other settings, theme, accounts and passwords are restored to the database. The original deployment `.env` and its plaintext bootstrap password are never exported. Restore on the host before starting Docker. Reconfigure the new server's hostname, port, HTTPS proxy, and secure cookies using [SELF_HOSTING.md](SELF_HOSTING.md); these deployment choices are not carried over from the original machine.

## Existing installations

Self-hosting adds account-management columns automatically on startup. Cloudflare previews need `drizzle/0003_chief_xorn.sql` applied once; hosted Sites applies it during publication. Existing accounts retain their passwords and scores. Accounts are managed in the database; there is no startup game YAML. The admin-saved challenge set takes precedence over the initial challenge YAML.

## Teams

Students create a team with a name and password, or join an existing team after signing in. Team passwords have 8–128 characters and are stored as salted hashes. Team names are unique ignoring case. Membership persists across logins; students cannot leave or switch teams. Only admins may disband a team, which releases its members to choose again without changing individual scores.

Admins use **Manage** in the game header. **Teams → Team size** (`/admin/teams/configuration`) sets the team limit. **Players & messages** (`/admin/teams/players`) controls player visibility and team messaging; **Scoreboard** (`/admin/teams/scoreboard`) controls ranking access and defaults. **Teams → Manage teams** (`/admin/teams`) shows teams, point gifts, and disband controls. Set the maximum team size from 1–100 (default 4). The creator and disabled members count toward capacity. Lowering the limit retains existing members but prevents joins to full teams. All management pages enforce admin authorization.

Use **Gift points** on a team to award 1–10,000 whole points with a required comment. Gifts count once toward the team total and remain separate from individual earned points. Members see **+N pts added** on the game screen; hover, focus, or tap to read the comment. Manage shows gift history. Full backups preserve gifts and comments. Disbanding a team removes its gifts; members retain individual progress.

Full backups include teams, team password hashes, memberships, and the saved size limit. Older backups without teams still restore successfully.

## Theme and content packs

Administrators can use **Manage → Theme → Import / Export** (`/admin/theme/import-export`) to export/import reusable themes separately from challenge content. Themes own map artwork/layout, entrances, characters/sprites, and MIDI; content owns challenge text/flags/points/hints/locations/downloads. Neither includes accounts or progress. Full backup still includes the complete system, including imported assets and the active theme. See [THEMES.md](THEMES.md) for formats, limits, authoring, and paired imports. Self-hosters must preserve `data/pack-assets` together with their SQLite database (the Docker data volume already covers it).

## Automatic and manual grading

Every challenge supports `grading: automatic` (the default) or `grading: manual`, selected with **Answer checking** in the challenge editor. Automatic challenges require accepted flags. Manual challenges accept a written response of up to 20,000 characters and do not require flags. Responses are private to the student and admins, can be updated until graded, and freeze new hint purchases once submitted.

Admins use `/admin/review` (**Manage → Review answers**) to award a whole-number grade from 0 to the submission's saved maximum and provide feedback. Recorded hint costs are subtracted, with a minimum final award of 0. Regrading updates the existing award and scoreboard. Response revisions prevent stale edits or grades from overwriting newer work. Full backups retain responses/grades/feedback; theme and content packs exclude them. Use new IDs for new tests; grading mode cannot be changed after responses or awards exist.

The built-in **Agentic Circuit** theme is available under **Theme → Theme library**. See [the course theme guide](themes/agentic-circuit/README.md) for activation, maps, and test preparation.

Full backups also retain the classroom player-visibility setting. Temporary online positions are excluded; players appear again as they reconnect. Older backups without starting positions or visibility settings use the theme’s default spawn and teammate visibility.

Full backups retain team-card feature switches and private team messages, including sender and recipient references. Restores preserve conversations; older backups start with an empty inbox and enabled team-card features. Treat these messages as student records when storing or sharing a full backup. Theme and content exports contain no team messages.

Full backups preserve the separate own-team and other-team permissions for names, scores, and messaging. Older backups without the other-team switches inherit their existing team switches for both scopes.

Full backups also preserve chat mute status, shared instructor conversations, discovered questions, and scoreboard settings. Older backups restore with unmuted accounts, empty discovery/instructor history, and the default public-to-players team scoreboard and individual admin view. Team point gifts and comments are preserved; older backups default to no gifts.

## Challenge dependencies

Challenge definitions preserve `dependsOn` prerequisites in YAML exports, content packs, and full backups. Old definitions default to no prerequisites. Restore and import validate IDs and reject dependency loops. If an import cannot place a prerequisite, its dependent chain is included in the overflow preview and excluded together when skipping is authorized. Players unlock challenges from their own completed progress; written prerequisites unlock after grading. Edit connections under **Challenges → Dependencies** and save to apply them to active games. Entity prerequisites use `npe:<entity-id>` references. Full backups retain both entity prerequisites and per-player entity activation history; legacy backups default to no activations. Theme/content imports validate the complete mixed graph against the resulting world. Removing a referenced entity requires removing its connections in Dependencies or importing matching content.

Standard CTFd prerequisites become native `dependsOn` connections on new imports and survive backup restore alongside original CTFd requirements and import history. Missing references retain the original requirements and keep the challenge hidden for review. Existing CTFd imports are not retroactively changed.
