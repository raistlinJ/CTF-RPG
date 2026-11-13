# REST API

Use your CTF-RPG account's username and password to sign in through `POST /api/auth`. Reuse the returned session cookie on subsequent requests. Admin accounts can access management endpoints; student accounts can access their permitted game endpoints. Sessions expire after seven days. HTTP Basic authentication (`curl -u`) is not supported.

All writes, including sign-in and sign-out, require an `Origin` header matching the site's browser origin exactly (scheme, hostname, and port; no trailing slash). Use your public HTTPS origin when running behind Nginx. Requests with an incorrect or missing write origin return 403. Read requests do not require this header.

## Sign in and make requests

```sh
BASE_URL=https://ctf.example.com

curl -c ctf-cookies.txt \
  -H 'Content-Type: application/json' \
  -H "Origin: $BASE_URL" \
  -d '{"mode":"login","username":"ctf-admin","password":"YOUR_PASSWORD"}' \
  "$BASE_URL/api/auth"

curl -b ctf-cookies.txt "$BASE_URL/api/auth"
curl -b ctf-cookies.txt "$BASE_URL/api/admin/users"
curl -b ctf-cookies.txt "$BASE_URL/api/admin/challenges"
```

Use a valid player `hero` ID from `GET /api/config` if supplying a character on first sign-in. Later logins retain the saved character. Login returns `user` and `admin`; the session is in the `Set-Cookie` response header. Cookie files carry account access, so keep them private.

## Main endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/api/auth` | Sign in with `mode: "login"`, username, password and optional hero. |
| GET | `/api/auth` | Current account and admin status. |
| DELETE | `/api/auth` | Sign out and revoke the current session. |
| GET, POST | `/api/admin/users` | List, create, edit, and apply bulk user actions. |
| GET, POST, DELETE | `/api/admin/teams` | Team management, limits, gifts and bulk actions. |
| GET, POST | `/api/admin/challenges` | Read/edit challenges, move them and set bulk visibility. |
| GET, POST | `/api/admin/challenge-dependencies` | Read/edit progression dependencies. |
| GET, POST | `/api/admin/registration` | Configure self-registration. |
| GET, POST | `/api/admin/packs` | Read, export and import themes/content. |
| POST | `/api/admin/challenge-files?name=FILE` | Upload a raw file body (up to 4 MB); returns `name`, `filename`, `url`, and `size` for the challenge download list. Save the challenge separately. |
| POST | `/api/admin/ctfd-import` | Preview/apply a multipart CTFd import, with explicit skipped-file decisions. |
| POST | `/api/admin/maps` | Edit ground, spawns, entities and transports. |
| GET, POST | `/api/admin/warp` | Admin-only live map counts and occupant lists; teleport the signed-in admin to a map's spawn. |
| GET, POST | `/api/admin/theme-media` | Manage image catalogs, appearances, and map backgrounds. |
| GET, POST | `/api/admin/theme-audio` | Manage MIDI tracks, map music assignments, and playback settings. |
| GET, POST | `/api/admin/theme-sounds` | Manage sound clips and assign them to maps and events. |
| GET, POST | `/api/admin/submissions` | Read submissions and apply selected deletion. |
| GET, POST | `/api/admin/review` | Read and grade instructor-graded answers. |
| GET, POST | `/api/admin/notifications` | Read/send notifications, delete one, or clear notification history. |
| GET | `/api/admin/backup` | Download the complete recreation ZIP. |
| GET | `/api/scoreboard` | Read rankings with the account's configured permissions. |
| GET | `/api/chat-conversations` | Conversation previews and per-conversation unread counts. |
| GET, POST | `/api/team-social` | Team directory, chat history and sending messages or emojis. |
| GET, POST | `/api/chat-mutes` | Read/update the signed-in account's personal chat mutes. |

