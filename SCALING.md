# Scaling and repeatable load tests

The first scaling pass reduces recurring database work without changing chat access, personal mutes, or clear-history ownership.

- Active players receive notification summaries in the existing presence response. Users who have not joined a team still receive standalone notification polling.
- Presence, notification fallback, and open chat polling pause in hidden tabs. Polls wait for completion before scheduling another request, add a small randomized delay, abort stalled requests, and back off after errors to a maximum 30-second retry interval.
- Shared team scores, solve counts, and raw incoming chat aggregates use a per-database cache, bounded to 128 entries with a two-second lifetime. Write requests invalidate shared aggregates before and after dispatch. Ephemeral presence updates do not invalidate them. Each process has its own cache; writes through another process may take up to two seconds to appear in shared totals.
- Authentication, account/team restrictions, notification audiences, personal mutes, individual progress, and personal chat cutoffs are read for each request. Scoreboard and administrative score views continue to read fresh totals.
- Admin chat pages use snapshot cursors with timestamp, source, and ID tie breakers. Each source supplies only the next page before the two sources are merged. Exact unfiltered totals count the indexed source tables without joining every message to accounts and teams. The older offset API remains supported, but the UI uses cursors.
- Native sign-in protection separates a shared-network limit of 500 attempts per minute from 20 attempts per account/IP per minute. Usernames are normalized, malformed account names do not create account buckets, and forwarded IP headers are not trusted. This permits classmates behind one network/proxy to sign in without exhausting a single 20-attempt bucket.

## Applying the change

Rebuild and restart the native application or Docker image. Native SQLite initialization creates the new indexes automatically. Existing D1 installations must apply `drizzle/0030_social_performance.sql` and `drizzle/0031_notification_revisions.sql`, after earlier migrations. The migration adds indexes for global chat ordering, session lookups by user/expiration, solve counts by challenge, and notification ordering. No message or account data is removed.

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

## Second performance pass

The earlier MIDI expansion is reverted: the music library allows 20 tracks, 20 files per batch, 5 MB per MIDI, and a 32 MB total theme asset budget. These limits also apply to playback and archive imports. Previously saved libraries of up to 100 tracks remain readable and can be backed up; no tracks are automatically deleted. Reduce such a library to 20 tracks before saving it under the restored limits.

1. **Host measurements:** the runner now accepts an actual challenge catalog and theme, cold media traffic, a login burst, and a database execution mode. Local comparison reports are listed below. Remote-host measurements are recorded below; capacity beyond the tested scenarios remains unverified.
2. **Media handling:** native multipart requests are staged to private temporary files with bounded streaming and cleanup on success, overflow, or disconnect. Multipart decoding and per-file validation still require memory, bounded by the restored limits. Stored asset downloads stream directly from disk. Asset reads/writes use asynchronous file I/O. Map edits validate and commit catalogs directly, without ZIP roundtrips or rewriting unchanged assets. Metadata checks retain the theme byte budget. Audio saves reuse the digest in immutable uploaded asset paths rather than rehashing every saved track.
3. **Polling:** team setup and player details now use the same serial, abortable, visibility-aware polling helper as presence/chat, including backoff and jitter.
4. **Repeated processing:** parsed theme drafts are cached per database/configuration/payload/revision. Every request still checks the current database row; callers receive isolated copies. Native prepared statements use a bounded 256-entry LRU cache.
5. **History:** native SQLite adds FTS5 trigram indexes for chat sender/message text when supported. Search still uses literal substring semantics, includes current account/team names, and falls back to the original query for short/non-ASCII searches or hosted adapters. Triggers maintain the indexes on edits/deletions. Notification summaries use bounded per-user caches with database revision tokens checked on every request, including changes from another connection. Permissions and audiences remain authoritative. The retention command below is explicit maintenance, with no automatic deletion policy.
6. **Architecture:** `DATABASE_EXECUTION=worker` moves native SQLite work to one persistent worker thread, including whole batch transactions and statement caching. `main` remains the default. Compare both modes on the deployment host before enabling the worker; IPC and extra message roundtrips can outweigh the benefit for short queries. Push updates and a database migration remain conditional on measured limits; neither is required just to enable these optimizations.

Native startup installs derived indexes/triggers and rebuilds new search indexes once for existing chat history. Large histories can make the first upgraded startup slower. Hosted D1 uses the original chat-search fallback and gains notification caching after migration 0031. Search indexes and revision counters are derived; ordinary full backup restoration recreates them.

## Realistic tests and execution modes

```sh
npm run load-test -- --users=250 --duration=120 --messages=100000 \
  --catalog=content/challenges.yaml --media-ratio=0.2 \
  --login-burst=100 --login-concurrency=25 --search=9999 \
  --db-mode=main --out=/tmp/ctf-main.json
```

