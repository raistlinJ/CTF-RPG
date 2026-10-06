"use client";
import TeamPanel from "./team-panel";
import { usePlayerPresence, type NearbyPlayer } from "./use-player-presence";
import TeamSetup, { type Team } from "./team-setup";
import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { MidiPlayer, type MusicConfig } from "@/lib/midi-player";
import {
  Compass,
  Cpu,
  Snowflake,
  Trophy,
  Volume2,
  VolumeX,
  LogOut,
  Sparkles,
  MapPin,
  Flag,
} from "lucide-react";
import {
  buildings,
  step,
  mapName,
  mapInfo,
  activeWorld,
  configureWorld,
  canPlaceChallenge,
  transportTiles,
} from "@/lib/world-data.mjs";

type Place = {
  map: string;
  pos: { x: number; y: number };
  travel?: { from: string; to: string }[];
};
type Hero = string;
type User = {
  username: string;
  hero: Hero;
  spawn: { map: string; location: { x: number; y: number } };
};
type Character = {
  id: string;
  name: string;
  subtitle: string;
  sprite: string | null;
  fallback: "web" | "thunder" | "shield";
};
type GameConfig = {
  characters: Character[];
  audio: MusicConfig;
  allowRegistration: boolean;
  theme: {
    title: string;
    badge: "snowflake" | "cpu" | "compass";
    description: string;
    world: typeof activeWorld;
  };
  themeRevision: number;
};
type Challenge = {
  id: string;
  map: string;
  object: string;
  location: { x: number; y: number };
  region: string;
  text: string;
  points: number;
  grading: "automatic" | "manual";
  submission: {
    answer: string;
    revision: number;
    status: "pending" | "graded";
    feedback: string;
    grade: number | null;
    submittedAt: number;
    gradedAt: number | null;
  } | null;
  caseSensitive: boolean;
  remainingPoints: number;
  awardedPoints: number | null;
  hintCost: number;
  hints: {
    id: string;
    label: string;
    cost: number;
    unlocked: boolean;
    text?: string;
  }[];
  downloads: { name: string; url: string; filename?: string }[];
};
type GameState = { challenges: Challenge[]; solved: string[]; score: number };
type GameResponse = GameState & {
  error?: string;
  correct?: boolean;
  submitted?: boolean;
  awardedPoints?: number;
};
function useSprite(path: string | null) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    setImage(null);
    if (!path) return;
    let live = true;
    const img = new Image();
    img.onload = () => {
      if (live) setImage(img);
    };
    img.onerror = () => {
      if (live) setImage(null);
    };
    img.src = path;
    return () => {
      live = false;
    };
  }, [path]);
  return image;
}
const spriteBounds = new WeakMap<
  HTMLImageElement,
  { x: number; y: number; w: number; h: number }
