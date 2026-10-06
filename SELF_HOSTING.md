# Run North Pole Quest on your own server

The standalone version needs no Cloudflare account, ChatGPT account, or external database. Use Node.js 24 LTS (recommended; minimum 22.13 for built-in SQLite). The same game UI and API rules are used by both hosting modes. A fresh self-hosted installation has its own scores and accounts; it does not import the hosted site's database.

## Quick start

From the `north-pole` directory:

```sh
npm ci
npm run build:selfhost
npm run start:selfhost
```

Open `http://localhost:3000`, or `http://YOUR-SERVER-IP:3000` from another machine. The server listens on all interfaces by default. These commands must run from the project directory. SQLite is initialized automatically in `data/quest.sqlite` and survives server restarts. There is no manual database migration step for this hosting mode. Keep the server running with your usual service manager.

## YAML configuration

Edit `content/game.yaml`. It is server-only and must never be placed in `public/`. Restart the standalone server after changing YAML; no frontend rebuild is required for names, credentials, challenges, sprite paths, or music paths. Existing sessions may retain access after a password change until their seven-day expiry; the next successful sign-in with the new password invalidates prior sessions for that account. To revoke every session immediately, stop the server and delete rows from the `sessions` table using SQLite.

```yaml
characters:
  - id: web
    name: Spider Explorer
    subtitle: Follow your curiosity.
    sprite: /sprites/spider.png
    fallback: web
  - id: thunder
    name: Thunder Explorer
    sprite: /sprites/thunder.png
    fallback: thunder
  - id: shield
    name: Shield Explorer
    sprite: null
    fallback: shield
accounts:
  allowRegistration: false
  users:
    - username: student01
      password: use-a-unique-password-here
      # No hero: the student chooses one at first sign-in.
    - username: student02
      password: use-another-unique-password
      hero: thunder
      # Assigned hero overrides the saved selection.
audio:
  midi: /audio/winter.mid
  loop: true
  volume: 0.15
```

Character IDs are stable lowercase letters/digits/hyphens and must be unique. Names and subtitles are displayed in the selector and explorer panel. You can add characters beyond the original three. Keep IDs unchanged after students begin playing. Removing a selected character blocks that account's next login until an available hero is assigned in YAML. An account's optional `hero` must match a roster ID.

`allowRegistration: false` allows only listed YAML users. Set it to `true` to also allow student-created accounts. Listed accounts are created on their first successful sign-in. Usernames are case-insensitive and use 3–24 letters, digits, underscores, or hyphens; passwords use 8–128 characters. The first selected hero remains bound to the account. An explicit YAML `hero` is authoritative. Changes to an existing username create a different account and do not transfer scores.

Passwords in your YAML are private server configuration. Keep that file outside publicly served directories and source repositories containing real credentials. SQLite stores salted PBKDF2 hashes, not plaintext passwords. Only character definitions and audio settings reach `/api/config`; usernames, passwords, and accepted answers do not. For a private local config outside Git:

```sh
cp content/game.yaml content/game.local.yaml
GAME_CONFIG=./content/game.local.yaml npm run start:selfhost
```

`content/game.local.yaml` is ignored by Git. Restrict its filesystem permissions as appropriate for the user running your server. The `.dockerignore` excludes environment files and `content/game.local.yaml`, but Docker needs access to configuration: use the runtime mount below for your real account list.

## Custom sprites

Place single-frame images in `public/sprites/`; a URL of `/sprites/spider.png` refers to `public/sprites/spider.png`. PNG or WebP with transparent backgrounds works best. Images render at 42 pixels tall on the map and 85 pixels tall in portraits, preserving aspect ratio. Use a roughly square 32×32 or 48×48 image with the feet near the bottom. Whole sprite sheets are not supported; export one standing frame first. `sprite: null`, or a failed image load, uses the selected `fallback` drawing (`web`, `thunder`, or `shield`). Sprite paths must be local URL paths beginning with `/`, not filesystem paths or external URLs.

## MIDI audio

