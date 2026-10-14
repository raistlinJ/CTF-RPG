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
| POST | `/api/admin/maps` | Edit ground, spawns, entities and transports. |
| GET, POST | `/api/admin/theme-media` | Manage appearance/image catalogs. |
| GET, POST | `/api/admin/theme-audio` | Manage MIDI tracks and playback settings. |
| GET, POST | `/api/admin/submissions` | Read submissions and apply selected deletion. |
| GET, POST | `/api/admin/review` | Read and grade instructor-graded answers. |
| GET, POST | `/api/admin/notifications` | Read or send notifications. |
| GET | `/api/admin/backup` | Download the complete recreation ZIP. |
| GET | `/api/scoreboard` | Read rankings with the account's configured permissions. |

These are the same endpoints used by the admin UI. JSON writes use `Content-Type: application/json`; map, media/audio, and pack uploads use the endpoint's multipart form format. Editing uses the current `revision` and, where required, `themeRevision` / `contentRevision` returned by the corresponding reads. A stale save returns 409; refresh before applying changes again.

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
