/* Full-page navigation also supports the standalone Vite app. */
/* eslint-disable @next/next/no-html-link-for-pages */
import { Snowflake } from "lucide-react";

const adminPages = [
  { id: "challenges", href: "/admin", label: "Challenges" },
  { id: "review", href: "/admin/review", label: "Review answers" },
  { id: "theme", href: "/admin/theme", label: "Theme" },
  { id: "teams", href: "/admin/teams", label: "Teams" },
  { id: "users", href: "/admin/users", label: "Users" },
  { id: "notifications", href: "/admin/notifications", label: "Notifications" },
  { id: "scores", href: "/scoreboard", label: "Scores" },
  { id: "game", href: "/", label: "Game" },
] as const;

export default function AdminHeader({ active }: { active: (typeof adminPages)[number]["id"] }) {
  return (
    <header className="admin-header">
      <a className="brand" href="/">
        <span className="brand-icon"><Snowflake size={24} /></span>
        CTF-RPG <b>STUDIO</b>
      </a>
      <nav className="admin-header-links" aria-label="Admin pages">
        {adminPages.map(({ id, href, label }) => (
          <a key={id} href={href} aria-current={active === id ? "page" : undefined}>
            {label}
          </a>
        ))}
      </nav>
    </header>
  );
}
