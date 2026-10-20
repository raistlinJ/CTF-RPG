export default function SocialNav({active}:{active:"notifications"|"chats"}) {
  return <nav className="theme-subnav" aria-label="Social pages">
    <strong>Social</strong>
    <a href="/admin/social/notifications" aria-current={active==="notifications"?"page":undefined}>Notifications</a>
    <a href="/admin/social/chats" aria-current={active==="chats"?"page":undefined}>Chats</a>
  </nav>;
}
