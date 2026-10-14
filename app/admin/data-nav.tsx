// CTF-RPG — Copyright Jaime C Acosta 2026
export default function DataNav({active}:{active:"packs"|"ctfd"}) {
 return <nav className="theme-subnav" aria-label="Import and backup pages"><strong>Import &amp; backup</strong><a href="/admin/data" aria-current={active==="packs"?"page":undefined}>Theme, content &amp; backups</a><a href="/admin/data/ctfd" aria-current={active==="ctfd"?"page":undefined}>Import CTFd</a></nav>;
}
