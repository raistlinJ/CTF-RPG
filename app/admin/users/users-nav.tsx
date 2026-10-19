export default function UsersNav({ active }: { active: "roster" | "details" }) {
  return (
    <nav className="theme-subnav" aria-label="User pages">
      <strong>Users</strong>
      <a href="/admin/users" aria-current={active === "roster" ? "page" : undefined}>All users</a>
      <a href="/admin/users/details" aria-current={active === "details" ? "page" : undefined}>Account editor</a>
    </nav>
  );
}
