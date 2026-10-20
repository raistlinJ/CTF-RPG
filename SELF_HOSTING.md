# Run CTF-RPG on your own server

The standalone version needs no Cloudflare account, ChatGPT account, or external database. Use Node.js 24 LTS (recommended; minimum 22.13 for built-in SQLite). The same game UI and API rules are used by both hosting modes. A fresh self-hosted installation has its own scores and accounts; it does not import the hosted site's database.

## Quick start

From the `north-pole` directory:

```sh
cp .env.sample .env
# Edit .env: choose ADMIN_USERNAME and ADMIN_PASSWORD before first launch.
npm ci
npm run build:selfhost
npm run start:selfhost
```

Open `http://localhost:3000`, or `http://YOUR-SERVER-IP:3000` from another machine. The server listens on all interfaces by default. These commands must run from the project directory. SQLite is initialized automatically in `data/quest.sqlite` and survives server restarts. There is no manual database migration step for this hosting mode. Keep the server running with your usual service manager.

## Administrator and game configuration

`content/game.yaml` is no longer used. Copy `.env.sample` to `.env` in the project root and set:

```dotenv
ADMIN_USERNAME=ctf-admin
ADMIN_PASSWORD='choose-a-unique-password'
```

The protected username is required and uses 3–24 letters, numbers, underscores or hyphens. Its account cannot be deleted, disabled or demoted, even in a bulk operation. The password must have 8–128 characters when creating the account. Existing accounts keep their database password; changing `ADMIN_PASSWORD` does not reset it. Reset passwords in **Manage → Users**. The root `.env` is read automatically by native Node and Docker Compose. Quote values containing spaces or `#`; single quotes keep `$` literal in Compose. Do not commit your real `.env`.

Sign in using the configured account. Administrator access follows the account's admin role in both hosting modes; platform email headers do not grant management privileges. Create/promote additional admins through **Manage → Users**. Hosted Sites supplies `ADMIN_USERNAME` and `ADMIN_PASSWORD` as server-side runtime environment values rather than a local file.

Manage accounts, registration, spawn points, teams, visibility and messaging through the admin UI. **Theme → Appearances** supplies every player appearance available at the start. Users choose their character on first sign-in, including accounts created in the admin UI; later sign-ins retain the saved character. Administrators use the reserved admin appearance in the game. Existing character choices and progress survive upgrades.

Theme imports/exports contain characters, maps and audio. Settings and account passwords are persisted in the database. There is no YAML account roster or platform-email admin allowlist to maintain.

## MIDI audio

Upload `.mid` or `.midi` files under **Theme → Media Library → Music**. Assign tracks to maps under **Theme → Sounds → Map music**; set volume and playlist repetition in the media library; tracks shuffle as they play. A short original demonstration file is included at `/audio/north-pole.mid`. The library supports 100 tracks and uploads of up to 100 files at once, with no application-level per-file or combined MIDI byte limit. The bundled HTTPS proxy also accepts unlimited request sizes on the music-upload endpoint. Any additional reverse proxy or hosting provider must allow the desired request size. Remove tracks to disable music.

Sound starts enabled. Background music starts immediately when the browser permits autoplay; otherwise it begins on the first click, tap, or keypress, including character selection or sign-in. The header's speaker button mutes or enables music and sound effects, even when no MIDI is configured. Muting pauses the music; unmuting resumes it. Background music pauses during cutscenes and resumes when sound is enabled. Invalid/missing files display an error without stopping play. MIDI parsing uses [Tonejs/Midi](https://github.com/Tonejs/Midi). Playback uses MIDI timing and notes with a simple retro oscillator synthesizer, rather than a General MIDI soundfont, so the instruments will sound different from a desktop MIDI player. Files must contain playable notes. Long individual notes are capped at 60 seconds. Theme ZIP exports/imports still have a separate 32 MB archive budget, and full backups retain their 64 MB budget; these do not limit direct music uploads or map editing. Standard MIDI note/tempo tracks are supported; soundfonts and SysEx instrument definitions are not.

## Challenges

