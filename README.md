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
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_melodic_stephen_strange.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0003_chief_xorn.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0004_high_sentinels.sql
npm run dev
```

Apply each migration only once, in order, to a new local database. Existing preview databases need only the new migration. Open the URL printed by the development server. Production schema migrations are included in Sites publication. `npm run build` builds a Cloudflare Worker; the D1 binding is `DB`.

## Scoreboard, accounts, and backups

Students can view `/scoreboard`. Admins can manage accounts at `/admin/users` and download a full recreation ZIP with accounts and progress. See [BACKUPS.md](BACKUPS.md) for features, export contents, and restore commands.

## Admin challenge editor

Open `/admin` to view the full town and interiors, select locations, and create or edit challenges. Configure self-hosted administrators with `role: admin` in your private game YAML. The hosted owner can use trusted Sites sign-in. Saved edits persist in the database and can be exported as YAML. See [ADMIN_GUIDE.md](ADMIN_GUIDE.md).

## Add or edit challenges

The starting set comes from `content/challenges.yaml`; after the first admin save, the database-backed set is authoritative. The YAML supports challenge text, points, accepted flags, case sensitivity, multiple hints with costs, and downloadable files. See [CHALLENGES.md](CHALLENGES.md) for a complete YAML example, field definitions, scoring, and compatibility with the original format. Flags and locked hint text stay on the server.

Restart your standalone Node server after YAML changes. For Sites, rebuild and republish. Hint purchases persist once per student; costs reduce that challenge's reward. Existing completed challenges keep their saved scores.

## Map coordinates and locations

See [MAP_GUIDE.md](MAP_GUIDE.md) for the expanded town, Santa's castle, all house doors, interior coordinates, furniture collision, and placing treasures indoors. Walk into a lit doorway to enter, and through the southern door to exit. The map is 40 × 28 tiles; x increases east and y increases south. Challenge YAML's optional `map` defaults to `town`.

## Accounts and scope

Usernames are case-insensitive, 3–24 letters/digits/underscores/hyphens. Passwords have 8–128 characters and are stored as salted PBKDF2-SHA256 hashes (100,000 iterations). Random server sessions use HttpOnly, SameSite=Lax cookies with a seven-day expiry; HTTPS cookies are Secure. Hero selection and scoring are enforced on the server, and duplicate rewards are prevented with a database primary key. Writes check same-origin requests.

This version includes a teacher challenge editor; password recovery and account deletion UI are not included. The standalone server includes basic login rate limiting; the hosted version has no application-level limiter. Add those before a large public classroom rollout. Current hosted publication is private to the site owner; sharing access must be configured before students can visit. Hero designs and game artwork are original pixel-style interpretations rather than copied game assets. Movement is client-side; this is a learning game, not a competitive anti-cheat system.

An optional browser WebMCP `read_expedition` tool exposes the same visible position and score when the browser supports it. It never exposes passwords or answers.

## Teams

Students create a team with a name and password, or join an existing team after signing in. Team passwords have 8–128 characters and are stored as salted hashes. Team names are unique ignoring case. Membership persists across logins; students cannot leave or switch teams. Only admins may disband a team, which releases its members to choose again without changing individual scores.

Admins see **Manage** in the game header. `/admin/teams` links to challenges, accounts, and scores. Set the maximum team size from 1–100 (default 4, initially configured by `teams.maxMembers` in `content/game.yaml`). The creator and disabled members count toward capacity. Lowering the limit retains existing members but prevents joins to full teams. Team management routes enforce admin authorization.

Full backups include teams, team password hashes, memberships, and the saved size limit. Older backups without teams still restore successfully.