Game state shares challenge completions, earned scores, challenge prerequisites, and earned rewards across current teammates. Each challenge awards points once per team; repeated correct answers return `correct:true` and `awardedPoints:0`. The challenge’s `awardedPoints` in game state remains the saved shared award. Instructor grading creates one award per team/challenge; regrading its original response updates that award. Team rankings and user progress count legacy duplicates once using the highest saved award. Hint purchases unlock for every current teammate, charge once per team/hint, and reduce the team’s eventual challenge award regardless of the solver. Point and item costs are shared, including for manual grading. A written submission locks new team hints for that challenge; previously purchased hints remain readable. Shared hint changes reach active games through the presence revision.

These are the same endpoints used by the admin UI. JSON writes use `Content-Type: application/json`; map, media/audio/sound, and pack uploads use the endpoint's multipart form format. Editing uses the current `revision` and, where required, `themeRevision` / `contentRevision` returned by the corresponding reads. A stale save returns 409; refresh before applying changes again.

## Administrator warp

`GET /api/admin/warp` returns `{themeRevision, visibility, maps}`. Each map includes `id`, `name`, `playerCount`, and `players` with `username`, `role`, and an optional `team: {id, name}`. Counts include only recent valid presence with live sessions; `playerCount` is `null` when visibility is off. Post `{"map":"MAP_ID","themeRevision":REVISION}` to warp the signed-in administrator; the response is `{map, pos:{x,y}, themeRevision}`. The server chooses the destination spawn and updates temporary presence when visibility is enabled. It does not change assigned starts, unlocks, rewards or other players. Students cannot access either operation; stale map revisions return 409.

## Conversation inbox

`GET /api/chat-conversations` returns `{conversations, unreadCount, scope}` for the signed-in account. Each conversation includes `id`, `label`, `unreadCount`, `latestAt`, `preview: {id, text, sender, mine}`, and `isYourTeam`. Students receive separate internal-team, external-team and instructor conversations; admins receive one instructor conversation per student team. Permissions, disabled teams, hidden names, personal mutes and cleared history apply. Unread counts cover all matching history, beyond the 100-message thread display limit.

The optional URL-encoded `read` query contains `{baseline: TIMESTAMP, through: {CONVERSATION_ID: TIMESTAMP}}`. The browser stores this state per account and team (or admin scope); opening a thread advances only that conversation’s timestamp. Omitting it counts all incoming visible history as unread. This does not write server-side read state. The response’s scope is `admin` or the student’s team ID.

`GET /api/team-social?view=conversation&team=TEAM_ID` returns the selected conversation. The student’s own-team thread contains internal messages only; instructor replies appear in the separate `instructors` thread. An admin’s selected team thread combines that team’s questions with instructor replies and excludes student-to-student messages. Requests without `view=conversation` retain the aggregate history behavior. Send through the existing POST body `{id, team, text}`. The UI defaults to emojis and sends on one tap; text messages send with Enter or the send button, while Shift+Enter inserts a new line.

## Team emoji messages

Emoji-only cross-team messages use the normal `/api/team-social` POST body, for example `{"id":"UUID","team":"TEAM_ID","text":"👋"}`. The five supported reactions are 👋, 👍, 👎, 😮 and 😢. Add `recipient: "USERNAME"` to send only to one current member of the destination team; omit it for team delivery. User targeting is accepted only for these emoji messages and is included in retry deduplication. A recipient whose membership changed must be selected again. User-only events, history, previews and unread counts are restricted to the sender and selected recipient; administrators can audit them through `/api/admin/chats`. The player-card toggle defaults to User. Presence responses include recent `teamEmojis` events with `id`, `emoji`, `sender`, `fromTeam`, `toTeam`, `outgoing` and `remainingMs`, plus `toUser` for user-only sends. Only the sending account and selected user or receiving teammates receive these events; messaging permissions, personal mutes, cleared history and team-name visibility still apply. Administrator sends do not require team membership, use `fromTeam:null`, and follow instructor messaging permissions. Each client displays a new event once for five seconds, drawing a directional delivery line with a traveling emoji from the sender to visible recipients on the current map (static with reduced motion enabled). Simultaneous delivery lines use distinct colors and thin strokes. Emoji messages remain ordinary chat records for history, backups, moderation and retry deduplication. Students share a five-sends-per-minute limit across text, team emojis, user-only emojis and instructor messages. Authenticated administrators are exempt from the send-rate limit; messaging permissions still apply.

