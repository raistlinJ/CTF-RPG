# Scaling and repeatable load tests

The first scaling pass reduces recurring database work without changing chat access, personal mutes, or clear-history ownership.

- Active players receive notification summaries in the existing presence response. Users who have not joined a team still receive standalone notification polling.
- Presence, notification fallback, and open chat polling pause in hidden tabs. Polls wait for completion before scheduling another request, add a small randomized delay, abort stalled requests, and back off after errors to a maximum 30-second retry interval.
- Shared team scores, solve counts, and raw incoming chat aggregates use a per-database cache, bounded to 128 entries with a two-second lifetime. Write requests invalidate shared aggregates before and after dispatch. Ephemeral presence updates do not invalidate them. Each process has its own cache; writes through another process may take up to two seconds to appear in shared totals.
- Authentication, account/team restrictions, notification audiences, personal mutes, individual progress, and personal chat cutoffs are read for each request. Scoreboard and administrative score views continue to read fresh totals.
- Admin chat pages use snapshot cursors with timestamp, source, and ID tie breakers. Each source supplies only the next page before the two sources are merged. Exact unfiltered totals count the indexed source tables without joining every message to accounts and teams. The older offset API remains supported, but the UI uses cursors.
- Native sign-in protection separates a shared-network limit of 500 attempts per minute from 20 attempts per account/IP per minute. Usernames are normalized, malformed account names do not create account buckets, and forwarded IP headers are not trusted. This permits classmates behind one network/proxy to sign in without exhausting a single 20-attempt bucket.

## Applying the change

Rebuild and restart the native application or Docker image. Native SQLite initialization creates the new indexes automatically. Existing D1 installations must apply `drizzle/0030_social_performance.sql`, after earlier migrations. The migration adds indexes for global chat ordering, session lookups by user/expiration, solve counts by challenge, and notification ordering. No message or account data is removed.

## Running the load test

From the project directory, after building the frontend:

```sh
npm run load-test -- --users=50,100,250 --duration=30 --messages=100000 --chat-ratio=1 --out=/tmp/ctf-load.json
```

Run this command on the remote host to measure that machine. It starts a separate copy of the actual native HTTP server on a random loopback port, creates a temporary SQLite database and asset directory, and cleans them up afterward. Existing `DATABASE_PATH`, `ASSET_PATH`, public origin, and cookie settings are overridden only for the child process. It never connects to a production URL or changes production accounts, messages, or assets. It still consumes host CPU and disk, so use a quiet period on a shared production host.

The dataset contains four-person teams, saved scores, 100 notifications, and the requested number of team/instructor messages. Some users have personal mute or clear settings. Each phase simulates the requested number of active students, presence updates every three seconds, open chat reads every five seconds, occasional team/instructor sends, and answer submissions. A separate administrator browses chat history. All actors begin with seeded sessions; sign-in bursts are tested separately in the automated tests.

Options use `--name=value` syntax:

| Option | Default | Meaning |
| --- | --- | --- |
| `users` | `50,100,250` | Active student counts, run sequentially |
| `duration` | `30` | Seconds per phase |
| `messages` | `100000` | Total historical team and instructor messages |
| `chat-ratio` | `1` | Fraction of users with an open chat, from 0 to 1 |
| `out` | none | Optional JSON report path |

The report records achieved requests/second, HTTP errors, per-endpoint p50/p95/p99 latency, server CPU consumption as a percentage of one core, event-loop utilization and delay, and resident memory. Any request error gives the runner a nonzero exit status. There are no universal latency thresholds: choose acceptable response times for your assignment and compare repeated runs on the target host.

These are native-server HTTP measurements over loopback. They exclude browser rendering, asset/video downloads, Internet latency, password verification bursts, and Cloudflare D1 performance. The initial benchmark uses one challenge; larger challenge catalogs and customized themes should also be measured before making a capacity commitment.

## Recorded baseline

The final local run used an Apple M4 Max, Node v25.5.0, 250 seeded students in 63 teams, 100,000 historical messages, 100 notifications, and one challenge. Each phase lasted 20 seconds with all simulated students opening chat. The load driver and isolated server ran on the same machine. The reported chat endpoint combines reads and sends.

| Active students | Requests | Errors | Presence p95 | Chat p95 | Server CPU, one-core basis |
| --- | --- | --- | --- | --- | --- |
| 50 | 574 | 0 | 18.31 ms | 19.91 ms | 25.6% |
| 100 | 1112 | 0 | 14.60 ms | 16.27 ms | 38.6% |
| 250 | 2853 | 0 | 26.85 ms | 27.90 ms | 75.9% |

The 250-user phase achieved 142.16 requests/second with approximately 306 MiB server resident memory. Admin history p95 was 11.91 ms, based on only two samples in that phase. This is a short functional/performance baseline, not a remote capacity guarantee or a long-running soak test. Full measurements, hardware, and scope are saved in [build/scaling-load-test.json](build/scaling-load-test.json).

## Larger deployments

The first pass retains literal substring search. Searching large histories and calculating exact filtered counts still require scanning relevant messages. Full-text search is a later option if measurements show admin searches are slow. Users clearing their own chats retain the underlying history; choose an archive/retention policy per course rather than assuming personal clears reclaim storage. No automatic retention or deletion policy is enabled.

The native server still uses synchronous SQLite operations in one Node process. For substantially larger deployments, use the load report to decide whether database work should move off the event loop, push updates should replace polling, or a different database architecture is warranted.
