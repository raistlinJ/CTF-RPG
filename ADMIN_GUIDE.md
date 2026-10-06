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

Keep your existing character, audio, and other configuration. Student is the default role. Only accounts explicitly designated in server-side YAML become admins; registering an account cannot grant admin privileges. Admin sign-in uses the same salted password hashes and server sessions as the game. Removing `role: admin` revokes management access on subsequent API requests, even for an existing session.

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

Concurrent admin saves use a revision check. If another admin saves first, your draft is preserved and the request is rejected with a clear message. **Reload saved version** loads the current definition before you reapply changes; it asks before discarding your unsaved draft. This first management interface creates and edits challenges; it does not delete student progress, upload files, or manage accounts.