Self-hosted SQLite adds `recipient_user` on startup. Cloudflare/D1 deployments must apply `drizzle/0033_emoji_recipients.sql` before deploying the updated messaging APIs. Full backups preserve recipient targeting; older backups default to team delivery.

## Personal chat mutes

`GET /api/chat-mutes` returns `{muteAll, revision, overrides}`, where overrides maps previously selected usernames to booleans. All access is scoped to the signed-in account; a platform-admin header without an individual game session cannot manage personal preferences.

Post one of these JSON bodies with the latest returned revision:

```json
{"action":"set","username":"another-player","muted":true,"revision":0}
```

Use `muted:false` to unmute one player. For bulk changes use `{"action":"mute-all","revision":1}` or `{"action":"unmute-all","revision":2}`. Bulk actions clear earlier individual exceptions; mute-all also applies to future contacts. You cannot personally mute yourself, current teammates, or administrators. Current role and team membership are checked when reading messages, so those exemptions remain active after membership or role changes.

Permitted chat responses include `canPersonalMute` and `personalMuted` on each message. A personally muted message has `text:null`, retaining only the sender/metadata needed to display an unmute control. Personal mutes also filter the receiver's incoming message statistics. They do not change global moderation or other recipients' conversations. Full account backups preserve these preferences; theme/content packs exclude them.

Self-hosted SQLite adds the required tables on startup. Cloudflare/D1 deployments must apply `drizzle/0028_personal_chat_mutes.sql` before using the updated messaging endpoints.

## Create a student account

```sh
curl -b ctf-cookies.txt \
  -H 'Content-Type: application/json' \
  -H "Origin: $BASE_URL" \
  -d '{"username":"student01","password":"STUDENT_PASSWORD","hero":"web","role":"student","disabled":false,"editing":false,"revision":0}' \
  "$BASE_URL/api/admin/users"
```

Choose a hero that exists in the active theme. Users can choose their appearance on first sign-in. For an edit, set `editing: true` and supply the account's current revision. Leaving out `password` preserves it; changing it revokes that user's sessions. User bulk actions are `disable`, `delete`, `mute`, `unmute`, and `remove-team`, with `users` containing usernames and current revisions (and team IDs for removal). Team bulk actions are `mute`, `unmute`, `disable`, `enable`, and `delete`, with `teams` containing IDs and revisions.

Export challenge YAML or download a full backup:

```sh
curl -b ctf-cookies.txt "$BASE_URL/api/admin/challenges?format=yaml" -o challenges.yaml
curl -b ctf-cookies.txt "$BASE_URL/api/admin/backup" -o ctf-rpg-backup.zip

curl -b ctf-cookies.txt -X DELETE -H "Origin: $BASE_URL" "$BASE_URL/api/auth"
```

CTFd source ZIPs up to 512 MB can be prepared through the web importer. Direct REST uploads are limited to 64 MB ZIP / 65 MB multipart requests. When a preview lists `omittedAttachments`, applying requires `allowMissingAttachments: "true"` in the form; affected challenges remain hidden for review.

## Deleting notifications

Administrators can post `{"action":"delete","id":"NOTIFICATION_ID"}` to `/api/admin/notifications`. To clear history, first GET the admin list and use its `through` timestamp in `{"action":"clear-all","through":TIMESTAMP}`. This deletes all notifications through that timestamp across all pages and audiences, preserving newer announcements. Both actions return `{deleted:COUNT}` and atomically remove associated recipient/read records. Deletion is permanent for all recipients and does not affect chats. The admin UI requires confirmation.

The admin GET includes `total`, `through`, and up to 50 notifications, with `offset` pagination. Recipient summaries include `historyVersion` so open inboxes can refresh after deletion even when their unread count remains zero.
