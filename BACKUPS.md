# Scoreboard, users, and complete backups

## Scoreboard

Open `/scoreboard` or **Scores** from the game. Signed-in students and authorized hosted admins can view it. Scores are the stored points actually awarded after hint costs, with completed-treasure counts and assigned character names. Ties share competition ranks (1, 1, 3); equal scores are ordered by username. Admins and disabled accounts are excluded. Configured student accounts that have not played yet appear with zero points. Refresh scores, reload, or return focus to the scoreboard to update it.

## User management

Open `/admin/users` or **Accounts** in the challenge studio. Authorized admins can:

- Create student or administrator accounts with an assigned character and password.
- Change an existing account's role and assigned character.
- Reset a password; the previous password stops working and existing sessions are revoked.
- Disable an account, blocking access and removing it from the scoreboard, or reactivate it with its progress intact.

Usernames stay fixed to preserve account identity and scores. Saving a YAML account in the studio makes its credentials, role, and hero database-managed; later YAML changes do not override that managed account. Studio-created or managed accounts can sign in even with open registration disabled. Student self-registration never grants admin privileges. All API actions check the current role and disabled state on the server. Admins using a local admin account cannot disable or demote themselves; trusted platform-owner access remains independent.

The user list never exposes passwords or hashes. Leaving the password field empty on an edit preserves it. Changes use revisions to reject stale simultaneous edits. Disabling is reversible and keeps history; this interface does not permanently erase accounts or progress.

## Full export

Use **Full backup** in either admin screen. `/api/admin/backup` is admin-only and downloads a ZIP containing:

- Application source, the ready-built standalone frontend, Node server, dependency lockfile, and hosting instructions.
- All local public assets included in the hosted build; on your own server, current files in `public/` are also collected at export time. This covers sprites, MIDI audio, and local challenge downloads.
- Effective `content/game.yaml` configuration and the current challenge set, including flags, hints, costs, and file links.
- Every account, including YAML accounts that have not signed in, roles, assigned heroes, disabled state, salted password hashes, and account IDs.
- Awarded scores/completions and purchased hints with their recorded costs.
- `backup.json`, the restore program, and a short `RESTORE.md` guide.

Existing passwords work after restore. Plaintext account passwords are converted to salted hashes; raw account passwords and active login sessions are not exported. External file URLs are preserved as links and remain dependent on their external hosts. The export removes the original Sites project ID, so recreating it does not point at the original site's deployment. Environment secrets, machine-specific settings, and installed `node_modules` are excluded; use the supplied lockfile to install dependencies.

Keep backups private: account hashes, student records, accepted flags, and hint text are sensitive. This is separate from **Export YAML**, which exports only challenge definitions. The ZIP's expanded package is limited to 32 MB, with a 24 MB source/asset seed limit; oversized packages fail rather than silently omitting files. Compression uses [fflate](https://github.com/101arrowz/fflate).

## Recreate on a fresh server

Extract the ZIP into a new directory. With Node.js 24 installed:

```sh
npm ci
npm run restore -- backup.json
npm run start:selfhost
```

Open `http://localhost:3000`. The ready-built game is included, so a frontend build is not needed merely to run the restored application. You can edit the included source and run `npm run build:selfhost` later. The restore initializes a new SQLite database, restores account IDs and progress, writes the exported configuration, and activates the exported challenge catalogue. Every visitor must sign in again.

If the source site's only admin was its platform owner, you can promote an existing exported player during the first restore:

```sh
npm run restore -- backup.json --admin teacher01
```

That player keeps their password and gains local admin access. If no account exists yet, add a new account with `role: admin` and a unique password to the restored `content/game.yaml` before starting, following [ADMIN_GUIDE.md](ADMIN_GUIDE.md).

The restore refuses to replace a populated database by default. When you explicitly intend to replace its accounts and progress, stop the game server, back up that database, then use:

```sh
npm run restore -- backup.json --replace
```

Use `DATABASE_PATH` to select a different database path. Configuration is written to `content/game.yaml` and `content/challenges.yaml` in the recreated application. Restore on the host before mounting configuration read-only in Docker. Reconfigure the new server's hostname, port, HTTPS proxy, and secure cookies using [SELF_HOSTING.md](SELF_HOSTING.md); these deployment choices are not carried over from the original machine.

## Existing installations

Self-hosting adds account-management columns automatically on startup. Cloudflare previews need `drizzle/0003_chief_xorn.sql` applied once; hosted Sites applies it during publication. Existing accounts retain their passwords and scores. Initial YAML remains supported; database-managed accounts and the admin-saved challenge set take precedence after studio edits.
