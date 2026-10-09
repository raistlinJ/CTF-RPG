"use client";
import AdminHeader from "../admin-header";
import { useEffect, useState } from "react";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import {
  Plus,
  Save,
  Download,
  Users,
  RefreshCw,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { World } from "../../page";
import { activeWorld, configureWorld, canSpawn } from "@/lib/world-data.mjs";
import { Checkbox } from "@/components/ui/checkbox";
type Account = {
  id: string | null;
  username: string;
  hero: string;
  team: { id: string; name: string } | null;
  spawn: { map: string; location: { x: number; y: number } } | null;
  role: "student" | "admin";
  disabled: boolean;
  muted: boolean;
  revision: number;
  source: string;
  score: number;
  completed: number;
};
type Character = {
  id: string;
  name: string;
  subtitle: string;
  sprite: string | null;
  fallback: "web" | "thunder" | "shield";
};
type Theme = { world: typeof activeWorld };
type Draft = Pick<
  Account,
  "username" | "hero" | "spawn" | "role" | "disabled" | "muted" | "revision"
> & { password: string };
type BulkAction = "disable" | "delete" | "mute" | "remove-team";
const actionNames: Record<BulkAction, string> = { disable: "Disable", delete: "Delete", mute: "Mute chat", "remove-team": "Remove from team" };
export default function UsersPage() {
  const [users, setUsers] = useState<Account[]>([]),
    [characters, setCharacters] = useState<Character[]>([]),
    [viewer, setViewer] = useState<string | null>(null),
    [draft, setDraft] = useState<Draft | null>(null),
    [editing, setEditing] = useState(false),
    [loading, setLoading] = useState(true),
    [allowed, setAllowed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [query, setQuery] = useState(""),
    [theme, setTheme] = useState<Theme | null>(null),
    [themeRevision, setThemeRevision] = useState(0),
    [selectedUsers, setSelectedUsers] = useState<string[]>([]),
    [confirmDelete, setConfirmDelete] = useState(false);
  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/users");
      const d = (await r.json()) as {
        users: Account[];
        characters: Character[];
        viewer: string | null;
        theme: Theme;
        themeRevision: number;
        error?: string;
      };
      if (!r.ok) {
        setAllowed(false);
        throw Error(d.error || "User management is unavailable.");
      }
      configureWorld(d.theme.world);
      setTheme(d.theme);
      setThemeRevision(d.themeRevision);
      setUsers(d.users);
      setSelectedUsers((selected) => selected.filter(name => d.users.some(a => a.username === name)));
      setCharacters(d.characters);
      setViewer(d.viewer);
      setAllowed(true);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, []);
  function fresh() {
    setDraft({
      username: "",
      hero: characters[0]?.id || "web",
      role: "student",
      disabled: false,
      muted: false,
      spawn: null,
      revision: 0,
      password: "",
    });
    setEditing(false);
    setMessage("");
    setError("");
  }
  function select(a: Account) {
    setDraft({
      username: a.username,
      hero: a.hero,
      spawn: a.spawn,
      role: a.role,
      disabled: a.disabled,
      muted: a.muted,
      revision: a.revision,
      password: "",
    });
    setEditing(true);
    setMessage("");
    setError("");
  }
  function patch(v: Partial<Draft>) {
    setDraft((d) => (d ? { ...d, ...v } : d));
    setMessage("");
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft || busy) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const r = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...draft,
          password: draft.password || undefined,
          editing,
          themeRevision,
        }),
      });
      const d = (await r.json()) as {
        users: Account[];
        characters: Character[];
        error?: string;
      };
      if (!r.ok) throw Error(d.error || "Could not save account.");
      setUsers(d.users);
      setCharacters(d.characters);
      select(d.users.find((a) => a.username === draft.username.toLowerCase())!);
      setMessage(
        "User saved. Starting positions apply on next sign-in or reload.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const filteredUsers = users.filter(a => `${a.username} ${a.team?.name || ""}`.toLowerCase().includes(query.toLowerCase().trim()));
  const selected = users.filter(a => selectedUsers.includes(a.username));
  const allShownSelected = filteredUsers.length > 0 && filteredUsers.every(a => selectedUsers.includes(a.username));
  const someShownSelected = filteredUsers.some(a => selectedUsers.includes(a.username));
  const selfSelected = !!viewer && selectedUsers.includes(viewer);
  const profileTeam = editing ? users.find(a => a.username === draft?.username)?.team : null;
  async function applyBulk(action: BulkAction) {
    if (busy || !selected.length) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/admin/users", {
        method: "POST", headers: {"Content-Type":"application/json"},
        body: JSON.stringify({action, users: selected.map(a => ({username:a.username, revision:a.revision, team:a.team?.id ?? null}))}),
      });
      const d = await r.json() as {users:Account[]; characters:Character[]; updated:number; error?:string};
      if (!r.ok) throw Error(d.error || "Could not update the selected users.");
      setUsers(d.users);
      setCharacters(d.characters);
      setSelectedUsers([]);
      if (editing && draft && selectedUsers.includes(draft.username)) {
        const updated = d.users.find(a => a.username === draft.username);
        if (updated) select(updated); else setDraft(null);
      }
      const descriptions = { disable:"disabled", delete:"deleted", mute:"muted in chat", "remove-team":"removed from their teams" };
      setMessage(`${d.updated} ${d.updated === 1 ? "user" : "users"} ${descriptions[action]}.`);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); setConfirmDelete(false); }
  }
  const own = viewer === draft?.username;
  const spawnValid =
    !draft?.spawn ||
    canSpawn(draft.spawn.map, draft.spawn.location.x, draft.spawn.location.y);
  const selectedMap = theme?.world.maps.find((m) => m.id === draft?.spawn?.map);
  const selectedHero =
    characters.find((c) => c.id === draft?.hero) || characters[0];
  return (
    <main className="admin-studio">
      <AdminHeader active="users" />
      <section className="admin-workspace">
        <div className="roster-heading">
          <div>
            <span className="eyebrow">ADMIN STUDIO</span>
            <h1>Users</h1>
            <p>
              Create users, assign heroes and starting positions, and manage
              access to the expedition.
            </p>
          </div>
          {allowed && (
            <div className="admin-actions">
              <a className="secondary-button" href="/api/admin/backup">
                <Download size={17} />
                Full backup
              </a>
              <button className="primary" onClick={fresh} disabled={busy}>
                <Plus size={17} />
                New user
              </button>
            </div>
          )}
        </div>
        {allowed && error && <p className="error" role="alert">{error}</p>}
        {allowed && message && <p className="success" role="status">{message}</p>}
        {allowed && (
          <section className="user-bulk-actions" aria-label="Bulk user actions">
            <div className="user-selection-heading">
              <label className="admin-checkbox">
                <Checkbox aria-label="Select all shown users" checked={allShownSelected ? true : someShownSelected ? "indeterminate" : false} disabled={busy || !filteredUsers.length} onCheckedChange={(value) => {
                  const shown = filteredUsers.map(a => a.username);
                  setSelectedUsers(current => value === true ? [...new Set([...current, ...shown])] : current.filter(name => !shown.includes(name)));
                }} />
                Select all shown users
              </label>
              <span>{selected.length} selected</span>
              <button type="button" className="text-button" disabled={busy || !selected.length} onClick={() => setSelectedUsers([])}>Clear selection</button>
            </div>
            <div className="admin-actions">
              {(Object.keys(actionNames) as BulkAction[]).map(action => (
                <button type="button" key={action} className={`secondary-button${action === "delete" ? " danger-button" : ""}`} disabled={busy || !selected.length || (selfSelected && (action === "disable" || action === "delete"))} onClick={() => action === "delete" ? setConfirmDelete(true) : void applyBulk(action)}>{actionNames[action]}</button>
              ))}
            </div>
            {selfSelected && <p>Your own administrator user cannot be disabled or deleted. Deselect it to use those actions.</p>}
          </section>
        )}
        {loading ? (
          <p role="status">Loading users…</p>
        ) : !allowed ? (
          <div className="roster-empty">
            <Users size={28} />
            <p role="alert">{error}</p>
            <a className="admin-link" href="/admin">
              Sign in as an admin
            </a>
          </div>
        ) : (
          <div className="roster-columns">
            <section>
              <div className="roster-search">
                <label>
                  Find a user
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Username or team"
                  />
                </label>
                <button
                  disabled={busy}
                  aria-label="Refresh users"
                  className="icon-button"
                  onClick={() => void load()}
                >
                  <RefreshCw size={18} />
                </button>
              </div>
              <div className="roster-list users-roster-list">
                {filteredUsers.map((a) => (
                  <div key={a.username} className={`user-row${draft?.username === a.username ? " selected" : ""}${a.disabled ? " disabled-account" : ""}`}>
                    <input type="checkbox" aria-label={`Select ${a.username}`} checked={selectedUsers.includes(a.username)} disabled={busy} onChange={e => setSelectedUsers(current => e.target.checked ? [...current, a.username] : current.filter(name => name !== a.username))} />
                    <button type="button" aria-label={`Edit ${a.username}`} onClick={() => select(a)} disabled={busy}>
                      <span className="account-avatar">{a.username.slice(0, 2).toUpperCase()}</span>
                      <div>
                        <b>{a.username}</b>
                        <small>{a.role === "admin" ? "Administrator" : characters.find(c => c.id === a.hero)?.name || a.hero} · {a.disabled ? "Disabled" : "Active"}{a.muted ? " · Chat muted" : ""}</small>
                        <small>{a.team ? `Team: ${a.team.name}` : "No team"}</small>
                      </div>
                      <span>{a.score} pts<small>{a.completed} solved</small></span>
                    </button>
                  </div>
                ))}
                {!filteredUsers.length && <p>{users.length ? "No users match your search." : "No users yet. Create your first explorer."}</p>}
              </div>
            </section>
            {draft ? (
              <form className="admin-editor" onSubmit={save}>
                <div className="admin-editor-title">
                  <h2>{editing ? "Edit user" : "New user"}</h2>
                  <span>
                    {own
                      ? "Your user"
                      : draft.disabled
                        ? "Disabled"
                        : "Active"}
                  </span>
                </div>
                {editing && (
                  <section className="user-team-info" aria-label="User team">
                    <h3>Team</h3>
                    {profileTeam ? <a href="/admin/teams">{profileTeam.name}</a> : <p>No team</p>}
                  </section>
                )}
                <label>
                  Username
                  <input
                    required
                    readOnly={editing}
                    minLength={3}
                    maxLength={24}
                    pattern="[a-zA-Z0-9_-]+"
                    value={draft.username}
                    onChange={(e) => patch({ username: e.target.value })}
                  />
                  <small>
                    {editing
                      ? "Usernames stay fixed to preserve scores."
                      : "3–24 letters, numbers, underscores, or hyphens."}
                  </small>
                </label>
                <label>
                  {editing ? "Reset password" : "Password"}
                  <input
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    maxLength={128}
                    required={!editing}
                    value={draft.password}
                    onChange={(e) => patch({ password: e.target.value })}
                    placeholder={
                      editing
                        ? "Leave empty to keep the password"
                        : "At least 8 characters"
                    }
                  />
                </label>
                <label>
                  Character
                  <Select
                    value={draft.hero}
                    onValueChange={(hero) => patch({ hero })}
                  >
                    <SelectTrigger aria-label="User character">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {characters.map((c) => (
                        <SelectItem value={c.id} key={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <fieldset className="account-spawn">
                  <legend>Starting position</legend>
                  <label>
                    Starting map
                    <Select
                      value={draft.spawn?.map || "default"}
                      onValueChange={(map) => {
                        const info = theme?.world.maps.find(
                          (m) => m.id === map,
                        );
                        patch({
                          spawn: info
                            ? { map, location: { ...info.spawn } }
                            : null,
                        });
                      }}
                    >
                      <SelectTrigger aria-label="User starting map">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">Theme default</SelectItem>
                        {draft.spawn && !selectedMap && (
                          <SelectItem value={draft.spawn.map}>
                            Unavailable: {draft.spawn.map}
                          </SelectItem>
                        )}
                        {theme?.world.maps.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  {draft.spawn && selectedMap && selectedHero && (
                    <>
                      <p>
                        Click a reachable tile to place this explorer. Current
                        tile: {draft.spawn.location.x}, {draft.spawn.location.y}
                        .
                      </p>
                      <World
                        hero={selectedHero}
                        map={selectedMap.id}
                        pos={draft.spawn.location}
                        challenges={[]}
                        solved={[]}
                        onMove={() => {}}
                        onSearch={() => {}}
                        selectionAllowed={canSpawn}
                        selectionLabel="User spawn picker"
                        onSelect={(x, y) => {
                          if (canSpawn(selectedMap.id, x, y))
                            patch({
                              spawn: {
                                map: selectedMap.id,
                                location: { x, y },
                              },
                            });
                        }}
                      />
                      <button
                        type="button"
                        className="text-button"
                        onClick={() =>
                          patch({
                            spawn: {
                              map: selectedMap.id,
                              location: { ...selectedMap.spawn },
                            },
                          })
                        }
                      >
                        Use this map’s spawn
                      </button>
                    </>
                  )}
                  {!draft.spawn && (
                    <p>Uses the theme’s main map and default spawn.</p>
                  )}
                  {!spawnValid && (
                    <p className="error" role="alert">
                      This assigned tile is unavailable in the current theme.
                      Choose a reachable tile or Theme default before saving.
                    </p>
                  )}
                  <small>
                    Applies on sign-in and reload. Scores, hero, and team stay
                    with the account.
                  </small>
                </fieldset>
                <label>
                  Access role
                  <Select
                    value={draft.role}
                    onValueChange={(role) =>
                      patch({ role: role as Draft["role"] })
                    }
                  >
                    <SelectTrigger aria-label="User role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="student">Student</SelectItem>
                      <SelectItem value="admin">Administrator</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
                <label className="admin-checkbox">
                  <Checkbox
                    checked={draft.disabled}
                    onCheckedChange={(v) => patch({ disabled: v === true })}
                  />
                  Disable user
                </label>
                <label className="admin-checkbox">
                  <Checkbox
                    checked={draft.muted}
                    onCheckedChange={(v) => patch({ muted: v === true })}
                  />
                  Mute chat
                </label>
                <p className="roster-note">
                  Muted users can play and read conversations, but cannot send
                  messages to teams or instructors.
                </p>
                <p className="roster-note">
                  Disabling blocks sign-in and hides the explorer from the
                  scoreboard. Progress is kept for reactivation.
                </p>
                <button className="primary" disabled={busy || !spawnValid}>
                  <Save size={17} />
                  {busy ? "Saving…" : "Save user"}
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setDraft(null);
                    void load();
                  }}
                >
                  Cancel and reload users
                </button>
              </form>
            ) : (
              <div className="roster-empty">
                <Users size={30} />
                <h2>Select an explorer</h2>
                <p>Pick a user to edit, or create a new one.</p>
              </div>
            )}
          </div>
        )}
        <p className="roster-note">
          Full backups include private account hashes, challenge flags, and
          progress. Keep them in a private location.
        </p>
      </section>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selected.length} {selected.length === 1 ? "user" : "users"}?</AlertDialogTitle>
            <AlertDialogDescription>This permanently removes the selected users, their submissions, earned points, and team memberships. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="bulk-delete-users">{selected.map(a => <li key={a.username}>{a.username}</li>)}</ul>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy || selfSelected} onClick={() => void applyBulk("delete")}>Delete users</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