Put your `.mid` or `.midi` file in `public/audio/` and set `audio.midi` to its URL, such as `/audio/winter.mid`. A short original demonstration file is included at `/audio/north-pole.mid`. `midi: null` disables music. `volume` is 0–1; `loop` controls repetition.

The header's speaker button enables music after a user gesture; the game begins muted to respect browser audio rules. Muting pauses the music; unmuting resumes it. Invalid/missing files display an error without stopping play. MIDI parsing uses [Tonejs/Midi](https://github.com/Tonejs/Midi). Playback uses MIDI timing and notes with a simple retro oscillator synthesizer, rather than a General MIDI soundfont, so the instruments will sound different from a desktop MIDI player. Files must be at most 5 MB, 100,000 notes, and 24 hours in duration. Long individual notes are capped at 60 seconds. Standard MIDI note/tempo tracks are supported; soundfonts and SysEx instrument definitions are not.

## Challenges

Continue editing `content/challenges.yaml`. The [challenge guide](CHALLENGES.md) documents text, accepted flags, case sensitivity, hints with point costs, and downloadable files; the [README](README.md) documents map locations. Restart the standalone server after edits. Hint costs reduce their own challenge’s reward and are recorded once per student. Locked hint text and accepted flags stay private. Existing completed IDs cannot earn a second reward; changing a reward does not retroactively change stored scores. The hint-purchase table is added automatically when an existing self-hosted installation starts.

## Server settings

| Environment variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | Listen address; use `127.0.0.1` behind a local proxy |
| `PORT` | `3000` | HTTP port |
| `DATABASE_PATH` | `data/quest.sqlite` | Persistent SQLite file |
| `GAME_CONFIG` | `content/game.yaml` | Server-only game YAML |
| `CHALLENGES_CONFIG` | `content/challenges.yaml` | Server-only challenges YAML |
| `PUBLIC_ORIGIN` | Incoming HTTP host | Exact browser origin behind a reverse proxy, e.g. `https://quest.school.org`; no trailing slash |
| `SECURE_COOKIES` | `false` | Set `true` when serving through HTTPS |

For an HTTPS reverse proxy, configure:

```sh
HOST=127.0.0.1 PORT=3000 \
PUBLIC_ORIGIN=https://quest.school.org SECURE_COOKIES=true \
GAME_CONFIG=./content/game.local.yaml npm run start:selfhost
```

Proxy the whole domain to the Node server, including `/api/`; serving only `selfhost/dist` omits authentication and score storage. Don't expose the project directory through a generic static web server. The standalone server serves only `public/` and built frontend files. Authentication requests have a limit of 20 per minute per direct connection IP; a reverse proxy shares that bucket unless it enforces its own per-student limit. The app intentionally does not trust forwarded IP headers.

## Docker

```sh
docker compose up --build -d
```

The included Compose file mounts `content/` and `public/` read-only, and keeps SQLite in the `quest-data` volume. Replace the account list in your mounted config, then run `docker compose restart quest`. Sprite/MIDI file replacements are read directly without rebuilds. To use `game.local.yaml`, add `GAME_CONFIG: /app/content/game.local.yaml` under `environment` in Compose. For HTTPS, set `PUBLIC_ORIGIN` and `SECURE_COOKIES=true` in the environment used by Compose. Never run `docker compose down -v` when you want to preserve scores.

## Backups and verification

Back up configuration, `public/sprites`, `public/audio`, and the SQLite database. Stop the service before copying its database (including any `-wal`/`-shm` files), or use SQLite's online backup mechanism. Keep `data/` writable by the server account. Build output is disposable and can be regenerated.

```sh
npm run build:selfhost
npm run test:selfhost
npx tsc --noEmit
```

Tests verify YAML-managed and assigned heroes, credential changes, persistence after restart, scoring, origin checks, and private-file protection. There is no password reset or teacher dashboard; teacher changes are made in YAML. Browser movement remains client-side, suitable for a classroom activity rather than competitive anti-cheat.

The existing Sites deployment is also supported with `npm run build`. In that mode, `content/game.yaml` and challenge YAML are bundled at build time, so edits require a new publication; the standalone runtime environment variables above apply only to your own Node server.
