"use client";
import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { MidiPlayer, type MusicConfig } from "@/lib/midi-player";
import {
  Compass,
  Snowflake,
  Trophy,
  Volume2,
  VolumeX,
  LogOut,
  Sparkles,
  MapPin,
  Flag,
} from "lucide-react";
import { buildings, trees, step, mapName } from "@/lib/world-data.mjs";
import { drawInterior } from "@/lib/interior-renderer";
type Hero = string;
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
};
type Challenge = {
  id: string;
  map: string;
  object: string;
  location: { x: number; y: number };
  region: string;
  text: string;
  points: number;
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
function drawCharacter(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  character: Character,
  image: HTMLImageElement | null,
  size: number,
) {
  if (image) {
    const ratio = image.width / image.height;
    const h = size,
      w = size * ratio;
    ctx.drawImage(image, x - w / 2, y - h / 2, w, h);
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
}: {
  hero: Character;
  map: string;
  pos: { x: number; y: number };
  challenges: Challenge[];
  solved: string[];
  onMove: (x: number, y: number) => void;
  onSearch: () => void;
  onSelect?: (x: number, y: number) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const image = useSprite(hero.sprite);
  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    const t = 24;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, 960, 672);
    if (map === "town") {
      for (let y = 0; y < 28; y++)
        for (let x = 0; x < 40; x++) {
          ctx.fillStyle = (x * 7 + y * 13) % 11 === 0 ? "#c9e5e9" : "#dfedef";
          ctx.fillRect(x * t, y * t, t, t);
          if ((x * 11 + y * 3) % 9 === 0) {
            ctx.fillStyle = "#b6d7df";
            ctx.fillRect(x * t + 7, y * t + 14, 3, 2);
          }
        }
      ctx.fillStyle = "#bdd1cf";
      ctx.fillRect(17 * t, 7 * t, 3 * t, 20 * t);
      ctx.fillRect(8 * t, 16 * t, 22 * t, 3 * t);
      ctx.fillRect(6 * t, 7 * t, 27 * t, 2 * t);
      ctx.fillRect(3 * t, 21 * t, 15 * t, 2 * t);
      ctx.fillRect(32 * t, 14 * t, 2 * t, 4 * t);
      ctx.fillRect(10 * t, 5 * t, 2 * t, 4 * t);
      // Town square and its decorated Christmas tree.
      ctx.fillStyle = "#d0d9cb";
      ctx.fillRect(16 * t, 11 * t, 7 * t, 7 * t);
      ctx.fillStyle = "#346c5c";
      ctx.fillRect(19 * t - 12, 14 * t, 72, 24);
      ctx.fillRect(19 * t - 4, 13 * t, 56, 24);
      ctx.fillRect(19 * t + 4, 12 * t, 40, 24);
      ctx.fillRect(19 * t + 12, 11 * t + 12, 24, 24);
      ctx.fillStyle = "#f2d081";
      ctx.fillRect(20 * t - 4, 11 * t + 6, 8, 12);
      ctx.fillRect(20 * t - 8, 11 * t + 10, 16, 4);
      for (const [dx, dy] of [
        [4, 34],
        [26, 42],
        [14, 58],
        [35, 64],
      ]) {
        ctx.fillStyle = dx % 2 ? "#e7bd76" : "#cd6263";
        ctx.fillRect(19 * t + dx, 11 * t + dy, 7, 7);
      }
      ctx.fillStyle = "#b94d59";
      ctx.fillRect(18 * t, 15 * t, 16, 18);
      ctx.fillStyle = "#efd496";
      ctx.fillRect(18 * t + 6, 15 * t, 4, 18);
      ctx.fillStyle = "#487e83";
      ctx.fillRect(21 * t, 15 * t, 18, 16);
      ctx.fillStyle = "#9ec6d1";
      ctx.fillRect(23 * t, 17 * t, 9 * t, 7 * t);
      ctx.fillStyle = "#77afc3";
      ctx.fillRect(24 * t, 18 * t, 7 * t, 5 * t);
      ctx.fillStyle = "#bfe3e7";
      for (let i = 0; i < 7; i++)
        ctx.fillRect((24 + i) * t, (18 + (i % 4)) * t, 20, 3);
      for (const b of buildings) {
        const x = b.x * t,
          y = b.y * t;
        ctx.fillStyle = "#adc4cb";
        ctx.fillRect(x + 8, y + 12, b.w * t, b.h * t);
        ctx.fillStyle = b.color;
        ctx.fillRect(x, y + 24, b.w * t, b.h * t - 24);
        ctx.fillStyle = "#4c353d";
        ctx.fillRect(x - 6, y + 12, b.w * t + 12, 30);
        ctx.fillStyle = "#fff7e6";
        ctx.fillRect(x - 6, y + 8, b.w * t + 12, 12);
        ctx.fillStyle = "#d9e9e7";
        ctx.fillRect(x + 8, y, b.w * t - 16, 12);
        ctx.fillStyle = "#f5c677";
        ctx.fillRect(x + 14, y + 50, 18, 18);
        ctx.fillRect(x + b.w * t - 32, y + 50, 18, 18);
        ctx.fillStyle = "#483a43";
        ctx.fillRect(x + (b.w * t) / 2 - 10, y + b.h * t - 28, 20, 28);
        ctx.fillStyle = "#cf7180";
        ctx.fillRect(x + b.w * t - 26, y - 8, 12, 22);
        if (b.id === "castle") {
          for (const towerX of [x, x + b.w * t - 48]) {
            ctx.fillStyle = "#b9475b";
            ctx.fillRect(towerX, y, 48, 6 * t);
            for (let stripe = 0; stripe < 6; stripe++) {
              ctx.fillStyle = stripe % 2 ? "#f3e5cb" : "#b9475b";
              ctx.fillRect(towerX, y + stripe * 24, 48, 10);
            }
            ctx.fillStyle = "#235f59";
            ctx.fillRect(towerX - 6, y - 8, 60, 24);
            ctx.fillStyle = "#f4edda";
            ctx.fillRect(towerX - 6, y - 8, 60, 6);
            ctx.fillStyle = "#e9c470";
            ctx.fillRect(towerX + 23, y - 24, 3, 18);
            ctx.fillStyle = "#c44959";
            ctx.fillRect(towerX + 26, y - 24, 20, 10);
          }
          ctx.fillStyle = "#2f7360";
          ctx.fillRect(x + 48, y + 3 * t, b.w * t - 96, 9);
          for (let i = 0; i < 6; i++) {
            ctx.fillStyle = i % 2 ? "#f2d48b" : "#cf6661";
            ctx.fillRect(x + 54 + i * 22, y + 3 * t, 6, 8);
          }
          ctx.fillStyle = "#374745";
          ctx.fillRect(b.door.x * t, b.door.y * t, 24, 24);
          ctx.fillStyle = "#d5b86d";
          ctx.fillRect(b.door.x * t + 4, b.door.y * t + 2, 16, 22);
        } else {
          ctx.fillStyle = "#ecd296";
          ctx.fillRect(b.door.x * t + 4, b.door.y * t, 16, 24);
          ctx.fillStyle = "#2e735e";
          ctx.fillRect(b.door.x * t + 7, b.door.y * t + 3, 10, 10);
        }
      }
      for (const [x, y] of trees) {
        const a = x * t + 12,
          b = y * t + 10;
        ctx.fillStyle = "#aecbd2";
        ctx.fillRect(a - 12, b + 10, 29, 10);
        ctx.fillStyle = "#745a52";
        ctx.fillRect(a - 3, b + 3, 6, 16);
        for (let i = 0; i < 3; i++) {
          ctx.fillStyle = ["#21585c", "#2e7775", "#438a83"][i];
          ctx.fillRect(a - 15 + i * 4, b - 4 - i * 9, 30 - i * 8, 13);
          ctx.fillStyle = "#edf5eb";
          ctx.fillRect(a - 10 + i * 3, b - 5 - i * 9, 20 - i * 6, 4);
        }
      }
      ctx.font = "bold 10px monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = "#526e7c";
      ctx.fillText("SANTA’S CHRISTMAS CASTLE", 20 * t, 8 * t);
      ctx.fillText("EVERGREEN GROVE", 8 * t, 5 * t);
      ctx.fillText("AURORA RIDGE", 29 * t, 5 * t);
      ctx.fillText("FROSTBITE LAKE", 27.5 * t, 24.5 * t);
      ctx.fillText("LANTERN LANE", 10.5 * t, 18 * t);
    } else drawInterior(ctx, map);
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
    // Trail markers and lamplights.
    if (map === "town")
      for (const x of [14, 21]) {
        ctx.fillStyle = "#677c83";
        ctx.fillRect(x * t, 16 * t - 15, 3, 30);
        ctx.fillStyle = "#ffe6a1";
        ctx.fillRect(x * t - 3, 16 * t - 18, 9, 9);
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
  }, [hero, image, map, pos, challenges, solved, onSelect]);
  return (
    <div className="world">
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
            ? `Challenge location picker: ${mapName(map)}. Click a tile or use arrow keys to choose a location.`
            : `North Pole exploration map: ${mapName(map)}. Use arrow keys or WASD to move, E to search, and walk into doorways to enter or exit.`
        }
      />
      <div className="map-label">
        <span className="live-dot" />{" "}
        {map === "town" ? "NORTH POLE" : mapName(map).toUpperCase()}{" "}
        <span>
          {map === "town" ? "38° BELOW · CLEAR SKIES" : "WARM & COZY"}
        </span>
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
  const [user, setUser] = useState<{ username: string; hero: Hero } | null>(
      null,
    ),
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
    [place, setPlace] = useState({ map: "town", pos: { x: 18, y: 20 } }),
    [active, setActive] = useState<Challenge | null>(null),
    [answer, setAnswer] = useState(""),
    [feedback, setFeedback] = useState(""),
    [hintMessage, setHintMessage] = useState(""),
    [notice, setNotice] = useState(
      "Follow the paths. Look for a glimmer in the snow.",
    ),
    [muted, setMuted] = useState(true);
  const { map, pos } = place;
  const audio = useRef<AudioContext | null>(null);
  const music = useRef<MidiPlayer | null>(null);
  const [config, setConfig] = useState<GameConfig | null>(null);
  const [audioError, setAudioError] = useState("");
  const [audioBusy, setAudioBusy] = useState(false);
  const heroes = config?.characters || [];
  const [canAdmin, setCanAdmin] = useState(false);
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
            user: { username: string; hero: Hero } | null;
          },
      ),
    ])
      .then(async ([settings, d]) => {
        setConfig(settings);
        setHero(settings.characters[0].id);
        setMode(settings.allowRegistration ? "register" : "login");
        setCanAdmin(!!d.admin);
        if (d.error) throw Error(d.error);
        if (d.user) {
          setUser(d.user);
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
    const refresh = () => {
      void loadGame().catch((e) => setError(e.message));
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [!!user]);
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
      map === "town"
        ? "Walk into a lit doorway to enter a building. Santa’s castle is at the north end of town."
        : map === "castle"
          ? "Welcome to Santa’s Christmas castle! Visit Santa near his throne, then explore. Walk through the southern door to return to town."
          : `Welcome to ${mapName(map)}. Look around, then walk through the southern door to return to town.`,
    );
  }, [map]);
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
      setAnswer("");
      setFeedback("");
      setHintMessage("");
      sound();
    } else if (
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
          : "Nothing here yet. Search near a sparkle in the snow.",
      );
  }
  useEffect(() => {
    if (!user) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches("input,textarea") || active) return;
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
  }, [user, active, map, pos, challenges, solved]);
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
        user: { username: string; hero: Hero };
        challenges: Challenge[];
        solved: string[];
        score: number;
        correct: boolean;
      };
      if (!r.ok) throw Error(d.error);
      setUser(d.user);
      setCanAdmin((d as typeof d & { admin?: boolean }).admin || false);
      setPassword("");
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
        body: JSON.stringify({ id: active.id, answer }),
      });
      const d = (await r.json()) as GameResponse;
      if (!r.ok) throw Error(d.error || "Please sign in again.");
      if (d.correct) {
        applyGame(d);
        sound();
        setFeedback(`Treasure collected! +${d.awardedPoints} points`);
        setNotice(`${active.object} collected. Keep exploring!`);
      } else setFeedback("Not quite. Take another look and try again.");
    } catch (e) {
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
            <Snowflake size={24} />
          </span>{" "}
          NORTH POLE <b>QUEST</b>
        </a>
        <div className="header-right">
          <span className="edition">THE WINTER EXPEDITION</span>
          {canAdmin && (
            <a href="/admin" className="admin-link">
              Manage challenges
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
                  setPlace({ map: "town", pos: { x: 18, y: 20 } });
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
      {audioError && (
        <p role="status" className="audio-error">
          {audioError}
        </p>
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
            <p>
              Hidden treasures. Curious challenges. One snowy world to explore.
            </p>
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
      ) : (
        <section className="game-layout">
          <div className="play-column">
            <div className="play-heading">
              <div>
                <span className="eyebrow">EXPEDITION 01</span>
                <h1>{mapName(map)}</h1>
              </div>
              <span className="region-pill">
                <Snowflake size={16} />{" "}
                {map === "town" ? "Winter village" : "Indoors"}
              </span>
            </div>
            <World
              hero={chosen}
              map={map}
              pos={pos}
              challenges={challenges}
              solved={solved}
              onMove={move}
              onSearch={search}
            />
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
                    : "A note from the North Pole"}
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
                      {solved.includes(q.id)
                        ? q.object
                        : "Undiscovered treasure"}
                    </b>
                    <small>{q.region}</small>
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
      )}
      <Dialog
        open={!!active}
        onOpenChange={(v) => {
          if (!v) setActive(null);
        }}
      >
        <DialogContent className="challenge-modal">
          <span className="eyebrow">A TREASURE IN THE SNOW</span>
          <DialogTitle>{active?.object}</DialogTitle>
          <div className="challenge-meta">
            <span>{active?.region}</span>
            <span>
              +{active?.awardedPoints ?? active?.remainingPoints} points
            </span>
          </div>
          <p className="question">{active?.text}</p>
          <p className="reward-details">
            {active?.caseSensitive
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
              <input
                autoFocus
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                required
                maxLength={500}
                disabled={!!active && solved.includes(active.id)}
                placeholder="What do you think?"
              />
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
                {busy ? "Checking…" : "Check answer"}
              </button>
            )}
          </form>
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
                        disabled={busy || solved.includes(active.id)}
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
            <p
              role="status"
              className={
                active && solved.includes(active.id) ? "success" : "error"
              }
            >
              {feedback}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
