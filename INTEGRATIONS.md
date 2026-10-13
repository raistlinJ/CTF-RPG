# Integration API

Use **Manage → Users → Integration API tokens** to create a token for a server-side client such as SCE-web. Copy the token when it is created; the UI displays it only once. Tokens can be listed and revoked there. Store the token as a secret and send it over HTTPS. Both `Authorization: Bearer <token>` and `Authorization: Token <token>` are accepted.

Integration tokens work only with `/api/integrations/v1/` endpoints. They cannot access challenge answers, backups, admin settings, or administrator account changes. These endpoints do not require a browser session or an `Origin` header. Ordinary admin endpoints continue to require an admin session and same-origin writes.

| Method | Path | Result |
| --- | --- | --- |
| `GET` | `/api/integrations/v1/me` | Verify the token and list available character IDs. |
| `GET` | `/api/integrations/v1/users` | List accounts, teams, scores, and completion counts. |
| `GET` | `/api/integrations/v1/users/{username}` | Read one account. |
| `PUT` | `/api/integrations/v1/users/{username}` | Create or update a student account. |
| `DELETE` | `/api/integrations/v1/users/{username}` | Delete a student account and its progress. |
| `GET` | `/api/integrations/v1/scoreboard` | Read individual and team rankings, even when the player scoreboard is restricted. |

`PUT` accepts JSON with `password` (8–128 characters) and optional `hero` (one of the IDs from `/me`). It creates the student if missing and updates the password or character if present. Repeating the same request with the same values returns `action: "unchanged"` and does not revoke the student's session. A changed password revokes existing sessions. The response includes `action` (`created`, `updated`, or `unchanged`) and the user. Usernames are case-insensitive and contain 3–24 letters, digits, underscores, or hyphens. The API does not use email addresses.

```sh
curl -H "Authorization: Bearer $CTF_RPG_TOKEN" \
  https://game.example.com/api/integrations/v1/me

curl -X PUT -H "Authorization: Bearer $CTF_RPG_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"password":"unique-student-password","hero":"web"}' \
  https://game.example.com/api/integrations/v1/users/student01

curl -H "Authorization: Bearer $CTF_RPG_TOKEN" \
  https://game.example.com/api/integrations/v1/scoreboard
```

The scoreboard response has `users` and `teams` arrays. Each entry includes an ID, name, score, and competition rank; user entries also include character, team, and completion count. The users endpoint includes pending YAML accounts with a null ID. Student score rows exclude disabled accounts and accounts barred by the current registration setting. Team totals include team point gifts.

Full backups include token hashes, so existing tokens continue to work after a restore. Raw token values are never stored or exported. Revoke a token in the UI when an integration no longer needs access.

SCE-web currently speaks CTFd's `/api/v1` format. It will need a CTF-RPG connector using these endpoints; simply replacing the CTFd base URL will not work.
