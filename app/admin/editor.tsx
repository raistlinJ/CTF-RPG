"use client";
import AdminHeader from "./admin-header";
import { useEffect, useState } from "react";
import {
  Plus,
  Save,
  Download,
  Upload,
  MapPin,
  LockKeyhole,
} from "lucide-react";
import { World } from "../page";
import ChallengeNav from "./challenges/challenge-nav";
import ChallengeVisibilityControls from "./challenge-visibility-controls";
import {
  MAP_IDS,
  mapName,
  configureWorld,
  activeWorld,
  mapInfo,
  createWorld,
} from "@/lib/world-data.mjs";
import { challengeLocationAvailable, findChallengeLocation } from "@/lib/challenge-placement.mjs";
import type { EntityCharacter, EntitySummary } from "@/lib/non-player-entities";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { KEY_COLORS, KEY_PALETTE, normalizeIncantation } from "@/lib/inventory-data.mjs";
type Hint = { id: string; label: string; text: string; cost: number; rewardCost: { keys: string[]; incantations: string[] } };
type FileLink = { name: string; url: string; filename?: string };
type Definition = {
  id: string;
  map: string;
  object: string;
  location: { x: number; y: number };
  region: string;
  text: string;
  flags: string[];
  dependsOn: string[];
  flagRules?: {value:string;caseSensitive:boolean}[];
  ctfd?: Record<string,unknown>;
  visibility: "hidden" | "visible";
  grading: "automatic" | "manual";
  caseSensitive: boolean;
  points: number;
  hints: Hint[];
  downloads: FileLink[];
  discoveryVideo: string | null;
  solveVideo: string | null;
  rewards: { keys: string[]; incantations: string[] };
};
type Draft = Omit<Definition, "flags"> & { flagsText: string };
const explorer = {
  id: "web",
  name: "Map editor",
  subtitle: "",
  sprite: null,
  fallback: "web" as const,
};
const noop = () => {};
const randomId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(8)), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
const fresh = (map = "town", x = 18, y = 20): Draft => ({
  id: "treasure-" + randomId(),
  map,
  object: "",
  location: { x, y },
  region: mapName(map),
  text: "",
  flagsText: "",
  dependsOn: [],
  visibility: "visible",
  grading: "automatic",
  caseSensitive: false,
  points: 100,
  hints: [],
  downloads: [],
  discoveryVideo: null,
  solveVideo: null,
  rewards: { keys: [], incantations: [] },
});
const toDraft = (c: Definition): Draft => ({
  ...c,
  dependsOn: c.dependsOn || [],
  visibility: c.visibility || "visible",
  grading: c.grading || "automatic",
  discoveryVideo: c.discoveryVideo || null,
  solveVideo: c.solveVideo || null,
  rewards: { keys: [...(c.rewards?.keys || [])], incantations: [...(c.rewards?.incantations || [])] },
  hints: c.hints.map((h) => ({ ...h, rewardCost: { keys: [...(h.rewardCost?.keys || [])], incantations: [...(h.rewardCost?.incantations || [])] } })),
  downloads: c.downloads.map((f) => ({ ...f })),
  flagsText: (c.flags || []).join("\n"),
});
export default function Admin() {
  const [access, setAccess] = useState<"loading" | "login" | "ready">(
      "loading",
    ),
    [catalog, setCatalog] = useState<Definition[]>([]),
    [revision, setRevision] = useState(0),
    [draft, setDraft] = useState<Draft | null>(null),
    [editingId, setEditingId] = useState<string | undefined>(),
    [initial, setInitial] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [firstHero, setFirstHero] = useState("web");
  const [editorPanel, setEditorPanel] = useState("challenge");
  const [themeRevision, setThemeRevision] = useState(0);
  const [mapEntities, setMapEntities] = useState<EntitySummary[]>([]);
  const [themeCharacters, setThemeCharacters] = useState<EntityCharacter[]>([]);
  const [moveFeedback, setMoveFeedback] = useState<{ text: string; error: boolean } | null>(null);
  const editorPanels = [
    { id: "challenge", label: "Challenge" },
    { id: "rewards", label: "Rewards" },
    { id: "cutscenes", label: "Cutscenes" },
    { id: "resources", label: "Hints & files" },
  ];
  const [challengeQuery, setChallengeQuery] = useState("");
  const [useRegex, setUseRegex] = useState(false);
  const [searchAllMaps, setSearchAllMaps] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState<"discoveryVideo" | "solveVideo" | null>(null);
  const placementWorld = createWorld(activeWorld);
  let filterError = "";
  let pattern: RegExp | null = null;
  if (useRegex && challengeQuery) {
    try { pattern = new RegExp(challengeQuery, "i"); }
    catch { filterError = "Invalid regular expression. Check the pattern or use string matching."; }
  }
  const scopedChallenges = catalog.filter(c => searchAllMaps || c.map === draft?.map);
  const matchingChallenges = filterError ? [] : scopedChallenges.filter(c => {
    const fields = [c.id, c.object, c.text, c.region, c.map, mapName(c.map)];
    return !challengeQuery || fields.some(value => pattern ? pattern.test(value) : value.toLocaleLowerCase().includes(challengeQuery.toLocaleLowerCase()));
  });
  const dirty =
    !!draft &&
    Boolean(
      editingId ||
      draft.object.trim() ||
      draft.text.trim() ||
      draft.flagsText.trim() ||
      draft.hints.length ||
      draft.downloads.length ||
      draft.discoveryVideo || draft.solveVideo || draft.rewards.keys.length || draft.rewards.incantations.length,
    ) &&
    JSON.stringify(draft) !== initial;
  function choose(c: Draft, id?: string, preservePanel = false) {
    if (!preservePanel) setEditorPanel("challenge");
    setDraft(c);
    setEditingId(id);
    setInitial(JSON.stringify(c));
    setError("");
    setMessage("");
    setMoveFeedback(null);
  }
  async function load(keepSelection = false, preserveDraft = false) {
    const r = await fetch("/api/admin/challenges");
    const d = (await r.json()) as {
      challenges: Definition[];
      revision: number;
      themeRevision: number;
      theme: { world: typeof activeWorld & { entities?: EntitySummary[] }; characters: EntityCharacter[] };
      error?: string;
    };
    if (r.status === 401 || r.status === 403) {
      setAccess("login");
      if (r.status === 403)
        setError(d.error || "This account is not an administrator.");
      return;
    }
    if (!r.ok) throw Error(d.error || "Challenge management is unavailable.");
    configureWorld(d.theme.world);
    setCatalog(d.challenges);
    setRevision(d.revision);
    setThemeRevision(d.themeRevision);
    setMapEntities(d.theme.world.entities || []);
    setThemeCharacters(d.theme.characters);
    setAccess("ready");
    if (preserveDraft) return;
    const selected = keepSelection
      ? d.challenges.find((c) => c.id === editingId)
      : undefined;
    const freshMap =
      keepSelection && draft && mapInfo(draft.map)
        ? draft.map
        : new URLSearchParams(window.location.search).get("map") || activeWorld.startMap;
    choose(
      selected
        ? toDraft(selected)
        : fresh(
            mapInfo(freshMap) ? freshMap : activeWorld.startMap,
            (mapInfo(freshMap) || mapInfo(activeWorld.startMap))!.spawn.x,
            (mapInfo(freshMap) || mapInfo(activeWorld.startMap))!.spawn.y,
          ),
      selected?.id,
    );
  }
  useEffect(() => {
    fetch("/api/config")
      .then(async (r) => {
        if (r.ok) {
          const c = (await r.json()) as { characters: { id: string }[] };
          setFirstHero(c.characters[0]?.id || "web");
        }
      })
      .catch(() => {});
    void load().catch((e) => {
      setError(e.message);
      setAccess("login");
    });
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const f = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", f);
    return () => window.removeEventListener("beforeunload", f);
  }, [dirty]);
  function patch(values: Partial<Draft>) {
    setDraft((d) => (d ? { ...d, ...values } : d));
    setMessage("");
  }
  function canDiscard() {
    if (busy || uploadingVideo) return false;
    return !dirty || window.confirm("Discard your unsaved edits?");
  }
  async function uploadVideo(field: "discoveryVideo" | "solveVideo", file: File) {
    if (!draft || uploadingVideo) return;
    const draftId = draft.id;
    setUploadingVideo(field);
    setError("");
    setMessage("");
    try {
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (!ext || !["mp4", "webm"].includes(ext) || file.size > 4 * 1024 * 1024)
        throw Error("Choose an MP4 or WebM video up to 4 MB, or use a hosted video URL.");
      const r = await fetch(`/api/admin/challenge-videos?type=${ext}`, { method: "POST", body: file });
      const d = await r.json() as { url: string; error?: string };
      if (!r.ok) throw Error(d.error || "Video upload failed.");
      setDraft(current => current?.id === draftId ? { ...current, [field]: d.url } : current);
      setMessage("Video uploaded. Save the challenge to use it.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploadingVideo(null);
    }
  }
  function newChallenge() {
    if (canDiscard())
      choose(fresh(draft?.map, draft?.location.x, draft?.location.y));
  }
  function selectTile(x: number, y: number) {
    if (!draft || busy || uploadingVideo) return;
    const existing = catalog.find(
      (c) => c.map === draft.map && c.location.x === x && c.location.y === y,
    );
    if (existing && existing.id !== editingId) {
      if (canDiscard()) choose(toDraft(existing), existing.id);
    } else patch({ location: { x, y } });
  }
  function selectExisting(c: Definition) {
    if (c.id === editingId) return;
    if (canDiscard()) choose(toDraft(c), c.id);
  }
  async function moveChallenge(map: string, location?: { x: number; y: number }) {
    if (!draft || !editingId || busy || uploadingVideo) return;
    if (location && !challengeLocationAvailable(placementWorld, catalog, map, location.x, location.y, editingId)) {
      setMoveFeedback({ text: "That location is unavailable. Drop on unoccupied, reachable ground away from doors and transport.", error: true });
      return;
    }
    setBusy(true);
    setMoveFeedback({ text: "Moving challenge…", error: false });
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/admin/challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "move", id: editingId, map, location, revision, themeRevision }),
      });
      const d = await r.json() as { challenges: Definition[]; revision: number; error?: string };
      if (!r.ok) throw Error(d.error || "The challenge could not be moved.");
      const moved = d.challenges.find(c => c.id === editingId)!;
      setCatalog(d.challenges);
      setRevision(d.revision);
      setDraft(current => current?.id === editingId ? { ...current, map: moved.map, location: { ...moved.location } } : current);
      setInitial(JSON.stringify(toDraft(moved)));
      setMoveFeedback({ text: `Moved “${moved.object}” to ${mapName(moved.map)} at ${moved.location.x}, ${moved.location.y}. Location saved.`, error: false });
    } catch (e) {
      setMoveFeedback({ text: (e as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  }
  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "login",
          username,
          password,
          hero: firstHero,
        }),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) throw Error(d.error || "Sign-in failed.");
      setPassword("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft || uploadingVideo) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const { flagsText, ...definition } = draft;
      if (definition.flagRules && (flagsText !== (catalog.find(c=>c.id===editingId)?.flags||[]).join("\n") || definition.caseSensitive !== catalog.find(c=>c.id===editingId)?.caseSensitive)) delete definition.flagRules;
      const challenge = {
        ...definition,
        rewards: { ...definition.rewards, incantations: definition.rewards.incantations.map(s => s.trim()).filter(Boolean) },
        flags:
          draft.grading === "manual"
            ? []
            : flagsText
                .split(/\r?\n/)
                .map((s) => s.trim())
                .filter(Boolean),
      };
      const r = await fetch("/api/admin/challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challenge, revision, editingId }),
      });
      const d = (await r.json()) as {
        error?: string;
        challenges: Definition[];
        revision: number;
      };
      if (!r.ok) throw Error(d.error || "Your changes could not be saved.");
      setCatalog(d.challenges);
      setRevision(d.revision);
      const saved = d.challenges.find((c) => c.id === draft.id)!;
      choose(toDraft(saved), saved.id, true);
      setMessage(
        "Saved. Active games will pick up the challenge and its visibility on their next update.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const invalidHintRewards = !!draft && draft.hints.some(h =>
    h.rewardCost.keys.some(key => !draft.rewards.keys.includes(key)) ||
    h.rewardCost.incantations.some(phrase => !draft.rewards.incantations.some(p => normalizeIncantation(p) === normalizeIncantation(phrase))));
  const validLocation =
    !!draft && challengeLocationAvailable(placementWorld, catalog, draft.map, draft.location.x, draft.location.y, editingId);
  return (
    <main className="admin-studio">
      <AdminHeader active="challenges" />
      {access === "loading" ? (
        <p className="admin-loading" role="status">
          Opening challenge studio…
        </p>
      ) : access === "login" ? (
        <section className="admin-login">
          <LockKeyhole size={28} />
          <h1>Administrator sign-in</h1>
          <p>Use the admin account your server owner configured.</p>
          <form onSubmit={login}>
            <label>
              Admin username
              <input
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </label>
            <label>
              Admin password
              <input
                autoComplete="current-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button className="primary" disabled={busy}>
              {busy ? "Signing in…" : "Sign in to manage challenges"}
            </button>
          </form>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </section>
      ) : (
        draft && (
          <section className="admin-workspace">
            <ChallengeNav active="manage"/>
            <div className="admin-heading">
              <div>
                <span className="eyebrow">BUILD THE TREASURE HUNT</span>
                <h1>Challenge studio</h1>
                <p>
                  Choose a map, click a tile, and give your discovery a
                  challenge.
                </p>
              </div>
              <div className="admin-actions">
                <button
                  className="primary"
                  type="button"
                  onClick={newChallenge}
                >
                  <Plus size={17} />
                  New challenge
                </button>
                <a href="/admin/challenges/import" className="secondary-button">
                  <Upload size={17} />
                  Import CTFd
                </a>
                <a
                  href="/api/admin/challenges?format=yaml"
                  className="secondary-button"
                >
                  <Download size={17} />
                  Export YAML
                </a>
                <a href="/api/admin/backup" className="secondary-button">
                  <Download size={17} />
                  Full backup
                </a>
                <ChallengeVisibilityControls />
              </div>
            </div>
            <div className="admin-columns">
              <div className="admin-map-panel">
                <div className="admin-map-toolbar">
                  <label>
                    Map
                    <Select
                      value={draft.map}
                      onValueChange={(map) => {
                        if (canDiscard())
                          choose(
                            fresh(
                              map,
                              mapInfo(map)!.spawn.x,
                              mapInfo(map)!.spawn.y,
                            ),
                          );
                      }}
                    >
                      <SelectTrigger aria-label="Select map">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MAP_IDS.map((map) => (
                          <SelectItem key={map} value={map}>
                            {mapName(map)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  {(
                    <span
                      className={validLocation ? "tile-valid" : "tile-invalid"}
                    >
                      <MapPin size={16} />
                      {draft.location.x}, {draft.location.y} ·{" "}
                      {validLocation
                        ? "Available ground"
                        : "Choose clear ground"}
                    </span>
                  )}
                </div>
                <p className="management-map-note">Navigate to Theme to edit artwork, ground &amp; transport.</p>
                <div>
                  <World
                    hero={explorer}
                    entities={mapEntities}
                    characters={themeCharacters}
                    map={draft.map}
                    pos={draft.location}
                    challenges={catalog
                      .filter((c) => c.map === draft.map)
                      .map((c) => ({
                        ...c,
                        location: c.id === editingId ? draft.location : c.location,
                        rewards: {keys:c.rewards?.keys || [],incantationCount:c.rewards?.incantations.length || 0},
                        remainingPoints: c.points,
                        awardedPoints: null,
                        submission: null,
                        hintCost: 0,
                        hints: c.hints.map((h) => ({ ...h, rewardCost: { keys: h.rewardCost.keys, incantationCount: h.rewardCost.incantations.length }, available: true, unlocked: false })),
                      }))}
                    solved={[]}
                    onMove={noop}
                    onSearch={noop}
                    onSelect={selectTile}
                    selectionAllowed={(map, x, y) => challengeLocationAvailable(placementWorld, catalog, map, x, y, editingId)}
                    selectedChallengeId={editingId}
                    onChallengeDrop={!busy && !uploadingVideo && editingId ? (id, x, y) => {
                      if (id === editingId) void moveChallenge(draft.map, { x, y });
                    } : undefined}
                  />
                  {editingId && <div className="challenge-move-controls">
                    <span>Selected: <b>{draft.object || editingId}</b></span>
                    <Select value="" onValueChange={map => void moveChallenge(map)} disabled={busy || !!uploadingVideo}>
                      <SelectTrigger aria-label="Move challenge to another map"><SelectValue placeholder="Move to…" /></SelectTrigger>
                      <SelectContent>
                        {MAP_IDS.filter(map => map !== draft.map).map(map => {
                          const available = !!findChallengeLocation(placementWorld, catalog, map, draft.location, editingId);
                          return <SelectItem key={map} value={map} disabled={!available}>{mapName(map)}{!available && " — no available locations"}</SelectItem>;
                        })}
                      </SelectContent>
                    </Select>
                  </div>}
                  {moveFeedback && <p className={`challenge-move-feedback ${moveFeedback.error ? "error" : "success"}`} role={moveFeedback.error ? "alert" : "status"}>{moveFeedback.text}</p>}
                  <p className="admin-map-help">
                    Select a star, then drag it or use Move to…; moves save immediately. Gray tiles are unavailable. Other draft edits use Save challenge.
                  </p>
                  <div className="admin-list-heading">
                    <h2>Saved discoveries</h2>
                    <span>
                      {matchingChallenges.length} of {scopedChallenges.length} {searchAllMaps ? "across all maps" : "on this map"}
                    </span>
                  </div>
                  <div className="challenge-list-filter">
                    <label className="challenge-search-label">
                      Filter challenges
                      <input type="search" aria-label="Filter challenges" value={challengeQuery} maxLength={200} placeholder="Name, ID, text, location or map…" onChange={e => setChallengeQuery(e.target.value)} aria-invalid={!!filterError} aria-describedby="challenge-filter-help" />
                    </label>
                    <div className="challenge-filter-options">
                      <label><input type="checkbox" checked={useRegex} onChange={e => setUseRegex(e.target.checked)} />Regular expression</label>
                      <label><input type="checkbox" checked={searchAllMaps} onChange={e => setSearchAllMaps(e.target.checked)} />All maps</label>
                      {challengeQuery && <button type="button" className="text-button" onClick={() => setChallengeQuery("")}>Clear</button>}
                    </div>
                    <small id="challenge-filter-help">Case-insensitive matching. Regex example: compass|lantern</small>
                    {filterError && <p className="error" role="alert">{filterError}</p>}
                  </div>
                  <div className="admin-challenge-list">
                    {matchingChallenges.map((c) => (
                        <button
                          className={c.id === editingId ? "active" : ""}
                          key={c.id}
                          onClick={() => selectExisting(c)}
                        >
                          <span>✦</span>
                          <div>
                            <b>{c.object}</b>
                            <small>
                              {c.region} · {c.location.x}, {c.location.y} · {c.visibility === "hidden" ? "Hidden" : "Visible"}
                            </small>
                          </div>
                          <strong>{c.points} pts</strong>
                        </button>
                      ))}
                    {!filterError && !matchingChallenges.length && (
                      <p>{scopedChallenges.length ? "No challenges match this filter." : "No challenges here yet. Pick a tile to add the first."}</p>
                    )}
                  </div>
                </div>
              </div>
              <form className="admin-editor" onSubmit={save} onInvalidCapture={e => {
                e.preventDefault();
                if (e.currentTarget.querySelector(":invalid") !== e.target) return;
                const field = e.target as HTMLInputElement;
                const panel = field.closest<HTMLElement>("[data-editor-panel]")?.dataset.editorPanel;
                if (panel) setEditorPanel(panel);
                setError(field.validationMessage || "Complete the highlighted field before saving.");
                requestAnimationFrame(() => field.focus());
              }}>
                <div className="admin-editor-title">
                  <h2>{editingId ? "Edit discovery" : "New discovery"}</h2>
                  <span>
                    {dirty ? "Unsaved edits" : editingId ? "Saved" : "Draft"}
                  </span>
                </div>
                <div className="challenge-editor-tabs" role="tablist" aria-label="Discovery sections" onKeyDown={e => {
                  const index = editorPanels.findIndex(p => p.id === editorPanel);
                  let next: number;
                  if (e.key === "ArrowRight") next = (index + 1) % editorPanels.length;
                  else if (e.key === "ArrowLeft") next = (index + editorPanels.length - 1) % editorPanels.length;
                  else if (e.key === "Home") next = 0;
                  else if (e.key === "End") next = editorPanels.length - 1;
                  else return;
                  e.preventDefault();
                  setEditorPanel(editorPanels[next].id);
                  e.currentTarget.querySelectorAll<HTMLButtonElement>("[role=tab]")[next].focus();
                }}>
                  {editorPanels.map(panel => <button type="button" role="tab" key={panel.id} id={`editor-tab-${panel.id}`}
                    aria-selected={editorPanel === panel.id} aria-controls={`editor-panel-${panel.id}`} tabIndex={editorPanel === panel.id ? 0 : -1}
                    onClick={() => setEditorPanel(panel.id)}>{panel.label}</button>)}
                </div>
                <div className="challenge-editor-panel" data-editor-panel="challenge" role="tabpanel" id="editor-panel-challenge" aria-labelledby="editor-tab-challenge" hidden={editorPanel !== "challenge"}>
                <label>
                  Discovery name
                  <input
                    required
                    maxLength={120}
                    value={draft.object}
                    onChange={(e) => patch({ object: e.target.value })}
                    placeholder="e.g. Santa’s missing star"
                  />
                </label>
                <label>
                  Location label
                  <input
                    required
                    maxLength={120}
                    value={draft.region}
                    onChange={(e) => patch({ region: e.target.value })}
                    placeholder="e.g. By the castle throne"
                  />
                  <small>
                    A description shown to students. Map and coordinates
                    determine the actual location; changing this label does not
                    move the challenge.
                  </small>
                </label>
                <div className="admin-coordinate-fields">
                  <label>
                    X coordinate
                    <input
                      type="number"
                      min={0}
                      max={39}
                      required
                      value={draft.location.x}
                      onChange={(e) =>
                        patch({
                          location: {
                            ...draft.location,
                            x: Number(e.target.value),
                          },
                        })
                      }
                    />
                  </label>
                  <label>
                    Y coordinate
                    <input
                      type="number"
                      min={0}
                      max={27}
                      required
                      value={draft.location.y}
                      onChange={(e) =>
                        patch({
                          location: {
                            ...draft.location,
                            y: Number(e.target.value),
                          },
                        })
                      }
                    />
                  </label>
                  <label>
                    Points
                    <input
                      type="number"
                      min={0}
                      max={10000}
                      required
                      value={draft.points}
                      onChange={(e) =>
                        patch({ points: Number(e.target.value) })
                      }
                    />
                  </label>
                </div>
                {!validLocation && (
                  <p className="error">
                    Choose reachable ground or floor, away from furniture and
                    doorways.
                  </p>
                )}
                <label>
                  Challenge text
                  <textarea
                    aria-label="Challenge text"
                    required
                    maxLength={20000}
                    rows={5}
                    value={draft.text}
                    onChange={(e) => patch({ text: e.target.value })}
                    placeholder="What should students discover or solve?"
                  />
                </label>
                <label>
                  Challenge visibility
                  <select aria-label="Individual challenge visibility" value={draft.visibility} onChange={(e) => patch({visibility: e.target.value as "hidden" | "visible"})}>
                    <option value="visible">Visible</option><option value="hidden">Hidden</option>
                  </select>
                  <small>Hidden challenges are available only to admins. The global setting can restrict all challenges to admins.</small>
                </label>
                <div className="challenge-dependency-summary">
                  <b>Prerequisites</b>
                  <p>{draft.dependsOn.length ? draft.dependsOn.map((id) => catalog.find((c) => c.id === id)?.object || mapEntities.find(e => `npe:${e.id}` === id)?.name || id).join(", ") : "No prerequisites"}</p>
                  <a href="/admin/challenges/dependencies">Edit dependency graph</a>
                </div>
                <label>
                  Answer checking
                  <Select
                    value={draft.grading}
                    onValueChange={(grading) =>
                      patch({ grading: grading as "automatic" | "manual" })
                    }
                  >
                    <SelectTrigger aria-label="Answer checking">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="automatic">Automatic</SelectItem>
                      <SelectItem value="manual">Manual grading</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
                {draft.flagRules && <p className="save-note">Imported flags preserve per-flag case rules. Editing accepted flags or the case-sensitive setting replaces those rules with this editor’s setting.</p>}
                {draft.ctfd && <details className="import-source-details"><summary>CTFd source details and compatibility notes</summary><pre>{JSON.stringify(draft.ctfd,null,2)}</pre></details>}
                {draft.grading === "automatic" ? (
                  <>
                    <label>
                      Accepted flags{" "}
                      <small>
                        One answer per line; students won’t see these.
                      </small>
                      <textarea
                        aria-label="Accepted flags"
                        required
                        maxLength={50000}
                        rows={3}
                        value={draft.flagsText}
                        onChange={(e) => patch({ flagsText: e.target.value })}
                        placeholder={"FLAG{north_pole}\nnorth pole"}
                      />
                    </label>
                    <label className="admin-checkbox">
                      <Checkbox
                        checked={draft.caseSensitive}
                        onCheckedChange={(v) =>
                          patch({ caseSensitive: v === true })
                        }
                      />
                      Case-sensitive flags
                    </label>
                  </>
                ) : (
                  <p>
                    Students submit written responses. Admins review them, award
                    points, and provide feedback from Review answers.
                  </p>
                )}
                </div>
                <div className="challenge-editor-panel" data-editor-panel="rewards" role="tabpanel" id="editor-panel-rewards" aria-labelledby="editor-tab-rewards" hidden={editorPanel !== "rewards"}>
                <section className="admin-repeaters challenge-reward-settings">
                  <h3>Inventory rewards <small>Optional</small></h3>
                  <p>Award these items when the challenge is solved or manually graded. Keys are reusable.</p>
                  <fieldset className="reward-key-options">
                    <legend>Keys to grant</legend>
                    {KEY_COLORS.map(color => <label key={color}>
                      <input type="checkbox" checked={draft.rewards.keys.includes(color)} onChange={e => patch({ rewards: {
                        ...draft.rewards, keys: e.target.checked ? [...draft.rewards.keys, color] : draft.rewards.keys.filter(c => c !== color),
                      } })} />
                      <span className="key-swatch" style={{ background: KEY_PALETTE[color as keyof typeof KEY_PALETTE] }} />{color} key
                    </label>)}
                  </fieldset>
                  <label>Incantations to grant <small>One short phrase per line, up to 80 characters each.</small>
                    <textarea rows={3} maxLength={1620} value={draft.rewards.incantations.join("\n")} placeholder="open sesame" onChange={e => patch({ rewards: { ...draft.rewards, incantations: e.target.value.split(/\r?\n/) } })} />
                  </label>
                  <small>Players see the phrases in Inventory after earning them. Previously earned rewards stay unchanged when you edit a challenge.</small>
                </section>
                </div>
                <div className="challenge-editor-panel" data-editor-panel="cutscenes" role="tabpanel" id="editor-panel-cutscenes" aria-labelledby="editor-tab-cutscenes" hidden={editorPanel !== "cutscenes"}>
                <section className="admin-repeaters challenge-video-settings">
                  <h3>Cutscenes <small>Optional</small></h3>
                  <p>Play a short video on first discovery or after solving. Players can replay it from the challenge.</p>
                  {(["discoveryVideo", "solveVideo"] as const).map(field => (
                    <div className="admin-repeater" key={field}>
                      <label>
                        {field === "discoveryVideo" ? "Discovery video URL" : "Solve video URL"}
                        <input value={draft[field] || ""} disabled={!!uploadingVideo} onChange={e => patch({ [field]: e.target.value.trim() || null })} placeholder="/videos/intro.mp4 or https://…/video.mp4" />
                      </label>
                      <small>Use a direct MP4 or WebM link, or upload a video up to 4 MB.</small>
                      <label>
                        {uploadingVideo === field ? "Uploading video…" : "Upload video"}
                        <input type="file" accept=".mp4,.webm,video/mp4,video/webm" disabled={!!uploadingVideo || busy} onChange={e => {
                          const file = e.target.files?.[0];
                          e.target.value = "";
                          if (file) void uploadVideo(field, file);
                        }} />
                      </label>
                      {draft[field] && <>
                        <video key={draft[field]} src={draft[field]} controls preload="metadata" playsInline aria-label={field === "discoveryVideo" ? "Discovery video preview" : "Solve video preview"} />
                        <button type="button" className="text-button" disabled={!!uploadingVideo} onClick={() => patch({ [field]: null })}>Remove video</button>
                      </>}
                    </div>
                  ))}
                </section>
                </div>
                <div className="challenge-editor-panel" data-editor-panel="resources" role="tabpanel" id="editor-panel-resources" aria-labelledby="editor-tab-resources" hidden={editorPanel !== "resources"}>
                <section className="admin-repeaters">
                  <div>
                    <h3>Hints</h3>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() =>
                        patch({
                          hints: [
                            ...draft.hints,
                            {
                              id: "hint-" + randomId(),
                              label: `Hint ${draft.hints.length + 1}`,
                              text: "",
                              cost: 0,
                              rewardCost: { keys: [], incantations: [] },
                            },
                          ],
                        })
                      }
                      disabled={draft.hints.length >= 20}
                    >
                      Add hint
                    </button>
                  </div>
                  <p>Set a point cost, select rewards from this challenge, or combine both. Selected rewards are withheld when the player completes the challenge. Each reward can pay for one hint.</p>
                  {draft.hints.map((h, i) => {
                    const keys = [...new Set([...draft.rewards.keys, ...h.rewardCost.keys])];
                    const phrases = [...new Map([...h.rewardCost.incantations, ...draft.rewards.incantations.filter(p => p.trim())].map(p => [normalizeIncantation(p), p.trim()])).values()];
                    return (
                    <div className="admin-repeater" key={h.id}>
                      <div className="admin-repeater-top">
                        <label>
                          Hint label
                          <input
                            required
                            value={h.label}
                            onChange={(e) =>
                              patch({
                                hints: draft.hints.map((v, j) =>
                                  j === i ? { ...v, label: e.target.value } : v,
                                ),
                              })
                            }
                          />
                        </label>
                        <label>
                          Point cost
                          <input
                            aria-label={`Hint ${i + 1} point cost`}
                            type="number"
                            min={0}
                            max={draft.points}
                            required
                            value={h.cost}
                            onChange={(e) =>
                              patch({
                                hints: draft.hints.map((v, j) =>
                                  j === i
                                    ? { ...v, cost: Number(e.target.value) }
                                    : v,
                                ),
                              })
                            }
                          />
                        </label>
                        <button
                          type="button"
                          className="text-button"
                          aria-label={`Remove hint ${i + 1}`}
                          onClick={() =>
                            patch({
                              hints: draft.hints.filter((_, j) => j !== i),
                            })
                          }
                        >
                          Remove
                        </button>
                      </div>
                      <fieldset className="hint-reward-costs">
                        <legend>Rewards to forfeit</legend>
                        <div className="hint-reward-options">
                          {keys.map(color => <label key={color} className="hint-reward-option">
                            <input type="checkbox" aria-label={`Hint ${i + 1} cost: ${color} key`} checked={h.rewardCost.keys.includes(color)} onChange={e => patch({ hints: draft.hints.map((v, j) => j === i ? { ...v, rewardCost: { ...v.rewardCost, keys: e.target.checked ? [...v.rewardCost.keys, color] : v.rewardCost.keys.filter(k => k !== color) } } : v) })} />
                            <span>{color} key{!draft.rewards.keys.includes(color) && <small className="error">Not in challenge rewards — uncheck to remove</small>}</span>
                          </label>)}
                          {phrases.map(phrase => <label key={normalizeIncantation(phrase)} className="hint-reward-option">
                            <input type="checkbox" aria-label={`Hint ${i + 1} cost: incantation ${phrase}`} checked={h.rewardCost.incantations.some(p => normalizeIncantation(p) === normalizeIncantation(phrase))} onChange={e => patch({ hints: draft.hints.map((v, j) => j === i ? { ...v, rewardCost: { ...v.rewardCost, incantations: [...v.rewardCost.incantations.filter(p => normalizeIncantation(p) !== normalizeIncantation(phrase)), ...(e.target.checked ? [phrase] : [])] } } : v) })} />
                            <span>Incantation: {phrase}{!draft.rewards.incantations.some(p => normalizeIncantation(p) === normalizeIncantation(phrase)) && <small className="error">Not in challenge rewards — uncheck to remove</small>}</span>
                          </label>)}
                        </div>
                        {!keys.length && !phrases.length && <p>Add keys or incantations on the Rewards tab to use them as hint costs.</p>}
                        <button type="button" className="text-button" onClick={() => setEditorPanel("rewards")}>Configure challenge rewards</button>
                        <small>A hint is free when its point cost is 0 and no rewards are selected. Items earned from other challenges stay in Inventory.</small>
                      </fieldset>
                      <label>
                        Hint text
                        <textarea
                          aria-label={`Hint text ${i + 1}`}
                          required
                          maxLength={10000}
                          rows={2}
                          value={h.text}
                          onChange={(e) =>
                            patch({
                              hints: draft.hints.map((v, j) =>
                                j === i ? { ...v, text: e.target.value } : v,
                              ),
                            })
                          }
                        />
                      </label>
                    </div>
                  ); })}
                </section>
                <section className="admin-repeaters">
                  <div>
                    <h3>Challenge files</h3>
                    <button
                      type="button"
                      className="text-button"
                      disabled={draft.downloads.length >= 20}
                      onClick={() =>
                        patch({
                          downloads: [
                            ...draft.downloads,
                            { name: "", url: "" },
                          ],
                        })
                      }
                    >
                      Add file link
                    </button>
                  </div>
                  <p>
                    Link to a hosted file or a file in your server’s downloads
                    folder.
                  </p>
                  {draft.downloads.map((file, i) => (
                    <div className="admin-repeater" key={i}>
                      <div className="admin-repeater-top">
                        <label>
                          File name
                          <input
                            required
                            value={file.name}
                            onChange={(e) =>
                              patch({
                                downloads: draft.downloads.map((v, j) =>
                                  j === i ? { ...v, name: e.target.value } : v,
                                ),
                              })
                            }
                          />
                        </label>
                        <button
                          type="button"
                          className="text-button"
                          aria-label={`Remove file ${i + 1}`}
                          onClick={() =>
                            patch({
                              downloads: draft.downloads.filter(
                                (_, j) => j !== i,
                              ),
                            })
                          }
                        >
                          Remove
                        </button>
                      </div>
                      <label>
                        File URL
                        <input
                          required
                          value={file.url}
                          onChange={(e) =>
                            patch({
                              downloads: draft.downloads.map((v, j) =>
                                j === i ? { ...v, url: e.target.value } : v,
                              ),
                            })
                          }
                          placeholder="/downloads/puzzle.pdf or https://…"
                        />
                      </label>
                      <label>
                        Download filename <small>Optional</small>
                        <input
                          value={file.filename || ""}
                          onChange={(e) =>
                            patch({
                              downloads: draft.downloads.map((v, j) =>
                                j === i
                                  ? {
                                      ...v,
                                      filename: e.target.value || undefined,
                                    }
                                  : v,
                              ),
                            })
                          }
                        />
                      </label>
                    </div>
                  ))}
                </section>
                </div>
                <div className="admin-save">
                  <p>
                    {draft.points - draft.hints.reduce((s, h) => s + h.cost, 0)}{" "}
                    points after all hints
                  </p>
                  {invalidHintRewards && <p className="error" role="alert">Some hint costs are no longer in the challenge’s reward list. <button type="button" className="text-button" onClick={() => setEditorPanel("resources")}>Review hint costs</button></p>}
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
                  <button
                    className="primary"
                    disabled={
                      busy ||
                      !!uploadingVideo ||
                      !validLocation ||
                      invalidHintRewards ||
                      draft.hints.reduce((s, h) => s + h.cost, 0) > draft.points
                    }
                  >
                    <Save size={17} />
                    {busy ? "Saving…" : "Save challenge"}
                  </button>
                  <button
                    className="text-button"
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (canDiscard())
                        void load(true).catch((e) => setError(e.message));
                    }}
                  >
                    Reload saved version
                  </button>
                  <small>Saving keeps previously earned student points.</small>
                </div>
              </form>
            </div>
          </section>
        )
      )}
    </main>
  );
}
