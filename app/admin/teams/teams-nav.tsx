export default function TeamsNav({ active }: { active: "configuration" | "manage" }) {
  return (
    <nav className="theme-subnav" aria-label="Team pages">
      <strong>Teams</strong>
      <a href="/admin/teams/configuration" aria-current={active === "configuration" ? "page" : undefined}>Configuration</a>
      <a href="/admin/teams" aria-current={active === "manage" ? "page" : undefined}>Manage</a>
    </nav>
  );
}
