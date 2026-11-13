import { createWorld } from "../lib/world-data.mjs";
import { effectiveAccount } from "./passwords.mjs";
import { presenceSettings } from "./presence.mjs";
import { registrationSettings } from "./registration-settings.mjs";

const reply = (data, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

export async function handleAdminWarp(req, { db, config, user, platformAdmin, theme, themeRevision }) {
  const viewer = await user(req);
  if (!platformAdmin && viewer?.role !== "admin")
    return reply({ error: "Administrator access required." }, viewer ? 403 : 401);
  const engine = createWorld(theme.world);
  const setting = await presenceSettings(db, config);
  if (req.method === "GET") {
    const maps = theme.world.maps.map(map => ({ id: map.id, name: map.name, playerCount: setting.visibility === "off" ? null : 0, players: [] }));
    if (setting.visibility !== "off") {
      const now = Date.now();
      const rows = (await db.prepare(`
        SELECT s.*,p.map,p.x,p.y,m.team,t.name AS team_name
        FROM player_presence p JOIN students s ON s.id=p.user
        LEFT JOIN team_members m ON m.user=s.id LEFT JOIN teams t ON t.id=m.team
        WHERE p.theme_revision=? AND p.updated_at>? AND s.disabled=0
          AND COALESCE(t.disabled,0)=0
          AND EXISTS(SELECT 1 FROM sessions WHERE sessions.user=s.id AND expires>?)
        ORDER BY s.username
      `).bind(themeRevision, now - 20000, now).all()).results;
      const registration = await registrationSettings(db, config);
      for (const row of rows) {
        const configured = config.accounts.users.find(account => account.username === row.username);
        if (!registration.allowRegistration && !configured && !row.provisioned) continue;
        const account = effectiveAccount(row, configured, config);
        if ((!row.team && account.role !== "admin") || !engine.reachable(row.map, row.x, row.y)) continue;
        const map = maps.find(map => map.id === row.map);
        if (!map) continue;
        map.players.push({ username: account.username, role: account.role, team: row.team ? { id: row.team, name: row.team_name } : null });
        map.playerCount++;
      }
    }
    return reply({ maps, themeRevision, visibility: setting.visibility });
  }
  if (req.method !== "POST") return reply({ error: "Method not allowed." }, 405);
  if (!viewer) return reply({ error: "Sign in as an administrator to warp your explorer." }, 401);
  let body;
  try { body = await req.json(); }
  catch { return reply({ error: "Choose a destination map." }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body) || typeof body.map !== "string" || !Number.isInteger(body.themeRevision) || Object.keys(body).some(key => !["map", "themeRevision"].includes(key)))
    return reply({ error: "Choose a destination map and its current theme revision." }, 400);
  if (body.themeRevision !== themeRevision)
    return reply({ error: "The maps changed. Reload the game before warping.", themeRevision }, 409);
  const destination = theme.world.maps.find(map => map.id === body.map);
  if (!destination || !engine.canSpawn(destination.id, destination.spawn.x, destination.spawn.y))
    return reply({ error: "Choose an available destination map." }, 400);
  if (setting.visibility !== "off") {
    const result = await db.prepare(`
      INSERT INTO player_presence(user,map,x,y,theme_revision,updated_at)
      SELECT ?,?,?,?,?,? WHERE COALESCE((SELECT revision FROM theme_catalog WHERE id='active'),0)=?
      ON CONFLICT(user) DO UPDATE SET map=excluded.map,x=excluded.x,y=excluded.y,theme_revision=excluded.theme_revision,updated_at=excluded.updated_at
    `).bind(viewer.id, destination.id, destination.spawn.x, destination.spawn.y, themeRevision, Date.now(), themeRevision).run();
    if (!(result.meta?.changes ?? result.changes))
      return reply({ error: "The maps changed. Reload the game before warping." }, 409);
  }
  return reply({ map: destination.id, pos: { ...destination.spawn }, themeRevision });
}
