// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
const pages = [
  { id: "maps", href: "/admin/theme/maps", label: "Maps & transport" },
  { id: "library", href: "/admin/theme/library", label: "Theme library" },
  { id: "audio", href: "/admin/theme/audio", label: "Audio" },
  { id: "import-export", href: "/admin/theme/import-export", label: "Import / Export" },
] as const;
export default function ThemeNav({ active }: { active: (typeof pages)[number]["id"] }) {
  return <nav className="theme-subnav" aria-label="Theme pages"><strong>Theme</strong>{pages.map(page =>
    <a key={page.id} href={page.href} aria-current={active === page.id ? "page" : undefined}>{page.label}</a>
  )}</nav>;
}
