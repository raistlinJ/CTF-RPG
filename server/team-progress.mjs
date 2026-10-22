// Keep the original award on its solver, while everyone on the current team
// reads the same completion. Players without a team retain individual progress.
export const completionUsersSQL = (user = "?") => `
  SELECT COALESCE(peer.user, viewer.id)
  FROM students viewer
  LEFT JOIN team_members own ON own.user=viewer.id
  LEFT JOIN team_members peer ON peer.team=own.team
    AND peer.user IN (SELECT id FROM students WHERE disabled=0 AND role='student')
  WHERE viewer.id=${user}`;

// Older games can contain multiple awards for the same team/challenge. Count
// the highest saved award once, with a stable solver for answers and rewards.
export const sharedCompletionsSQL = (user = "?") => `
  SELECT user,challenge,points FROM (
    SELECT solved.*,ROW_NUMBER() OVER (
      PARTITION BY challenge ORDER BY points DESC,user
    ) AS choice FROM solved WHERE user IN (${completionUsersSQL(user)})
  ) WHERE choice=1`;

export async function playerCompletions(db, user) {
  return (await db.prepare(`${sharedCompletionsSQL()} ORDER BY challenge`).bind(user).all()).results;
}

export const unsolvedForTeamSQL = `NOT EXISTS (
  SELECT 1 FROM solved WHERE user IN (${completionUsersSQL()}) AND challenge=?
)`;
