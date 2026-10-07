// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
export default function ThemeNav({active}:{active:"audio"|"import-export"}) {
 return <nav className="theme-subnav" aria-label="Theme pages"><strong>Theme</strong><a href="/admin/theme/import-export" aria-current={active==="import-export"?"page":undefined}>Import / Export</a><a href="/admin/theme/audio" aria-current={active==="audio"?"page":undefined}>Audio</a></nav>;
}
