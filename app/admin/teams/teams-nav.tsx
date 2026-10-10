export default function TeamsNav({ active }: { active: "configuration" | "manage" | "players" | "scoreboard" }) {
  return (
    <nav className="theme-subnav" aria-label="Team pages">
      <strong>Teams</strong>
      <a href="/admin/teams" aria-current={active === "manage" ? "page" : undefined}>Manage teams</a>
      <a href="/admin/teams/configuration" aria-current={active === "configuration" ? "page" : undefined}>Team size</a>
      <a href="/admin/teams/players" aria-current={active === "players" ? "page" : undefined}>Players &amp; messages</a>
      <a href="/admin/teams/scoreboard" aria-current={active === "scoreboard" ? "page" : undefined}>Scoreboard</a>
    </nav>
  );
}
