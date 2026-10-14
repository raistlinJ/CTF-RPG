// CTF-RPG — Copyright Jaime C Acosta 2026
import {Snowflake} from "lucide-react";
const pages=[
 {id:"challenges",href:"/admin",label:"Challenges"},{id:"theme",href:"/admin/theme/maps",label:"Theme"},
 {id:"users",href:"/admin/users",label:"Users"},{id:"teams",href:"/admin/teams",label:"Teams"},
 {id:"notifications",href:"/admin/notifications",label:"Notifications"},{id:"data",href:"/admin/data",label:"Import & backup"},
] as const;
export default function AdminHeader({active}:{active:(typeof pages)[number]["id"]|"scores"|"game"}) {
 return <header className="admin-header"><a className="brand" href="/admin"><span className="brand-icon"><Snowflake size={24}/></span>CTF-RPG <b>STUDIO</b></a>
 <nav className="admin-header-links" aria-label="Admin pages">{pages.map(p=><a key={p.id} href={p.href} aria-current={active===p.id?"page":undefined}>{p.label}</a>)}</nav>
 <nav className="admin-utility-links" aria-label="Game shortcuts"><a href="/scoreboard" aria-current={active==="scores"?"page":undefined}>View scoreboard</a><a href="/" aria-current={active==="game"?"page":undefined}>Play game ↗</a></nav></header>;
}