Use the `/admin` challenge studio or edit the initial `content/challenges.yaml`. After the first admin save, the database-backed set becomes authoritative; export YAML from the studio for a portable copy. The [challenge guide](CHALLENGES.md) documents text, accepted flags, case sensitivity, hints with point costs, and downloadable files; the [README](README.md) documents map locations. Restart the standalone server after edits. Hint costs reduce their own challenge’s reward and are recorded once per student. Locked hint text and accepted flags stay private. Existing completed IDs cannot earn a second reward; changing a reward does not retroactively change stored scores. The hint-purchase table is added automatically when an existing self-hosted installation starts.

## Server settings

| Environment variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | Listen address; use `127.0.0.1` behind a local proxy |
| `PORT` | `3000` | HTTP port |
| `DATABASE_PATH` | `data/quest.sqlite` | Persistent SQLite file |
| `ADMIN_USERNAME` | Required | Protected administrator username |
| `ADMIN_PASSWORD` | Required for a new admin | Initial password; existing database passwords are preserved |
| `CHALLENGES_CONFIG` | `content/challenges.yaml` | Server-only challenges YAML |
| `PUBLIC_ORIGIN` | Incoming HTTP host | Exact browser origin behind a reverse proxy, e.g. `https://quest.school.org`; no trailing slash |
| `SECURE_COOKIES` | `false` | Set `true` when serving through HTTPS |

For an HTTPS reverse proxy, configure:

```sh
HOST=127.0.0.1 PORT=3000 \
PUBLIC_ORIGIN=https://quest.school.org SECURE_COOKIES=true \
npm run start:selfhost
```

Proxy the whole domain to the Node server, including `/api/`; serving only `selfhost/dist` omits authentication and score storage. Don't expose the project directory through a generic static web server. The standalone server serves only `public/` and built frontend files. Authentication requests have a limit of 20 per minute per direct connection IP; a reverse proxy shares that bucket unless it enforces its own per-student limit. The app intentionally does not trust forwarded IP headers.

## Docker Compose

For first-time setup, copy the documented sample settings and edit `.env`:

```sh
cp .env.sample .env
```

Set `ADMIN_USERNAME` and `ADMIN_PASSWORD` in `.env`. The sample also covers app binding/ports, `PUBLIC_ORIGIN`, secure cookies, HTTPS proxy ports and the optional certificate hostname. Real `.env` files stay excluded from Git and recreation exports; `.env.sample` travels with the project. Native Node also reads the root `.env`; `HOST`/`PORT` configure its listener, while `APP_BIND`/`APP_PORT` configure Compose.

From the project directory, start the app over HTTP:

```sh
docker compose up --build -d
```

Open `http://localhost:3000`. The default port binds to loopback. For direct HTTP access from other computers, use `APP_BIND=0.0.0.0 docker compose up --build -d`; set `APP_PORT` to change port 3000. Manage accounts through **Manage → Users** after signing in as the protected admin.

To run Docker on port 3001 and rebuild after application changes:

```sh
APP_PORT=3001 docker compose up -d --build ctf-rpg
```

Open `http://localhost:3001`. After changing `.env`, recreate the container with `docker compose up -d ctf-rpg`; `restart` alone does not apply changed environment values. You can also save `APP_PORT=3001` in your local `.env` file.

The `ctf-rpg` service mounts `content/` and `public/` read-only. SQLite and uploaded pack assets persist in the `quest-data` volume; the legacy volume name is retained for compatibility. After editing the initial challenge YAML, run `docker compose restart ctf-rpg`. Sprite/MIDI files are read directly. Do not run `docker compose down -v` on your installation when you want to preserve accounts and scores. When upgrading from the old `quest` service, stop the old Compose stack without `-v`, keep the same directory/project name, then start this configuration so it reuses the existing data volume.

### Optional Nginx HTTPS frontend

```sh
docker compose -f compose.https.yaml up --build -d
```

Open `https://localhost`. This file starts the app and Nginx together, redirects port 80 to HTTPS, and enables secure session cookies. It inherits the app's build, health check, port configuration and mounts from `compose.yaml` using [Docker Compose extends](https://docs.docker.com/compose/how-tos/multiple-compose-files/extends/). The app's port 3000 defaults to loopback; Nginx listens publicly on the configured HTTP/HTTPS ports. Nginx waits for the app health check and proxies both pages and `/api/`. Keep both Compose files in the checkout; specifying `-f compose.yaml -f compose.https.yaml` also works. Both commands reuse the same `quest-data` volume when run from the same directory/project.