For Docker, run the same command through `docker compose exec ctf-rpg npm run load-test -- ...`; the image includes the load runner and archive utility. Repeat with `--db-mode=worker` and a different report path. Run comparisons serially on a quiet host. To test a customized world, add `--theme=/path/theme.yaml`; it may also be JSON. For hashed assets referenced by that theme, add `--assets-from=/path/pack-assets`. Only referenced uploaded assets are copied into the disposable asset directory. The runner never opens the configured production database, and theme/catalog inputs are read-only. Startup environment overrides apply to the child test server only.

| Extra option | Default | Meaning |
| --- | --- | --- |
| `catalog` | one synthetic challenge | Read-only challenge YAML to seed the disposable server |
| `theme` | bundled startup theme | Read-only theme YAML/JSON manifest |
| `assets-from` | none | Read-only source for referenced uploaded theme assets |
| `media-ratio` | `0` | Fraction of simulated users downloading cold local assets every 30 seconds |
| `login-burst` | `0` | Number of real password logins before gameplay; at most the largest user phase |
| `login-concurrency` | `25` | Maximum concurrent login requests |
| `db-mode` | `main` | Isolated server database execution: `main` or `worker` |
| `search` | none | Literal search used by the simulated admin chat browser |

Reports separate login latency/statuses from gameplay phases and include downloaded response bytes. Normal gameplay still uses pre-authenticated fixture sessions, so login errors cannot silently remove users from the workload. Rate-limit responses count as errors and are visible in the report. Media traffic simulates cold downloads; it does not model browser caching, MIDI synthesis, rendering, or real Internet latency.

## Explicit social-history retention

Retention defaults to **keep everything**. Personal chat clears only hide history and do not reclaim storage. To archive a previous course, choose an explicit UTC cutoff and first preview the counts:

```sh
npm run archive:social -- --database=/path/quest.sqlite --before=2026-01-01T00:00:00Z
```

During a maintenance window, repeat with `--apply --archive=/safe/location/course-social.jsonl`. The command acquires the database write lock, writes a private JSON-lines archive and flushes it before deletion, and commits the selected messages/notifications and associated recipient/read cleanup in one transaction. Failure to create the archive rolls back the operation; existing archives are never overwritten. Newer history, accounts, teams, scores, and personal mute/clear settings are retained. Stop the application for this maintenance window to avoid user writes waiting on the archive operation. No retention has been applied to production by this change.

Deletion makes SQLite pages reusable; it does not automatically shrink the database file. Back up the database and plan separate offline compaction if physical disk reclamation is required. Archives contain private chat/notification content and should be stored accordingly.


## Recorded second-pass comparison

These serial local runs used the same Apple M4 Max/Node v25.5.0, 250 simulated students, 63 teams, 100,000 historical messages, 100 notifications, the seven challenges in `content/challenges.yaml`, all users opening chat, and 20% downloading cold media. Each gameplay phase lasted 30 seconds and followed a burst of 100 real logins at concurrency 25. Admin history used literal search `9999`. The before run used server source from commit `1499732` with the same extended load driver and frontend artifacts. This compares the actual earlier implementation with the current one under the same workload; it is separate from the older one-challenge baseline above.

| Version / execution | Errors | Presence p95 | Chat p95 | Admin search p95 | CPU, one-core basis | RSS |
| --- | --- | --- | --- | --- | --- | --- |
| Before (1499732) | 0 | 30.01 ms | 29.56 ms | 209.56 ms | 75.5% | 379 MiB |
| After, main | 0 | 9.72 ms | 11.53 ms | 12.28 ms | 47.5% | 265 MiB |
| After, worker | 0 | 12.42 ms | 14.68 ms | 6.22 ms | 55.1% | 296 MiB |

The main-mode comparison reduced measured CPU by about 37% and presence/chat p95 by about 68%/61%. The indexed admin search used only three samples per run, so its improvement is directional rather than a stable percentile estimate. Login p95 was 179.73 ms before, 68.21 ms after/main, and 75.72 ms after/worker. All login and gameplay requests succeeded. These are individual short local runs, not replicated remote capacity measurements.

Worker mode reduced main-thread event-loop utilization (about 45% to 16%) but increased total CPU and ordinary request latency relative to optimized main mode. Keep `main` as the default for this measured workload. Push delivery or a database migration would add complexity without evidence of a current capacity need; reevaluate on the deployment host or when class size/workload grows.

Reports: [before](build/scaling-second-pass-before.json), [after/main](build/scaling-second-pass-main.json), [after/worker](build/scaling-second-pass-worker.json).

A follow-up **120-second main-mode run** with the same workload completed **17,060 gameplay/media requests and 100 logins with zero errors**. Presence p95 was 10.49 ms, chat p95 was 12.35 ms, CPU averaged 48.2% of one core, and final RSS was 273 MiB. This longer stability check is still shorter than a full class session. See [the 120-second report](build/scaling-second-pass-soak.json). The remote deployment was subsequently tested separately, as recorded below.


## Remote deployment measurements