>();
function visibleSprite(image: HTMLImageElement) {
  const saved = spriteBounds.get(image);
  if (saved) return saved;
  let bounds = { x: 0, y: 0, w: image.width, h: image.height };
  try {
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(image, 0, 0);
    const data = ctx.getImageData(0, 0, image.width, image.height).data;
    let left = image.width,
      top = image.height,
      right = -1,
      bottom = -1;
    for (let y = 0; y < image.height; y++)
      for (let x = 0; x < image.width; x++)
        if (data[(y * image.width + x) * 4 + 3] > 20) {
          left = Math.min(left, x);
          top = Math.min(top, y);
          right = Math.max(right, x);
          bottom = Math.max(bottom, y);
        }
    if (right >= left)
      bounds = { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
  } catch {}
  spriteBounds.set(image, bounds);
  return bounds;
}
function drawCharacter(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  character: Character,
  image: HTMLImageElement | null,
  size: number,
) {
  if (image) {
    const bounds = visibleSprite(image);
    const ratio = bounds.w / bounds.h;
    const h = size,
      w = size * ratio;
    ctx.drawImage(
      image,
      bounds.x,
      bounds.y,
      bounds.w,
      bounds.h,
      x - w / 2,
      y - h / 2,
      w,
      h,
    );
  } else sprite(ctx, x, y, character.fallback, size / 32);
}
function sprite(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  hero: Hero,
  scale = 1,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  const rect = (c: string, x: number, y: number, w: number, h: number) => {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, w, h);
  };
  rect("#163340", -7, 12, 18, 4);
  if (hero === "thunder") {
    rect("#b9434d", -7, -3, 14, 15);
    rect("#ebd887", -7, -15, 14, 12);
    rect("#f2c9a0", -4, -12, 8, 8);
    rect("#91a6b1", -6, 0, 12, 9);
    rect("#a7c4ce", 9, -6, 7, 6);
    rect("#695348", 11, 0, 2, 10);
  } else {
    rect(hero === "web" ? "#d94c57" : "#438ac4", -6, -15, 12, 12);
    rect("#f4f5df", -4, -11, 3, 3);
    rect("#f4f5df", 2, -11, 3, 3);
    rect(hero === "web" ? "#d94c57" : "#438ac4", -7, -2, 14, 10);
    rect("#d94c57", -4, 3, 8, 3);
    if (hero === "shield") {
      rect("#da6464", 6, 0, 10, 10);
      rect("#eee1b9", 8, 2, 6, 6);
      rect("#438ac4", 10, 4, 2, 2);
    } else {
      rect("#263956", -3, -1, 6, 6);
    }
  }
  rect("#253e65", -6, 8, 5, 6);
  rect("#253e65", 2, 8, 5, 6);
  ctx.restore();
}
export function World({
  hero,
  map,
  pos,
  challenges,
  solved,
  onMove,
  onSearch,
  onSelect,
  selectionAllowed,
  selectionLabel,
  players = [],
  characters = [],
  onTeamSelect,
}: {
  hero: Character;
  map: string;
  pos: { x: number; y: number };
  challenges: Challenge[];
  solved: string[];
  onMove: (x: number, y: number) => void;
  onSearch: () => void;
  onSelect?: (x: number, y: number) => void;
  selectionAllowed?: (map: string, x: number, y: number) => boolean;
  selectionLabel?: string;
  players?: NearbyPlayer[];
  characters?: Character[];
  onTeamSelect?: (team: string) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const image = useSprite(hero.sprite);
  const background = useSprite(mapInfo(map)?.background || null);
  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    const t = 24;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, 960, 672);
    const info = mapInfo(map);
    ctx.fillStyle = info?.wall || "#1b2e39";
    ctx.fillRect(0, 0, 960, 672);
    if (info) {
      const b = info.bounds;
      ctx.fillStyle = info.floor;
      ctx.fillRect(
        b.left * t,
        b.top * t,
        (b.right - b.left + 1) * t,
        (b.bottom - b.top + 1) * t,
      );
    }
    if (background) ctx.drawImage(background, 0, 0, 960, 672);
    else if (info) {
      ctx.fillStyle = info.wall;
      for (const b of info.obstacles)
        ctx.fillRect(b.x * t, b.y * t, b.w * t, b.h * t);
      if (map === activeWorld.startMap)
        for (const b of buildings) {
          ctx.fillStyle = b.color;
          ctx.fillRect(b.x * t, b.y * t, b.w * t, b.h * t);
          ctx.fillStyle = "#d5b86d";
          ctx.fillRect(b.door.x * t, b.door.y * t, t, t);
        }
      const exit = info.exit;
      if (exit) {
        ctx.fillStyle = "#d5b86d";
        ctx.fillRect(exit.x * t, exit.y * t, t, t);
      }
    }
    if (onSelect) {
      ctx.fillStyle = "rgba(135, 140, 145, 0.42)";
      for (let y = 0; y < 28; y++)
        for (let x = 0; x < 40; x++)
          if (!(selectionAllowed || canPlaceChallenge)(map, x, y))
            ctx.fillRect(x * t, y * t, t, t);
    }
    const portals =
      map === activeWorld.startMap
        ? buildings.map((b) => b.door)
        : info?.exit
          ? [info.exit]
          : [];
    ctx.strokeStyle = "#85f4ea";
    ctx.lineWidth = 2;
    for (const p of portals) {
      ctx.strokeRect(p.x * t + 2, p.y * t + 2, t - 4, t - 4);
    }
    for (const p of transportTiles(map)) {
      ctx.fillStyle = "#9b8bff55";
      ctx.fillRect(p.x * t + 2, p.y * t + 2, t - 4, t - 4);
      ctx.strokeStyle = "#c4adff";
      ctx.lineWidth = 2;
      ctx.strokeRect(p.x * t + 2, p.y * t + 2, t - 4, t - 4);
      ctx.fillStyle = "#eee1ff";
      ctx.font = "bold 17px Arial";
      ctx.textAlign = "center";
      ctx.fillText("⇄", p.x * t + 12, p.y * t + 18);
    }
    for (const q of challenges) {
      if (q.map !== map || solved.includes(q.id)) continue;
      const a = q.location.x * t + 12,
        b = q.location.y * t + 12;
      const distance =
        Math.abs(pos.x - q.location.x) + Math.abs(pos.y - q.location.y);
      ctx.fillStyle = distance <= 3 ? "#d6a44e" : "#bed5db";
      ctx.fillRect(a - 2, b - 6, 4, 12);
      ctx.fillRect(a - 6, b - 2, 12, 4);
      ctx.fillStyle = "#fff6cc";
      ctx.fillRect(a - 2, b - 2, 4, 4);
    }

    if (onSelect) {
      ctx.strokeStyle = "#456d7b66";
      ctx.lineWidth = 1;
      for (let x = 0; x <= 40; x++) {
        ctx.beginPath();
        ctx.moveTo(x * t, 0);
        ctx.lineTo(x * t, 672);
        ctx.stroke();
      }
      for (let y = 0; y <= 28; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * t);
        ctx.lineTo(960, y * t);
        ctx.stroke();
      }
      ctx.fillStyle = "#f5cf7544";
      ctx.fillRect(pos.x * t, pos.y * t, t, t);
      ctx.strokeStyle = "#eab950";
      ctx.lineWidth = 3;
      ctx.strokeRect(pos.x * t + 1, pos.y * t + 1, t - 2, t - 2);
    } else drawCharacter(ctx, pos.x * t + 12, pos.y * t + 12, hero, image, 42);
    ctx.fillStyle = "#264954";
    ctx.fillRect(pos.x * t + 9, pos.y * t + 34, 6, 3);
  }, [
    hero,
    image,
    background,
    map,
    pos,
    challenges,
    solved,
    onSelect,
    selectionAllowed,
  ]);
  return (
    <div className="world">
      <div className="world-surface">
        <canvas
          ref={ref}
          width={960}
          height={672}
          tabIndex={onSelect ? 0 : undefined}
          onClick={
            onSelect
              ? (e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  onSelect(
                    Math.min(
                      39,
                      Math.floor(((e.clientX - r.left) / r.width) * 40),
                    ),
                    Math.min(
                      27,
                      Math.floor(((e.clientY - r.top) / r.height) * 28),
                    ),
                  );
                }
              : undefined
          }
          onKeyDown={
            onSelect
              ? (e) => {
                  const dirs: Record<string, number[]> = {
                    ArrowUp: [0, -1],
                    ArrowDown: [0, 1],
                    ArrowLeft: [-1, 0],
                    ArrowRight: [1, 0],
                  };
                  const d = dirs[e.key];
                  if (d) {
                    e.preventDefault();
                    onSelect(
                      Math.max(0, Math.min(39, pos.x + d[0])),
                      Math.max(0, Math.min(27, pos.y + d[1])),
                    );
                  }
                }
              : undefined
          }
          aria-label={
            onSelect
              ? `${selectionLabel || "Challenge location picker"}: ${mapName(map)}. Click a tile or use arrow keys to choose a location.`
              : `Exploration map: ${mapName(map)}. Use arrow keys or WASD to move, E to search, and walk into doorways to enter or exit.`
          }
        />
        {!onSelect && players.length > 0 && (
          <div className="nearby-player-layer" aria-label="Players on this map">
            {players.map((p) => {
              const character = characters.find((c) => c.id === p.hero);
              return (
                <button
                  type="button"
                  disabled={!p.team || !onTeamSelect}
                  aria-label={`View team for ${p.username}`}
                  onClick={() => p.team && onTeamSelect?.(p.team)}
                  key={p.username}
                  className={"nearby-player " + (p.teammate ? "teammate" : "")}
                  style={{
                    left: `${((p.x + 0.5) / 40) * 100}%`,
                    top: `${((p.y + 0.5) / 28) * 100}%`,
                  }}
                >
                  {character && <Portrait hero={character} />}
                  <span>{p.username}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div className="map-label">
        <span className="live-dot" /> {mapName(map).toUpperCase()}{" "}
        <span>{map === activeWorld.startMap ? "WORLD MAP" : "INTERIOR"}</span>
      </div>
      <div className="map-bottom">
        <span>
          <MapPin size={15} /> {pos.x}, {pos.y}
        </span>
        {!onSelect && (
          <button onClick={onSearch}>
            <Sparkles size={16} /> Search nearby <kbd>E</kbd>
          </button>
        )}
      </div>
      {!onSelect && (
        <div className="dpad">
          <button aria-label="Move north" onClick={() => onMove(0, -1)}>
            ▲
          </button>
          <div>
            <button aria-label="Move west" onClick={() => onMove(-1, 0)}>
              ◀
            </button>
            <button aria-label="Move south" onClick={() => onMove(0, 1)}>
              ▼
            </button>
            <button aria-label="Move east" onClick={() => onMove(1, 0)}>
              ▶
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
function Portrait({ hero }: { hero: Character }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const image = useSprite(hero.sprite);
  useEffect(() => {
    const c = ref.current!.getContext("2d")!;
    c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, 100, 100);
    drawCharacter(c, 50, 50, hero, image, 85);
  }, [hero, image]);
  return (
    <canvas
      ref={ref}
      width={100}
      height={100}
      className="portrait"
      aria-label={hero.name}
    />
  );
}
export default function Game() {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [hero, setHero] = useState<Hero>("web"),
    [mode, setMode] = useState("register"),
    [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [challenges, setChallenges] = useState<Challenge[]>([]),
    [solved, setSolved] = useState<string[]>([]),
    [score, setScore] = useState(0),
    [place, setPlace] = useState<Place>({ map: "town", pos: { x: 18, y: 20 } }),
    [active, setActive] = useState<Challenge | null>(null),
    [answer, setAnswer] = useState(""),
    [feedback, setFeedback] = useState(""),
    [feedbackSuccess, setFeedbackSuccess] = useState(false),
    [hintMessage, setHintMessage] = useState(""),
    [notice, setNotice] = useState("Follow the paths. Look for a glimmer."),
    [muted, setMuted] = useState(true);
  const { map, pos } = place;
  const audio = useRef<AudioContext | null>(null);
  const music = useRef<MidiPlayer | null>(null);
  const [config, setConfig] = useState<GameConfig | null>(null);
  const [audioError, setAudioError] = useState("");
  const [audioBusy, setAudioBusy] = useState(false);
  const heroes = config?.characters || [];
  const [canAdmin, setCanAdmin] = useState(false);
  const [team, setTeam] = useState<Team | null>(null);
  const [teamPanelOpen, setTeamPanelOpen] = useState(false),
    [selectedTeam, setSelectedTeam] = useState<string | null>(null),
    [readMessagesAt, setReadMessagesAt] = useState(0);
  function openTeam(id: string | null) {
    setSelectedTeam(id);
    setTeamPanelOpen(true);
  }
  const presence = usePlayerPresence(
    user?.username,
    !!user && (canAdmin || !!team),
    map,
    pos,
    config?.themeRevision,
  );
  function applyGame(d: GameState) {
    setChallenges(d.challenges);
    setSolved(d.solved);
    setScore(d.score);
    setActive((previous) =>
      previous ? d.challenges.find((c) => c.id === previous.id) || null : null,
    );
  }
  async function loadGame() {
    const r = await fetch("/api/game");
    const d = (await r.json()) as GameResponse;
    if (!r.ok) throw Error(d.error || "Could not load expedition.");
    applyGame(d);
  }
  useEffect(() => {
    Promise.all([
      fetch("/api/config").then(async (r) => {
        if (!r.ok) throw Error("Configuration is unavailable.");
        return (await r.json()) as GameConfig;
      }),
      fetch("/api/auth").then(
        async (r) =>
          (await r.json()) as {
            error?: string;
            admin?: boolean;
            user: User | null;
          },
      ),
    ])
      .then(async ([settings, d]) => {
        configureWorld(settings.theme.world);
        setPlace({
          map: settings.theme.world.startMap,
          pos: { ...mapInfo(settings.theme.world.startMap)!.spawn },
        });
        setConfig(settings);
        setHero(settings.characters[0].id);
        setMode(settings.allowRegistration ? "register" : "login");
        setCanAdmin(!!d.admin);
        if (d.error) throw Error(d.error);
        if (d.user) {
          setUser(d.user);
          setPlace({
            map: d.user.spawn.map,
            pos: { ...d.user.spawn.location },
          });
          await loadGame();
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    return () => {
      music.current?.dispose();
      if (audio.current) void audio.current.close();
    };
  }, []);
  useEffect(() => {
    if (!user) return;
    const refresh = async () => {
      try {
        const r = await fetch("/api/config");
        if (!r.ok) throw Error("Configuration is unavailable.");
        const latest = (await r.json()) as GameConfig;
        if (latest.themeRevision !== config?.themeRevision) {
          window.location.reload();
          return;
        }
        await loadGame();
      } catch (e) {
        setError((e as Error).message);
      }
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [!!user, config?.themeRevision]);
  async function toggleMusic() {
    if (audioBusy) return;
    setAudioError("");
    setAudioBusy(true);
    try {
      if (!muted) {
        await music.current?.mute();
        if (audio.current) await audio.current.suspend();
        setMuted(true);
      } else {
        if (!config?.audio.midi)
          throw Error("No background music is configured.");
        music.current ??= new MidiPlayer(config.audio);
        await music.current.play();
        if (audio.current) await audio.current.resume();
        setMuted(false);
      }
    } catch (e) {
      music.current?.dispose();
      music.current = null;
      setMuted(true);
      setAudioError((e as Error).message);
    } finally {
      setAudioBusy(false);
    }
  }
  function sound() {
    if (muted) return;
    audio.current ??= new AudioContext();
    const o = audio.current.createOscillator(),
      g = audio.current.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(660, audio.current.currentTime);
    o.frequency.exponentialRampToValueAtTime(
      990,
      audio.current.currentTime + 0.15,
    );
    g.gain.setValueAtTime(0.05, audio.current.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audio.current.currentTime + 0.3);
    o.connect(g);
    g.connect(audio.current.destination);
    o.start();
    o.stop(audio.current.currentTime + 0.3);
  }
  useEffect(() => {
    setNotice(
      place.travel?.at(-1)?.to === map
        ? `Arrived in ${mapName(map)}. Step off the purple spawn tile, then back onto it to return to ${mapName(place.travel.at(-1)!.from)}.`
        : map === activeWorld.startMap
          ? "Follow the paths. Cyan doorways enter buildings; purple transport tiles change maps."
          : `Welcome to ${mapName(map)}. Search for clues, then use the exit to return.`,
    );
  }, [map, place.travel]);
  function move(dx: number, dy: number) {
    if (active) return;
    setPlace((p) => step(p, dx, dy));
  }
  function search() {
    const q = challenges.find(
      (c) =>
        c.map === map &&
        !solved.includes(c.id) &&
        Math.abs(c.location.x - pos.x) + Math.abs(c.location.y - pos.y) <= 2,
    );
    if (q) {
      setActive(q);
      setAnswer(q.submission?.answer || "");
      setFeedback("");
      setHintMessage("");
      sound();
    } else if (
      config?.theme.title === "North Pole Quest" &&
      map === "castle" &&
      Math.abs(pos.x - 20) + Math.abs(pos.y - 8) <= 3
    ) {
      setNotice(
        "Santa Claus: Ho ho ho! Welcome to my Christmas castle. Explore the rooms, and keep an eye out for hidden treasures.",
      );
      sound();
    } else
      setNotice(
        solved.length === challenges.length
          ? "All treasures found! Your expedition is complete."
          : "Nothing here yet. Search near a sparkle.",
      );
  }
  useEffect(() => {
    if (!user || (!canAdmin && !team)) return;
    const handler = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).closest(
          "input,textarea,select,[contenteditable=true]",
        ) ||
        active ||
        teamPanelOpen
      )
        return;
      const dirs: Record<string, number[]> = {
        ArrowUp: [0, -1],
        w: [0, -1],
        ArrowDown: [0, 1],
        s: [0, 1],
        ArrowLeft: [-1, 0],
        a: [-1, 0],
        ArrowRight: [1, 0],
        d: [1, 0],
      };
      const d = dirs[e.key];
      if (d) {
        e.preventDefault();
        move(d[0], d[1]);
      }
      if (e.key.toLowerCase() === "e") {
        e.preventDefault();
        search();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    user,
    active,
    map,
    pos,
    challenges,
    solved,
    canAdmin,
    team,
    teamPanelOpen,
  ]);
  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, hero, mode }),
      });
      const d = (await r.json()) as {
        error?: string;
        user: User;
        challenges: Challenge[];
        solved: string[];
        score: number;
        correct: boolean;
      };
      if (!r.ok) throw Error(d.error);
      setUser(d.user);
      setCanAdmin((d as typeof d & { admin?: boolean }).admin || false);
      setPassword("");
      setPlace({ map: d.user.spawn.map, pos: { ...d.user.spawn.location } });
      setActive(null);
      await loadGame();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!active) return;
    setBusy(true);
    try {
      const r = await fetch("/api/game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: active.id,
          answer,
          revision: active.submission?.revision || 0,
        }),
      });
      const d = (await r.json()) as GameResponse;
      if (!r.ok) throw Error(d.error || "Please sign in again.");
      setFeedbackSuccess(!!(d.correct || d.submitted));
      if (d.submitted) {
        applyGame(d);
        setFeedback(
          "Response saved for admin review. You can update it until graded.",
        );
      } else if (d.correct) {
        applyGame(d);
        sound();
        setFeedback(`Treasure collected! +${d.awardedPoints} points`);
        setNotice(`${active.object} collected. Keep exploring!`);
      } else setFeedback("Not quite. Take another look and try again.");
    } catch (e) {
      setFeedbackSuccess(false);
      setFeedback((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function unlockHint(hintId: string) {
    if (!active || busy) return;
    setBusy(true);
    setFeedback("");
    setHintMessage("");
    try {
      const r = await fetch("/api/game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "hint", id: active.id, hintId }),
      });
      const d = (await r.json()) as GameResponse;
      if (!r.ok)
        throw Error(
          d.error || "Your hint could not be unlocked. Please retry.",
        );
      applyGame(d);
      const h = d.challenges
        .find((c) => c.id === active.id)
        ?.hints.find((h) => h.id === hintId);
      setHintMessage(
        h?.cost
          ? `Hint unlocked. ${h.cost} points deducted from this challenge’s reward.`
          : "Free hint unlocked.",
      );
    } catch (e) {
      setFeedback((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: unknown,
            opts: { signal: AbortSignal },
          ) => Promise<void> | void;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const controller = new AbortController();
    Promise.resolve(
      context.registerTool(
        {
          name: "read_expedition",
          description:
            "Read current explorer map, position, score, and collected treasures.",
          inputSchema: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true },
          execute: (input: unknown) => {
            if (
              !input ||
              typeof input !== "object" ||
              Object.keys(input).length
            )
              throw Error("Expected an empty object");
            return {
              signedIn: !!user,
              map,
              position: pos,
              score,
              collected: solved,
            };
          },
        },
        { signal: controller.signal },
      ),
    ).catch(() => {});
    return () => controller.abort();
  }, [user, map, pos, score, solved]);
  const chosen = heroes.find((h) => h.id === (user?.hero || hero)) || heroes[0];
  return (
    <main>
      <header>
        <a className="brand" href="/">
          <span className="brand-icon">
            {config?.theme.badge === "cpu" ? (
              <Cpu size={24} />
            ) : config?.theme.badge === "snowflake" ? (
              <Snowflake size={24} />
            ) : (
              <Compass size={24} />
            )}
          </span>{" "}
          {config?.theme.title || "North Pole Quest"}
        </a>
        <div className="header-right">
          <span className="edition">{config?.theme.description}</span>
          {user && (canAdmin || team) && (
            <button
              className="text-button game-teams-button"
              onClick={() => openTeam(null)}
            >
              Teams
              {presence.features.messaging &&
                presence.latestMessageAt > readMessagesAt && (
                  <span
                    className="message-badge"
                    aria-label="New team messages"
                  >
                    ●
                  </span>
                )}
            </button>
          )}
          {user && (
            <a href="/scoreboard" className="admin-link">
              Scores
            </a>
          )}
          {canAdmin && (
            <a href="/admin/teams" className="admin-link">
              Manage
            </a>
          )}
          <button
            className="icon-button"
            aria-label={muted ? "Enable sound" : "Mute sound"}
            onClick={toggleMusic}
            disabled={audioBusy || !config?.audio.midi}
          >
            {muted ? <VolumeX size={19} /> : <Volume2 size={19} />}
          </button>
          {user && (
            <button
              className="icon-button"
              aria-label="Sign out"
              onClick={async () => {
                try {
                  const r = await fetch("/api/auth", { method: "DELETE" });
                  if (!r.ok) throw Error();
                  setUser(null);
                  setTeamPanelOpen(false);
                  setReadMessagesAt(0);
                  setActive(null);
                  setTeam(null);
                  setCanAdmin(false);
                  setPlace({
                    map: activeWorld.startMap,
                    pos: { ...mapInfo(activeWorld.startMap)!.spawn },
                  });
                  setError("");
                } catch {
                  setError("Could not sign out. Please retry.");
                }
              }}
            >
              <LogOut size={19} />
            </button>
          )}
        </div>
      </header>
      <TeamPanel
        open={teamPanelOpen}
        onOpenChange={setTeamPanelOpen}
        selected={selectedTeam}
        onSelect={setSelectedTeam}
        onRead={(at) => setReadMessagesAt((previous) => Math.max(previous, at))}
      />
      {audioError && (
        <p role="status" className="audio-error">
          {audioError}
        </p>
      )}
      {user && !canAdmin && (
        <TeamSetup
          key={user.username}
          username={user.username}
          onChange={setTeam}
          onView={() => team && openTeam(team.id)}
          featureRevision={presence.features.revision}
        />
      )}
      {!user || !chosen ? (
        <section className="start">
          <div className="start-heading">
            <span className="eyebrow">A LITTLE WONDER. A BIG ADVENTURE.</span>
            <h1>
              Your expedition
              <br />
              starts here<span>✦</span>
            </h1>
            <p>Hidden treasures. Curious challenges. One world to explore.</p>
          </div>
          <form onSubmit={login} className="start-panel">
            <div className="form-top">
              <h2>
                {mode === "register"
                  ? "Choose your explorer"
                  : "Welcome back, explorer"}
              </h2>
              {config?.allowRegistration && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setMode(mode === "register" ? "login" : "register");
                    setError("");
                  }}
                >
                  {mode === "register"
                    ? "Already have an account?"
                    : "Create an account"}
                </button>
              )}
            </div>
            {
              <div className="heroes">
                {heroes.map((h) => (
                  <button
                    type="button"
                    key={h.id}
                    className={"hero-card " + (hero === h.id ? "selected" : "")}
                    onClick={() => setHero(h.id)}
                    aria-pressed={hero === h.id}
                  >
                    <Portrait hero={h} />
                    <span>{h.name}</span>
                    <small>{h.subtitle}</small>
                    <b>{hero === h.id ? "SELECTED" : "CHOOSE HERO"}</b>
                  </button>
                ))}
              </div>
            }
            <div className="account-fields">
              <label>
                Explorer username
                <input
                  autoComplete="username"
                  required
                  minLength={3}
                  maxLength={24}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. snowexplorer"
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  autoComplete={
                    mode === "register" ? "new-password" : "current-password"
                  }
                  required
                  minLength={8}
                  maxLength={128}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                />
              </label>
              <button className="primary" disabled={busy || loading || !config}>
                {loading
                  ? "Preparing expedition…"
                  : busy
                    ? "Opening expedition…"
                    : mode === "register"
                      ? "Begin expedition"
                      : "Continue expedition"}
              </button>
            </div>
            <p className="save-note">
              {mode === "register"
                ? "Your hero stays with your account. Your points are saved as you explore."
                : "Use your teacher-provided account. Your choice applies on first sign-in; a saved or assigned hero takes priority."}
            </p>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
          </form>
          <footer>
            <span>
              <Compass size={16} /> EXPLORE AT YOUR OWN PACE
            </span>
            <span>Built for curious minds</span>
          </footer>
        </section>
      ) : canAdmin || team ? (
        <section className="game-layout">
          <div className="play-column">
            <div className="play-heading">
              <div>
                <span className="eyebrow">EXPEDITION 01</span>
                <h1>{mapName(map)}</h1>
              </div>
              <span className="region-pill">
                {config?.theme.badge === "cpu" ? (
                  <Cpu size={16} />
                ) : (
                  <Compass size={16} />
                )}{" "}
                {map === activeWorld.startMap ? "World map" : "Indoors"}
              </span>
            </div>
            <World
              hero={chosen}
              players={presence.players}
              onTeamSelect={openTeam}
              characters={heroes}
              map={map}
              pos={pos}
              challenges={challenges}
              solved={solved}
              onMove={move}
              onSearch={search}
            />
            <p className="presence-note" role="status">
              {presence.status ||
                (presence.visibility === "off"
                  ? "Player visibility is turned off."
                  : `${presence.players.length} ${presence.visibility === "team" ? "teammates" : "other players"} on this map · positions update every 3 seconds`)}
            </p>
            <div className="controls">
              <span>
                <kbd>W</kbd>
                <kbd>A</kbd>
                <kbd>S</kbd>
                <kbd>D</kbd> or arrow keys to move
              </span>
              <span>
                <kbd>E</kbd> search nearby
              </span>
              <span>Look for ✦ sparkles</span>
            </div>
            <div className="message" role="status">
              <span className="message-icon">✦</span>
              <div>
                <b>
                  {solved.length === challenges.length && challenges.length
                    ? "Expedition complete"
                    : "A note from the expedition"}
                </b>
                <p>{notice}</p>
              </div>
            </div>
            {error && (
              <div className="error">
                {error}{" "}
                <button
                  onClick={() =>
                    loadGame()
                      .then(() => setError(""))
                      .catch((e) => setError(e.message))
                  }
                >
                  Retry expedition
                </button>
              </div>
            )}
          </div>
          <aside>
            <div className="explorer">
              <span className="eyebrow">YOUR EXPLORER</span>
              <div className="explorer-info">
                <Portrait hero={chosen} />
                <div>
                  <h2>{chosen.name}</h2>
                  <p>@{user.username}</p>
                  <span className="small-pill">LEVEL 01 · EXPLORER</span>
                </div>
              </div>
            </div>
            <div className="score-panel">
              <Trophy size={22} />
              <span>Expedition points</span>
              <strong>{score.toLocaleString()}</strong>
              <small>Every discovery counts.</small>
            </div>
            <div className="journal">
              <div className="journal-title">
                <h2>Treasure journal</h2>
                <span>
                  {solved.length} / {challenges.length}
                </span>
              </div>
              <div className="progress">
                <i
                  style={{
                    width: `${challenges.length ? (solved.length / challenges.length) * 100 : 0}%`,
                  }}
                />
              </div>
              <p>
                Find an object. Solve its challenge.
                <br />
                Add a little magic to your journey.
              </p>
              {challenges.map((q, i) => (
                <div
                  className={
                    "journal-item " + (solved.includes(q.id) ? "found" : "")
                  }
                  key={q.id}
                >
                  <span className="item-icon">
                    {solved.includes(q.id)
                      ? "✦"
                      : String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <b>
                      {solved.includes(q.id) || q.submission
                        ? q.object
                        : "Undiscovered treasure"}
                    </b>
                    <small>
                      {q.region}
                      {q.submission?.status === "pending"
                        ? " · Awaiting review"
                        : ""}
                    </small>
                    {q.submission && (
                      <button
                        className="text-button"
                        onClick={() => {
                          setActive(q);
                          setAnswer(q.submission!.answer);
                          setFeedback("");
                          setHintMessage("");
                        }}
                      >
                        View response
                      </button>
                    )}
                  </div>
                  <span>
                    {solved.includes(q.id) ? "✓" : `+${q.remainingPoints}`}
                  </span>
                </div>
              ))}
            </div>
            <div className="tip">
              <Flag size={20} />
              <div>
                <b>A tip for the trail</b>
                <p>
                  Get close to a sparkle, then search. There’s no penalty for
                  trying again.
                </p>
              </div>
            </div>
          </aside>
        </section>
      ) : null}
      <Dialog
        open={!!active}
        onOpenChange={(v) => {
          if (!v) setActive(null);
        }}
      >
        <DialogContent className="challenge-modal">
          <span className="eyebrow">CHALLENGE</span>
          <DialogTitle>{active?.object}</DialogTitle>
          <div className="challenge-meta">
            <span>{active?.region}</span>
            <span>
              +{active?.awardedPoints ?? active?.remainingPoints} points
            </span>
          </div>
          <p className="question">{active?.text}</p>
          <p className="reward-details">
            {active?.grading === "manual"
              ? "Written response · admin review"
              : active?.caseSensitive
                ? "Case-sensitive flag"
                : "Case-insensitive flag"}
            {active && active.hintCost > 0
              ? ` · ${active.hintCost} points spent on hints`
              : ""}
          </p>
          {!!active?.downloads.length && (
            <section
              className="challenge-downloads"
              aria-label="Challenge files"
            >
              <h3>Challenge files</h3>
              {active.downloads.map((file) => (
                <a
                  key={file.url}
                  href={file.url}
                  download={file.filename || file.name}
                  target={file.url.startsWith("https:") ? "_blank" : undefined}
                  rel="noopener noreferrer"
                >
                  <span>↓</span> {file.name}
                </a>
              ))}
            </section>
          )}
          <form onSubmit={submit}>
            <label>
              Your answer
              {active?.grading === "manual" ? (
                <textarea
                  aria-label="Your answer"
                  autoFocus
                  required
                  rows={7}
                  maxLength={20000}
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  disabled={active.submission?.status === "graded"}
                  placeholder="Write your response here…"
                />
              ) : (
                <input
                  autoFocus
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  required
                  maxLength={500}
                  disabled={!!active && solved.includes(active.id)}
                  placeholder="What do you think?"
                />
              )}
            </label>
            {active && solved.includes(active.id) ? (
              <button
                className="primary"
                type="button"
                onClick={() => setActive(null)}
              >
                Keep exploring
              </button>
            ) : (
              <button className="primary" disabled={busy}>
                {busy
                  ? "Saving…"
                  : active?.grading === "manual"
                    ? active.submission
                      ? "Update response"
                      : "Submit for review"
                    : "Check answer"}
              </button>
            )}
          </form>
          {active?.submission && (
            <section className="submission-status" aria-label="Response status">
              <b>
                {active.submission.status === "pending"
                  ? "Awaiting admin review"
                  : `Graded: ${active.awardedPoints} points`}
              </b>
              <p>
                {active.submission.feedback ||
                  (active.submission.status === "pending"
                    ? "Your written answer is saved. Points will appear after grading."
                    : "Your grade is saved.")}
              </p>
            </section>
          )}
          {!!active?.hints.length && (
            <section className="challenge-hints" aria-label="Challenge hints">
              <h3>
                Hints <small>Costs reduce this challenge’s reward.</small>
              </h3>
              {active.hints.map((h) => (
                <div className="challenge-hint" key={h.id}>
                  <div className="hint-title">
                    <b>{h.label}</b>
                    {h.unlocked ? (
                      <span>
                        {h.cost
                          ? `${h.cost} points · unlocked`
                          : "Free · unlocked"}
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={
                          busy ||
                          solved.includes(active.id) ||
                          !!active.submission
                        }
                        onClick={() => unlockHint(h.id)}
                      >
                        {h.cost
                          ? `Unlock · ${h.cost} points`
                          : "Reveal free hint"}
                      </button>
                    )}
                  </div>
                  {h.unlocked && <p>{h.text}</p>}
                </div>
              ))}
            </section>
          )}
          {hintMessage && (
            <p className="hint-status" role="status">
              {hintMessage}
            </p>
          )}
          {feedback && (
            <p role="status" className={feedbackSuccess ? "success" : "error"}>
              {feedback}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