For a real hostname, place the following in your ignored `.env` before starting:

```dotenv
PUBLIC_ORIGIN=https://ctf.example.org
```

`PUBLIC_ORIGIN` must match the browser's exact HTTPS origin, without a trailing slash. If using another public port, include it (for example `https://localhost:8443`) and set `HTTPS_PORT=8443`. `HTTP_PORT` changes the redirect listener's default port 80. When specifying nondefault ports in shell variables, pass them for every Compose command or store them in `.env`.

Mount certificates using the project's **`./nginx/ssl`** directory:

- `fullchain.pem`: your certificate plus any intermediate chain.
- `privkey.pem`: the matching, unencrypted private key.

When neither file exists, the Nginx startup script generates a 365-day self-signed pair for the hostname/IP in `PUBLIC_ORIGIN`. An optional `TLS_SERVER_NAME` overrides the generated certificate hostname. Certificates are persisted in that mount and reused on restart; existing pairs are never replaced. If only one file exists or is empty, startup stops with an explanation instead of overwriting it. Generated certificates include SANs for the chosen host, localhost, and 127.0.0.1. Self-signed certificates display a browser trust warning until you trust them; use your own trusted certificate pair for public hosting. After replacing certificates, restart the proxy:

```sh
docker compose -f compose.https.yaml restart nginx
```

TLS keys and certificates are excluded from Git, both Docker build contexts, and application recreation exports. Keep them separately on your server. The certificate mount must be writable for automatic generation. The HTTPS frontend implements Nginx's [certificate and key configuration](https://nginx.org/en/docs/http/configuring_https_servers.html).

Inspect logs or stop the HTTPS stack with the same file:

```sh
docker compose -f compose.https.yaml logs --tail=100
docker compose -f compose.https.yaml down
```

## Backups and verification

Back up configuration, `public/sprites`, `public/audio`, and the SQLite database. Stop the service before copying its database (including any `-wal`/`-shm` files), or use SQLite's online backup mechanism. Keep `data/` writable by the server account. Build output is disposable and can be regenerated. Entity activation, cutscene playback history, inventory, and transport unlocks live in the same database as challenge progress. SQLite creates new tables automatically when the upgraded application starts; Cloudflare/D1 installations need migrations through `0028_personal_chat_mutes.sql`, as listed in [README.md](README.md#run-the-cloudflare-preview-locally).

```sh
npm run build:selfhost
npm run test:selfhost
npx tsc --noEmit
```

Tests verify root .env startup without game YAML, first-login characters, account roles, credential changes, persistence after restart, scoring, origin checks, and private-file protection. The `/admin` challenge studio is documented in [ADMIN_GUIDE.md](ADMIN_GUIDE.md). Configure `ADMIN_USERNAME` and the initial `ADMIN_PASSWORD` in the root `.env`. The Users screen manages users and resets passwords. Complete recreation exports and restore instructions are in [BACKUPS.md](BACKUPS.md). Browser movement remains client-side, suitable for a classroom activity rather than competitive anti-cheat.

The existing Sites deployment is also supported with `npm run build`. In that mode, the initial challenge YAML is bundled at build time. Configure the protected admin with server-side `ADMIN_USERNAME` and `ADMIN_PASSWORD` runtime environment values. Account admin roles authorize management; platform email headers do not bypass the game login.

## Theme and content packs

Administrators can use **Manage → Theme → Import / Export** (`/admin/theme/import-export`) to export/import reusable themes separately from challenge content. Themes own map artwork/layout, entrances, characters/sprites, and MIDI; content owns challenge text/flags/points/hints/locations/downloads. Neither includes accounts or progress. Full backup still includes the complete system, including imported assets and the active theme. See [THEMES.md](THEMES.md) for formats, limits, authoring, and paired imports. Self-hosters must preserve `data/pack-assets` together with their SQLite database (the Docker data volume already covers it).
