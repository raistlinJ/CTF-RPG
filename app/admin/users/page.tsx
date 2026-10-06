"use client";
import { useEffect, useState } from "react";
import {
  Snowflake,
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
  spawn: { map: string; location: { x: number; y: number } } | null;
  role: "student" | "admin";
  disabled: boolean;
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
  "username" | "hero" | "spawn" | "role" | "disabled" | "revision"
> & { password: string };
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
    [themeRevision, setThemeRevision] = useState(0);
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
    void load();
  }, []);
  function fresh() {
    setDraft({
      username: "",
      hero: characters[0]?.id || "web",
      role: "student",
      disabled: false,
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
    if (!draft) return;
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
        "Account saved. Starting positions apply on next sign-in or reload.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
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
      <header>
        <a className="brand" href="/">
          <span className="brand-icon">
            <Snowflake size={24} />
          </span>
          QUEST <b>STUDIO</b>
        </a>
        <div className="admin-header-links">
          <a href="/admin/packs">Themes &amp; content</a>
          <a href="/admin/review">Review answers</a>
          <a href="/admin">Challenges</a>
          <a href="/admin/teams">Teams</a>
          <a href="/scoreboard">Scoreboard</a>
          <a href="/">Game</a>
        </div>
      </header>
      <section className="admin-workspace">
        <div className="roster-heading">
          <div>
            <span className="eyebrow">ADMIN STUDIO</span>
            <h1>Explorer accounts</h1>
            <p>
              Create accounts, assign heroes and starting positions, and manage
              access to the expedition.
            </p>
          </div>
          {allowed && (
            <div className="admin-actions">
              <a className="secondary-button" href="/api/admin/backup">
                <Download size={17} />
                Full backup
              </a>
              <button className="primary" onClick={fresh}>
                <Plus size={17} />
                New account
              </button>
            </div>
          )}
        </div>
        {loading ? (
          <p role="status">Loading accounts…</p>
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
                  Find an explorer
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Username"
                  />
                </label>
                <button
                  aria-label="Refresh users"
                  className="icon-button"
                  onClick={() => void load()}
                >
                  <RefreshCw size={18} />
                </button>
              </div>
              <div className="roster-list">
                {users
                  .filter((a) => a.username.includes(query.toLowerCase()))
                  .map((a) => (
                    <button
                      key={a.username}
                      className={
                        (draft?.username === a.username ? "selected " : "") +
                        (a.disabled ? "disabled-account" : "")
                      }
                      onClick={() => select(a)}
                    >
                      <span className="account-avatar">
                        {a.username.slice(0, 2).toUpperCase()}
                      </span>
                      <div>
                        <b>{a.username}</b>
                        <small>
                          {a.role === "admin"
                            ? "Administrator"
                            : characters.find((c) => c.id === a.hero)?.name ||
                              a.hero}{" "}
                          · {a.disabled ? "Disabled" : "Active"}
                        </small>
                      </div>
                      <span>
                        {a.score} pts<small>{a.completed} solved</small>
                      </span>
                    </button>
                  ))}
                {!users.length && (
                  <p>No accounts yet. Create your first explorer.</p>
                )}
              </div>
            </section>
            {draft ? (
              <form className="admin-editor" onSubmit={save}>
                <div className="admin-editor-title">
                  <h2>{editing ? "Edit account" : "New account"}</h2>
                  <span>
                    {own
                      ? "Your account"
                      : draft.disabled
                        ? "Disabled"
                        : "Active"}
                  </span>
                </div>
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
                    <SelectTrigger aria-label="Account character">
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
                      <SelectTrigger aria-label="Account starting map">
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
                        selectionLabel="Account spawn picker"
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
                    <SelectTrigger aria-label="Account role">
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
                  Disable account
                </label>
                <p className="roster-note">
                  Disabling blocks sign-in and hides the explorer from the
                  scoreboard. Progress is kept for reactivation.
                </p>
                {error && (
                  <p className="error" role="alert">
                    {error}
                  </p>
                )}
                {message && (
                  <p className="success" role="status">
                    {message}
                  </p>
                )}
                <button className="primary" disabled={busy || !spawnValid}>
                  <Save size={17} />
                  {busy ? "Saving…" : "Save account"}
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
                <p>Pick an account to edit, or create a new one.</p>
              </div>
            )}
          </div>
        )}
        <p className="roster-note">
          Full backups include private account hashes, challenge flags, and
          progress. Keep them in a private location.
        </p>
      </section>
    </main>
  );
}
