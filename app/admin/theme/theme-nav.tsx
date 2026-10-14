// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
const pages = [
  { id: "maps", href: "/admin/theme/maps", label: "Maps & transport" },
  { id: "entities", href: "/admin/theme/entities", label: "Non-player entities" },
  { id: "media", href: "/admin/theme/media", label: "Media" },
  { id: "library", href: "/admin/theme/library", label: "Theme library" },
  { id: "import-export", href: "/admin/theme/import-export", label: "Import / Export" },
] as const;
export default function ThemeNav({ active }: { active: (typeof pages)[number]["id"] }) {
  return <nav className="theme-subnav" aria-label="Theme pages"><strong>Theme</strong>{pages.map(page =>
    <a key={page.id} href={page.href} aria-current={active === page.id ? "page" : undefined}>{page.label}</a>
  )}</nav>;
}
