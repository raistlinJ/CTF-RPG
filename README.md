# North Pole Quest

A playable overhead winter RPG for students. Choose a superhero-inspired Web Ranger, Thunder Knight, or Shield Sentinel when creating an account. That selection is bound to the account unless the teacher assigns a different hero in YAML. Explore with arrow keys or WASD, and press E (or tap Search nearby) within two tiles of a treasure. Correct answers award points once; points and heroes persist in the server database. Mobile direction controls are included.

## Run on your own server

Use the standalone Node/SQLite option described in [SELF_HOSTING.md](SELF_HOSTING.md). Character names, sprite images, YAML-managed student accounts, and MIDI background music are configured in `content/game.yaml`. For a quick start: `npm ci`, `npm run build:selfhost`, then `npm run start:selfhost`.

## Run the Cloudflare preview locally

Requires Node 22.13+.

```sh
npm ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_long_matthew_murdock.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_white_maria_hill.sql
npm run dev
```

Apply each migration only once, in order, to a new local database. Existing preview databases need only the new migration. Open the URL printed by the development server. Production schema migrations are included in Sites publication. `npm run build` builds a Cloudflare Worker; the D1 binding is `DB`.

## Add or edit challenges

Edit `content/challenges.yaml`. It supports challenge text, points, accepted flags, case sensitivity, multiple hints with costs, and downloadable files. See [CHALLENGES.md](CHALLENGES.md) for a complete YAML example, field definitions, scoring, and compatibility with the original format. Flags and locked hint text stay on the server.

Restart your standalone Node server after YAML changes. For Sites, rebuild and republish. Hint purchases persist once per student; costs reduce that challenge's reward. Existing completed challenges keep their saved scores.

## Map coordinates and locations

The map is 40 columns × 28 rows. Coordinates are zero-based from the top left: x increases east, y increases south. The player's coordinates appear at the lower left. Students start at (18,20). Treasure interactions use Manhattan distance ≤2. Place objects on accessible ground or within two tiles of it.

| Region | Suggested placement |
| --- | --- |
| Evergreen Grove | x 6–12, y 7–10 (example: 8,8) |
| Santa's Workshop | x 15–22, y 7–9 (example: 20,7) |
| Aurora Ridge | x 26–32, y 7–10 (example: 29,8) |
| Lantern Lane | x 8–15, y 17–21 (example: 11,19) |
| Frostbite Lake shore | x 32–33, y 18–23 (example: 32,20) |

Buildings block (15–21,3–6), (8–12,12–15), (25–29,11–14). The lake blocks (23–31,17–23). Outer map borders and tree tiles are blocked. The `trees`, `buildings`, and `blocked()` definitions in `app/page.tsx` define these map features. Avoid placing objects more than two accessible tiles inside obstacles. The region field is a text clue, not a separate map or teleport.

## Accounts and scope

Usernames are case-insensitive, 3–24 letters/digits/underscores/hyphens. Passwords have 8–128 characters and are stored as salted PBKDF2-SHA256 hashes (100,000 iterations). Random server sessions use HttpOnly, SameSite=Lax cookies with a seven-day expiry; HTTPS cookies are Secure. Hero selection and scoring are enforced on the server, and duplicate rewards are prevented with a database primary key. Writes check same-origin requests.

This basic version has no password recovery, teacher administration, account deletion UI. The standalone server includes basic login rate limiting; the hosted version has no application-level limiter. Add those before a large public classroom rollout. Current hosted publication is private to the site owner; sharing access must be configured before students can visit. Hero designs and game artwork are original pixel-style interpretations rather than copied game assets. Movement is client-side; this is a learning game, not a competitive anti-cheat system.

An optional browser WebMCP `read_expedition` tool exposes the same visible position and score when the browser supports it. It never exposes passwords or answers.