The deployment host `arlsouth5.utep.edu` was tested using its AMD Opteron 6238 system (24 logical CPUs, approximately 63 GiB RAM), Linux x64, and its existing Node v24.22.0 runtime image. Production was idle at inspection and remained healthy throughout these isolated runs. The deployed image ID is recorded in each report; the checkout was at `d977ba8`.

The comparison used the actual active Environment Development assignment: ten checkpoints, two maps, eight music tracks, and 31 referenced uploaded assets (about 6.4 MiB). Only theme/challenge metadata was read from a read-only database mount; only referenced assets were copied from read-only storage. No real accounts, sessions, scores, or chat history were copied. All accounts/teams and 100,000 historical messages were synthetic. Production was neither rebuilt nor restarted.

The deployed source and staged update ran serially in separate containers using the same runtime image, with no network except container loopback, no published ports, read-only source, private scratch directories, a 2 GiB memory limit, and reduced CPU scheduling shares. CPU was not quota-capped. Each run seeded 250 users/63 teams, 100 notifications, and the 100,000-message history; active-user phases were 50, 100, and 250 for 30 seconds each. Every active user had chat open; 20% downloaded cold media. Each run began with 100 real synthetic-account logins at concurrency 25.

| Code / execution | Active users | Errors / requests | Presence p95 | Chat p95 | Server CPU, one-core basis |
| --- | --- | --- | --- | --- | --- |
| Deployed code | 50 | 0/863 | 138.74 ms | 744.51 ms | 79.7% |
| Deployed code | 100 | 0/1493 | 4141.06 ms | 3344.38 ms | 116.8% |
| Deployed code | 250 | 790/2277 | 12001.43 ms | 12001.39 ms | 112.5% |
| Updated, main | 50 | 0/864 | 54.48 ms | 66.97 ms | 54.7% |
| Updated, main | 100 | 0/1691 | 102.05 ms | 119.34 ms | 82.4% |
| Updated, main | 250 | 551/2726 | 12001.31 ms | 12001.12 ms | 101.0% |
| Updated, worker | 50 | 0/861 | 107.67 ms | 118.56 ms | 80.9% |
| Updated, worker | 100 | 0/1687 | 156.85 ms | 151.91 ms | 120.9% |
| Updated, worker | 250 | 0/2725 | 4454.12 ms | 4144.22 ms | 177.8% |

For 100 active users, optimized main mode reduced presence p95 from roughly 4.1 seconds to 102 ms and chat p95 from 3.3 seconds to 119 ms, with zero request errors. This is a substantial improvement on the deployment hardware. It does not establish capacity for all possible classroom workloads.

At 250 active users, both main-mode versions saturated the event loop and timed out requests at the runner's 12-second deadline. Worker mode avoided those timeouts in this short run, but presence/chat p95 was still about 4.5/4.1 seconds, with higher total CPU use. Keep main mode for the tested 50–100-user workload. The 250-user stress case still needs more optimization or a different deployment architecture before it can be recommended as responsive.

These measurements bypass production nginx, TLS, Internet latency, browser rendering, and MIDI synthesis. The workload is closed-loop: slow responses reduce the achieved request rate. Admin history samples are sparse. The results are individual serial tests, not replicated capacity guarantees. The old and updated main runs intentionally returned nonzero load-runner status because of the observed 250-user request errors; their JSON reports preserve those failures.

Reports: [deployed code](build/scaling-remote-before.json), [updated/main](build/scaling-remote-main.json), [updated/worker](build/scaling-remote-worker.json).


A follow-up **120-second main-mode run at 100 active users** completed **6,410 requests plus 100 logins with no errors**. Presence/chat p95 was **572.93/561.32 ms**, with about **99% of one core** and 234 MiB final RSS. Presence p99 reached 2.34 seconds. This run seeded 100 users in 25 teams instead of the comparison's 250 users/63 teams, concentrating the same 100,000 historical messages into fewer teams; it is a separate workload rather than evidence of latency drifting during the earlier run. It confirms error-free operation in this short test but leaves little CPU headroom under dense history. See [the 100-user main-mode report](build/scaling-remote-soak-100.json).


Repeating that same **100-user/25-team, 120-second workload in worker mode** completed **6,314 requests plus 100 logins without errors**. Presence/chat p95 was **716.87/659.58 ms**, CPU was **125.4% of one core**, and final RSS was 287 MiB. Worker mode reduced main-thread event-loop p95 delay from about 358 ms to 17 ms and improved presence p99 (2.34 s to 1.23 s), but increased overall p95 latency, CPU, and memory. Main mode remains the default recommendation for the tested 50–100-user range; neither mode demonstrated a comfortably responsive 250-user stress workload. See [the matched worker-mode report](build/scaling-remote-worker-soak-100.json).

All benchmark containers and temporary assignment/source copies were removed after reports were retrieved. The production container remained healthy with the same image and start time. The remote checkout and running production application were not updated; these results compare the deployed code with an isolated staged update. No retention or production data changes were performed.
