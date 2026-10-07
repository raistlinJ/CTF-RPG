// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
export default function ChallengeNav({active}:{active:"manage"|"submissions"}) {
 return <nav className="theme-subnav" aria-label="Challenge pages"><strong>Challenges</strong><a href="/admin" aria-current={active==="manage"?"page":undefined}>Manage challenges</a><a href="/admin/challenges/submissions" aria-current={active==="submissions"?"page":undefined}>Submissions</a></nav>;
}
