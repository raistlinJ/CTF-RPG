import { entityUnlocked } from "../lib/challenge-dependencies.mjs";
import { entityInInteractionRange, publicEntity } from "../lib/non-player-entities.mjs";
import { isPlayerEmote } from "../lib/player-emotes.mjs";
import { createWorld } from "../lib/world-data.mjs";
import { accessibleMaps, inventoryState } from "./inventory.mjs";
import { playerCompletions } from "./team-progress.mjs";
import { playerMilestones } from "./progression.mjs";

const reply = (body, status = 200) => Response.json(body, { status, headers:{"Cache-Control":"no-store"} });
export async function handleEntityEmoji(body, {db, user, admin, theme, themeRevision, catalog, gameState}) {
  if (body.themeRevision !== themeRevision) return reply({error:"The characters changed. Close this conversation and refresh the game."},409);
  if (!isPlayerEmote(body.emoji)) return reply({error:"Choose one of the five supported emojis."},400);
  const entity = (theme.world.entities || []).find(item => item.id === body.id);
  if (!entity) return reply({error:"This character is unavailable."},404);
  const items = await inventoryState(db,user.id,theme);
  if (!admin && !accessibleMaps(theme,items.unlockedTransports,user.spawn.map).has(entity.map)) return reply({error:"Unlock a route to this map before interacting with its characters."},403);
  const completions = await playerCompletions(db,user.id);
  const milestones = await playerMilestones(db,user.id,completions.map(row=>row.challenge));
  if (!admin && !entityUnlocked(entity,milestones)) return reply({error:"This character is unavailable."},404);
  if (!entityInInteractionRange(entity,body.map,body.x,body.y) || !createWorld(theme.world).reachable(body.map,body.x,body.y))
    return reply({error:entity.invisible ? "Stand on this hidden character's exact tile and Search to try an emoji." : "Move within one tile of this character to try an emoji."},400);
  const rule = (entity.emojiInteractions || []).find(item=>item.emoji===body.emoji);
  if (!rule) return reply({reaction:{matched:false,emoji:body.emoji,response:`${body.emoji} Sent`,effect:"none",firstDiscovery:false}});
  const current = await catalog();
  const gate = "COALESCE((SELECT revision FROM challenge_catalog WHERE id='active'),0)=? AND COALESCE((SELECT revision FROM theme_catalog WHERE id='active'),0)=?";
  let firstDiscovery = false;
  if (!admin) {
    const guard = "entity-emoji-"+crypto.randomUUID();
    const statements = [
      db.prepare(`INSERT INTO admin_user_action_guard(id,valid) VALUES(?,${gate})`).bind(guard,current.revision,themeRevision),
      db.prepare("INSERT OR IGNORE INTO entity_emoji_discoveries(user,entity,emoji,discovered_at) VALUES(?,?,?,?)").bind(user.id,entity.id,rule.emoji,Date.now()),
    ];
    if (rule.outputNodeId) statements.push(
      db.prepare("INSERT OR IGNORE INTO entity_activations(user,entity) VALUES(?,?)").bind(user.id,entity.id),
      db.prepare("INSERT OR IGNORE INTO entity_dialogue_outputs(user,entity,node) VALUES(?,?,?)").bind(user.id,entity.id,rule.outputNodeId),
    );
    statements.push(db.prepare("DELETE FROM admin_user_action_guard WHERE id=?").bind(guard));
    try {
      const results = await db.batch(statements);
      firstDiscovery = !!(results[1].meta?.changes ?? results[1].changes);
    } catch (error) {
      if (/admin_user_action_guard|CHECK constraint/i.test(error.message)) return reply({error:"Characters or dependencies changed. Refresh before trying again."},409);
      throw error;
    }
  } else if (!(await db.prepare(`SELECT ${gate} AS valid`).bind(current.revision,themeRevision).first())?.valid)
    return reply({error:"Characters or dependencies changed. Refresh before trying again."},409);
  const repeated = !admin && rule.once && !firstDiscovery;
  return reply({entity:publicEntity(entity),reaction:{matched:true,emoji:rule.emoji,response:rule.response,effect:repeated?"none":rule.effect,firstDiscovery,repeated,preview:!!admin},
    game:await gameState(user.id,admin,user.spawn.map)});
}
