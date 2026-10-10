"use client";
// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
import TeamPanel from "./team-panel";
import ChallengeCutscene, { type Cutscene } from "./challenge-cutscene";
import { EntityConversation, EntityMarker } from "./entity-dialogue";
import type { EntitySummary } from "@/lib/non-player-entities";
import { clientUuid } from "@/lib/client-uuid.mjs";
import { KEY_PALETTE, hintCostLabel } from "@/lib/inventory-data.mjs";
import { PlayerInventory, TransportUnlock, type Inventory, type LockedTransport } from "./player-inventory";
import { usePlayerPresence, type NearbyPlayer, type SolveShine } from "./use-player-presence";
import TeamSetup, { type Team } from "./team-setup";
import { useEffect, useRef, useState } from "react";
import ScoresPanel from "./scoreboard/scores-panel";
import TeamPointGifts from "./team-point-gifts";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import NotificationsInbox from "./notifications-inbox";
import { MidiPlayer, type MusicConfig } from "@/lib/midi-player";
import {
  Crown,
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
  portalTiles,
  transitionAt,
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
  role?: "admin" | "student";
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
    world: typeof activeWorld & { entities?: EntitySummary[] };
  };
  themeRevision: number;
  scoreboard: { visibility: "admins" | "all"; mode: string };
};
type Challenge = {
  solveCount?: number;
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
  answerRules?: string | null;
  caseSensitive: boolean;
  remainingPoints: number;
  awardedPoints: number | null;
  hintCost: number;
  hints: {
    id: string;
    label: string;
    cost: number;
    rewardCost: { keys: string[]; incantationCount: number };
    available: boolean;
    unlocked: boolean;
    text?: string;
  }[];
  downloads: { name: string; url: string; filename?: string }[];
  discoveryVideo?: string | null;
  solveVideo?: string | null;
  discoveryCutsceneSeen?: boolean;
  solveCutsceneSeen?: boolean;
  rewards?: { keys: string[]; incantationCount: number };
};
type GameState = {
  entities?: EntitySummary[];
  challenges: Challenge[];
  solved: string[];
  score: number;
  discovered: string[];
  inventory: Inventory;
  unlockedTransports: string[];
  expeditionComplete: boolean;
};
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
const adminAvatar: Character = {
  id: "quest-admin",
  name: "Administrator",
  subtitle: "Game master",
  sprite: null,
  fallback: "shield",
};
function drawCharacter(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  character: Character,
  image: HTMLImageElement | null,
  size: number,
) {
  if (character === adminAvatar) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size / 32, size / 32);
    const r = (c: string, a: number, b: number, w: number, h: number) => {
      ctx.fillStyle = c;
      ctx.fillRect(a, b, w, h);
    };
    r("#1d203f", -9, 12, 18, 3);
    r("#ede5ff", -6, -15, 12, 4);
    r("#eac6a2", -5, -11, 10, 8);
    r("#413568", -5, -7, 10, 2);
    r("#805dcc", -8, -2, 16, 14);
    r("#eee5ff", -2, -2, 4, 14);
    r("#e9c970", -8, 9, 16, 3);
    r("#34334e", -6, 12, 5, 3);
    r("#34334e", 1, 12, 5, 3);
    r("#e9c970", 10, -10, 2, 24);
    r("#8ae6ff", 8, -15, 6, 6);
    r("#d5e8ff", -12, 0, 5, 7);
    r("#4b587c", -11, 1, 3, 5);
    ctx.restore();
  } else if (image) {
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
  onInventory,
  inventoryCount = 0,
  onSelect,
  selectionAllowed,
  selectionLabel,
  selectedChallengeId,
  onChallengeDrop,
  entities = [],
  players = [],
  characters = [],
  onPlayerSelect,
  selfPlayer,
  messageCount = 0,
  solveShines = [],
  selfMarkers = { teammate: false, crowned: false },
  unlockedTransports = [],
}: {
  hero: Character;
  map: string;
  pos: { x: number; y: number };
  challenges: Challenge[];
  solved: string[];
  onMove: (x: number, y: number) => void;
  onSearch: () => void;
  onInventory?: () => void;
  inventoryCount?: number;
  onSelect?: (x: number, y: number) => void;
  selectionAllowed?: (map: string, x: number, y: number) => boolean;
  selectionLabel?: string;
  selectedChallengeId?: string;
  onChallengeDrop?: (id: string, x: number, y: number) => void;
  entities?: EntitySummary[];
  players?: NearbyPlayer[];
  characters?: Character[];
  onPlayerSelect?: (x: number, y: number) => void;
  selfPlayer?: NearbyPlayer;
  messageCount?: number;
  solveShines?: SolveShine[];
  selfMarkers?: { teammate: boolean; crowned: boolean };
  unlockedTransports?: string[];
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ id: string; pointerId: number; startX: number; startY: number; active: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [dragPreview, setDragPreview] = useState<{ id: string; x: number; y: number } | null>(null);
  function tileAt(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
    const r = canvas.getBoundingClientRect();
    return { x: Math.floor((clientX - r.left) / r.width * 40), y: Math.floor((clientY - r.top) / r.height * 28) };
  }
  function cancelDrag() {
    if (drag.current?.active) suppressClick.current = true;
    drag.current = null;
    setDragPreview(null);
  }
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
    const portals = portalTiles(map).map((p) => p.location);
    ctx.strokeStyle = "#77d8e3";
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
    for (const p of [...portalTiles(map).map(p => ({...p,...p.location})), ...transportTiles(map)]) {
      if (!p.lock) continue;
      const open = unlockedTransports.includes(p.id);
      ctx.fillStyle = open ? "#4ade80" : p.lock.type === "key" ? KEY_PALETTE[p.lock.color as keyof typeof KEY_PALETTE] : "#c084fc";
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = 2;
      ctx.fillRect(p.x * t + 6, p.y * t + 10, 12, 10);
      ctx.beginPath(); ctx.arc(p.x * t + 12, p.y * t + 10, 5, Math.PI, 0); ctx.stroke();
      ctx.fillStyle = "#102532"; ctx.font = "bold 10px Arial"; ctx.textAlign = "center";
      ctx.fillText(open ? "✓" : "•", p.x * t + 12, p.y * t + 18);
    }
    for (const q of challenges) {
      if (q.map !== map || solved.includes(q.id)) continue;
      const location = dragPreview?.id === q.id ? dragPreview : q.location;
      const a = location.x * t + 12,
        b = location.y * t + 12;
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
      if (dragPreview) {
        const valid = (selectionAllowed || canPlaceChallenge)(map, dragPreview.x, dragPreview.y);
        ctx.fillStyle = valid ? "#4ade8055" : "#f8717155";
        ctx.fillRect(dragPreview.x * t, dragPreview.y * t, t, t);
        ctx.strokeStyle = valid ? "#4ade80" : "#f87171";
        ctx.strokeRect(dragPreview.x * t + 1, dragPreview.y * t + 1, t - 2, t - 2);
      }
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
    unlockedTransports,
    dragPreview,
  ]);
  return (
    <div className={onSelect ? "world world-editor" : "world"}>
      <div className="world-surface">
        <canvas
          ref={ref}
          width={960}
          height={672}
          className={onChallengeDrop ? "challenge-drag-enabled" : undefined}
          style={dragPreview ? { cursor: "grabbing" } : undefined}
          tabIndex={onSelect ? 0 : undefined}
          onPointerDown={onChallengeDrop ? e => {
            suppressClick.current = false;
            if (e.button !== 0 || !e.isPrimary) return;
            const tile = tileAt(e.currentTarget, e.clientX, e.clientY);
            const selected = challenges.find(c => c.id === selectedChallengeId && c.map === map && c.location.x === tile.x && c.location.y === tile.y);
            if (!selected) return;
            e.currentTarget.focus({ preventScroll: true });
            drag.current = { id: selected.id, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, active: false };
            e.currentTarget.setPointerCapture(e.pointerId);
          } : undefined}
          onPointerMove={onChallengeDrop ? e => {
            const current = drag.current;
            if (!current || e.pointerId !== current.pointerId) return;
            if (!current.active && Math.hypot(e.clientX - current.startX, e.clientY - current.startY) < 4) return;
            current.active = true;
            e.preventDefault();
            setDragPreview({ id: current.id, ...tileAt(e.currentTarget, e.clientX, e.clientY) });
          } : undefined}
          onPointerUp={onChallengeDrop ? e => {
            const current = drag.current;
            if (!current || e.pointerId !== current.pointerId) return;
            drag.current = null;
            setDragPreview(null);
            if (current.active) {
              suppressClick.current = true;
              const tile = tileAt(e.currentTarget, e.clientX, e.clientY);
              onChallengeDrop(current.id, tile.x, tile.y);
            }
            if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
          } : undefined}
          onPointerCancel={onChallengeDrop ? cancelDrag : undefined}
          onLostPointerCapture={onChallengeDrop ? cancelDrag : undefined}
          onClick={
            onSelect
              ? (e) => {
                  if (suppressClick.current) { suppressClick.current = false; return; }
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
                  if (e.key === "Escape" && drag.current) { e.preventDefault(); cancelDrag(); return; }
                  if (drag.current) return;
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
              ? `${selectionLabel || "Challenge location picker"}: ${mapName(map)}. Click a tile or use arrow keys to choose a location.${onChallengeDrop ? " Select a challenge, then drag it to move. Escape cancels a drag." : ""}`
              : `Exploration map: ${mapName(map)}. Use arrow keys or WASD to move, E to search, and walk into doorways to enter or exit.`
          }
        />
        {!onSelect && solveShines.map((shine) => (
          <div key={shine.key} className="challenge-solve-shine" role="status" aria-label="A challenge was solved" style={{ left: `${((shine.x + 0.5) / 40) * 100}%`, top: `${((shine.y + 0.5) / 28) * 100}%` }}>✦</div>
        ))}
        <div className="entity-map-layer">{entities.filter(e => e.map === map).map(e => <EntityMarker key={e.id} entity={e} character={characters.find(c => c.id === e.characterId)} />)}</div>
        {!onSelect && selfPlayer && (
          <div className="nearby-player-layer" aria-label="Players on this map">
            {messageCount > 0 && (
              <div
                className="avatar-message-badge"
                role="status"
                aria-label={`${messageCount} new messages`}
                style={{
                  left: `${((pos.x + 0.5) / 40) * 100}%`,
                  top: `${((pos.y + 0.5) / 28) * 100}%`,
                }}
              >
                {messageCount}
              </div>
            )}
            {players.some((p) => p.x === pos.x && p.y === pos.y) &&
              (selfMarkers.teammate || selfMarkers.crowned) && (
                <div
                  className="self-player-markers"
                  style={{
                    left: `${((pos.x + 0.5) / 40) * 100}%`,
                    top: `${((pos.y + 0.5) / 28) * 100}%`,
                  }}
                  aria-label="Your explorer markers"
                >
                  {selfMarkers.teammate && (
                    <i className="team-halo" aria-hidden="true" />
                  )}
                  {selfMarkers.crowned && (
                    <Crown className="team-crown" aria-hidden="true" />
                  )}
                </div>
              )}

            {Array.from(
              new Map(
                [...players, selfPlayer].map((p) => [
                  `${p.x},${p.y}`,
                  { x: p.x, y: p.y },
                ]),
              ).values(),
            ).map((tile) => {
              const occupants = [...players, selfPlayer].filter(
                (p) => p.x === tile.x && p.y === tile.y,
              );
              const p =
                occupants.find((p) => p.username !== selfPlayer.username) ||
                selfPlayer;
              const own = p.username === selfPlayer.username;
              const character =
                p.role === "admin"
                  ? adminAvatar
                  : characters.find((c) => c.id === p.hero);
              return (
                <button
                  type="button"
                  key={`${tile.x},${tile.y}`}
                  className={
                    "nearby-player " +
                    (p.teammate ? "teammate " : "") +
                    (p.crowned ? "crowned" : "")
                  }
                  style={{
                    left: `${((tile.x + 0.5) / 40) * 100}%`,
                    top: `${((tile.y + 0.5) / 28) * 100}%`,
                  }}
                  aria-label={`View players: ${occupants.map((p) => p.username).join(", ")}`}
                  onClick={() => onPlayerSelect?.(tile.x, tile.y)}
                >
                  {p.teammate && <i className="team-halo" aria-hidden="true" />}
                  {!own && character && <Portrait hero={character} />}
                  {p.crowned && (
                    <Crown className="team-crown" aria-hidden="true" />
                  )}
                  {!own && <span>{p.username}</span>}
                  {occupants.length > 1 && (
                    <b className="player-count">{occupants.length}</b>
                  )}
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
          <div className="map-actions">
            {onInventory && <button type="button" className="map-inventory-link" aria-haspopup="dialog" onClick={onInventory}>
              Inventory{inventoryCount > 0 ? ` (${inventoryCount})` : ""}
            </button>}
            <button type="button" onClick={onSearch}>
              <Sparkles size={16} /> Search nearby <kbd>E</kbd>
            </button>
          </div>
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
  const [discovered, setDiscovered] = useState<string[]>([]);
  const [inventory, setInventory] = useState<Inventory>({keys:[],incantations:[]});
  const [unlockedTransports, setUnlockedTransports] = useState<string[]>([]);
  const [expeditionComplete, setExpeditionComplete] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [lockedTransport, setLockedTransport] = useState<LockedTransport | null>(null);
  const [talkingTo, setTalkingTo] = useState<EntitySummary | null>(null);
  const [nearbyOptions, setNearbyOptions] = useState<{ entities: EntitySummary[]; challenges: Challenge[] } | null>(null);
  const [cutsceneQueue, setCutsceneQueue] = useState<Cutscene[]>([]);
  const cutsceneRequests = useRef(new Set<string>());
  const playbackSession = useRef(0);
  const cutscene = cutsceneQueue[0];
  const cutsceneOpen = !!cutscene;
  async function playCutscene(q: Challenge, phase: "discovery" | "solve", replay = false) {
    const key = `${q.id}:${phase}`;
    if (!replay && cutsceneRequests.current.has(key)) return;
    if (!replay) cutsceneRequests.current.add(key);
    const session = playbackSession.current;
    try {
      const r = await fetch("/api/game", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cutscene", id: q.id, phase, replay }),
      });
      const d = await r.json() as { play: boolean; url?: string; error?: string };
      if (!r.ok) throw Error(d.error || "The cutscene could not be opened.");
      if (session === playbackSession.current && d.play && d.url) {
        const url = d.url;
        setCutsceneQueue(queue => [...queue, { id: q.id, object: q.object, phase, url, playbackId: clientUuid() }]);
      }
    } catch (e) {
      if (session === playbackSession.current) {
        cutsceneRequests.current.delete(key);
        setNotice((e as Error).message);
      }
    }
  }
  function openChallenge(q: Challenge) {
    setNearbyOptions(null);
    const session = playbackSession.current;
    setActive(q);
    setAnswer(q.submission?.answer || "");
    setFeedback("");
    setHintMessage("");
    void (async () => {
      try {
        const r = await fetch("/api/game", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: q.id, action: "discover" }),
        });
        const d = await r.json() as GameResponse;
        if (session !== playbackSession.current) return;
        if (!r.ok) throw Error(d.error || "Could not save discovery. Open this challenge again to retry.");
        const latest = d.challenges.find(c => c.id === q.id);
        if (latest?.discoveryVideo && !latest.discoveryCutsceneSeen) await playCutscene(latest, "discovery");
        if (session === playbackSession.current) applyGame(d);
      } catch (e) { if (session === playbackSession.current) setNotice((e as Error).message); }
    })();
  }
  const [scoreboardOpen, setScoreboardOpen] = useState(false);
  const [team, setTeam] = useState<Team | null>(null);
  const [playerTile, setPlayerTile] = useState<{
    map: string;
    x: number;
    y: number;
  } | null>(null);
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
  const [entities, setEntities] = useState<EntitySummary[]>([]);
  function applyGame(d: GameState) {
    setEntities(d.entities || []);
    setInventory(d.inventory || {keys:[],incantations:[]});
    setUnlockedTransports(d.unlockedTransports || []);
    setExpeditionComplete(!!d.expeditionComplete);
    setChallenges(d.challenges);
    setSolved(d.solved);
    setDiscovered((ids) =>
      Array.from(new Set([...ids, ...(d.discovered || [])])),
    );
    setScore(d.score);
    setActive((previous) =>
      previous ? d.challenges.find((c) => c.id === previous.id) || null : null,
    );
    for (const q of d.challenges) {
      if (d.solved.includes(q.id) && q.solveVideo && !q.solveCutsceneSeen) void playCutscene(q, "solve");
    }
  }
  useEffect(() => {
    if (cutsceneOpen) void music.current?.mute();
    else if (!muted) void music.current?.play().catch(e => {
      setAudioError((e as Error).message);
      setMuted(true);
    });
  }, [cutsceneOpen, muted]);
  useEffect(() => {
    if (user && presence.gameRevision !== undefined) void loadGame().catch((e) => setNotice(e.message));
  }, [presence.gameRevision]);
  async function loadGame() {
    const session = playbackSession.current;
    const r = await fetch("/api/game");
    const d = (await r.json()) as GameResponse;
    if (!r.ok) throw Error(d.error || "Could not load expedition.");
    if (session === playbackSession.current) applyGame(d);
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
        if (!config?.audio.midi && !config?.audio.playlist?.length)
          throw Error("No background music is configured.");
        music.current ??= new MidiPlayer(config.audio, (e) => {
          setAudioError(e.message); setMuted(true); music.current = null;
        });
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
    if (active || cutscene || inventoryOpen || lockedTransport || talkingTo || nearbyOptions) return;
    const link = transitionAt(map,pos.x+dx,pos.y+dy);
    if (link?.lock && !unlockedTransports.includes(link.id)) {
      setLockedTransport({id:link.id,name:link.name || `${mapName(map)} → ${mapName(link.to)}`,lock:link.lock,map,x:pos.x,y:pos.y,dx,dy});
      return;
    }
    setPlace((p) => step(p, dx, dy, unlockedTransports));
  }
  async function unlockRoute(phrase: string) {
    if (!lockedTransport) return;
    const target = lockedTransport;
    const session = playbackSession.current;
    const r = await fetch("/api/game", { method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"unlock-transport",id:target.id,phrase}) });
    const d = await r.json() as GameResponse;
    if (!r.ok) throw Error(d.error || "This route could not be unlocked.");
    if (session !== playbackSession.current) return;
    applyGame(d);
    setPlace(p => p.map === target.map && p.pos.x === target.x && p.pos.y === target.y ? step(p,target.dx,target.dy,d.unlockedTransports) : p);
    setLockedTransport(null);
  }
  function search() {
    if (active || cutscene || inventoryOpen || lockedTransport || talkingTo || nearbyOptions) return;
    const nearbyChallenges = challenges.filter(
      (c) =>
        c.map === map &&
        !solved.includes(c.id) &&
        Math.abs(c.location.x - pos.x) + Math.abs(c.location.y - pos.y) <= 2,
    );
    const nearbyEntities = entities.filter(e => e.map === map && Math.abs(e.location.x - pos.x) + Math.abs(e.location.y - pos.y) <= 2);
    if (nearbyEntities.length) {
      if (nearbyEntities.length + nearbyChallenges.length > 1) setNearbyOptions({ entities: nearbyEntities, challenges: nearbyChallenges });
      else setTalkingTo(nearbyEntities[0]);
      sound(); return;
    }
    const q = nearbyChallenges[0];
    if (q) {
      openChallenge(q);
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
        expeditionComplete
          ? "All treasures found! Your expedition is complete."
          : "Nothing here yet. Search near a sparkle or a character’s speech bubble.",
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
        document.querySelector('[role="dialog"]') ||
        teamPanelOpen ||
        playerTile
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
    cutscene,
    inventoryOpen,
    lockedTransport,
    talkingTo,
    entities,
    nearbyOptions,
    config,
    unlockedTransports,
    map,
    pos,
    challenges,
    solved,
    canAdmin,
    team,
    teamPanelOpen,
    playerTile,
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
        const gainedKeys = (d.inventory?.keys || []).filter(color => !inventory.keys.includes(color));
        const gainedPhrases = (d.inventory?.incantations || []).filter(phrase => !inventory.incantations.includes(phrase));
        const gained = [...gainedKeys.map(color => `${color} key`), ...(gainedPhrases.length ? [`${gainedPhrases.length} incantation${gainedPhrases.length === 1 ? "" : "s"}`] : [])];
        applyGame(d);
        sound();
        setFeedback(`Treasure collected! +${d.awardedPoints} points${gained.length ? `. Added to Inventory: ${gained.join(", ")}.` : ""}`);
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
        h && hintCostLabel(h.cost, h.rewardCost) !== "Free"
          ? `Hint unlocked. Cost: ${hintCostLabel(h.cost, h.rewardCost)}, deducted once from this challenge’s completion rewards.`
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
  const chosen =
    user && canAdmin
      ? adminAvatar
      : heroes.find((h) => h.id === (user?.hero || hero)) || heroes[0];
  const selfPlayer: NearbyPlayer | undefined = user
    ? {
        username: user.username,
        hero: user.hero,
        role: canAdmin ? "admin" : "student",
        x: pos.x,
        y: pos.y,
        team: team?.id || null,
        ...presence.self,
      }
    : undefined;
  return (
    <main className="game-page">
      <header className="player-header">
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
          <span className="ctf-brand-name">
            CTF-RPG<small>{config?.theme.title || "North Pole Quest"}</small>
          </span>
        </a>
        <div className="header-right">
          {user && <NotificationsInbox key={user.username} username={user.username}/>}
          <span className="edition">{config?.theme.description}</span>
          {user && (canAdmin || team) && (
            <button
              className="text-button game-teams-button"
              onClick={() => openTeam(null)}
            >
              Teams
              {(presence.features.messaging ||
                presence.features.everyone.messaging) &&
                presence.latestMessageAt > readMessagesAt && (
                  <span className="message-badge" aria-label="New messages">
                    ●
                  </span>
                )}
            </button>
          )}
          {user &&
            (canAdmin ||
              (presence.scoreboard || config?.scoreboard)?.visibility !==
                "admins") && (
              <button id="scores-button" type="button" className="admin-link" onClick={() => setScoreboardOpen(true)}>
                Scores
              </button>
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
            disabled={audioBusy || (!config?.audio.midi && !config?.audio.playlist?.length)}
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
                  playbackSession.current += 1;
                  cutsceneRequests.current.clear();
                  setCutsceneQueue([]);
                  setInventory({keys:[],incantations:[]});
                  setUnlockedTransports([]);
                  setExpeditionComplete(false);
                  setInventoryOpen(false);
                  setLockedTransport(null);
                  setTalkingTo(null);
                  setNearbyOptions(null);
                  setUser(null);
                  setTeamPanelOpen(false);
                  setPlayerTile(null);
                  setReadMessagesAt(0);
                  setActive(null);
                  setDiscovered([]);
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
      <PlayerPopup
        tile={playerTile}
        onClose={() => setPlayerTile(null)}
        players={
          playerTile?.map === map
            ? [...presence.players, ...(selfPlayer ? [selfPlayer] : [])].filter(
                (p) => p.x === playerTile.x && p.y === playerTile.y,
              )
            : []
        }
        characters={heroes}
        canAdmin={canAdmin}
        featureRevision={presence.features.revision}
        onMessage={(id) => {
          setPlayerTile(null);
          openTeam(id);
        }}
      />
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
              selfMarkers={presence.self}
              messageCount={presence.messageCount}
              solveShines={presence.solveShines}
              selfPlayer={selfPlayer}
              onPlayerSelect={(x, y) => setPlayerTile({ map, x, y })}
              characters={heroes}
              entities={entities}
              map={map}
              pos={pos}
              challenges={challenges}
              solved={solved}
              unlockedTransports={unlockedTransports}
              onMove={move}
              onSearch={search}
              onInventory={() => setInventoryOpen(true)}
              inventoryCount={inventory.keys.length + inventory.incantations.length}
            />
            <div className="avatar-marker-legend">
              <span>
                <i className="halo-key" aria-hidden="true" />
                Teammate
              </span>
              <span>
                <Crown size={16} aria-hidden="true" />
                Leading team
              </span>
            </div>
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
              <span>Look for ✦ sparkles and character speech bubbles</span>
            </div>
            <div className="message" role="status">
              <span className="message-icon">✦</span>
              <div>
                <b>
                  {expeditionComplete
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
            {team && <TeamPointGifts team={team} />}
            <div className="journal">
              <div className="journal-title">
                <h2>Treasure journal</h2>
                <span>{solved.length} solved</span>
              </div>
              <p>
                Find an object. Solve its challenge.
                <br />
                Add a little magic to your journey.
              </p>
              {challenges
                .filter(
                  (q) =>
                    solved.includes(q.id) ||
                    q.submission ||
                    discovered.includes(q.id),
                )
                .map((q, i) => (
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
                      <b>{q.object}</b>
                      <small>
                        {q.region}
                        {q.submission?.status === "pending"
                          ? " · Awaiting review"
                          : ""}
                      </small>
                      <button className="text-button" onClick={() => openChallenge(q)}>
                        {q.submission ? "View response" : "Open challenge"}
                      </button>
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
      {talkingTo && config && <EntityConversation key={talkingTo.id} entity={talkingTo} character={heroes.find(c => c.id === talkingTo.characterId)} themeRevision={config.themeRevision} map={map} pos={pos} onGameChange={applyGame} onClose={() => setTalkingTo(null)} />}
      <Dialog open={!!nearbyOptions} onOpenChange={open => { if (!open) setNearbyOptions(null); }}>
        <DialogContent className="entity-dialogue" aria-describedby="nearby-interaction-help">
          <DialogTitle>Search nearby</DialogTitle><p id="nearby-interaction-help">Choose a character to speak with or a challenge to open.</p>
          <div className="entity-dialogue-choices">{nearbyOptions?.entities.map(e => <button type="button" className="secondary-button" key={e.id} onClick={() => { setNearbyOptions(null); setTalkingTo(e); }}>Talk to {e.name}</button>)}
            {nearbyOptions?.challenges.map(q => <button type="button" className="secondary-button" key={q.id} onClick={() => openChallenge(q)}>Open {q.object}</button>)}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={scoreboardOpen} onOpenChange={setScoreboardOpen}>
        <DialogContent className="scoreboard-modal" showCloseButton={false} aria-describedby={undefined} onCloseAutoFocus={(e) => { e.preventDefault(); document.getElementById("scores-button")?.focus(); }}>
          <div className="scoreboard-modal-header"><DialogTitle>Scoreboard</DialogTitle><DialogClose className="secondary-button">Close</DialogClose></div>
          <div className="scoreboard-modal-scroll">{scoreboardOpen && <ScoresPanel allowModeSwitch={canAdmin}/>}</div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!active && !cutscene}
        onOpenChange={(v) => {
          if (!v) setActive(null);
        }}
      >
        <DialogContent className="challenge-modal">
          <span className="eyebrow">CHALLENGE</span>
          <DialogTitle>{active?.object}</DialogTitle>
          <div className="challenge-meta">
            <span>{active?.region}</span>
            <span>{presence.challengeSolves.find((c) => c.id === active?.id)?.count ?? active?.solveCount ?? 0} solves</span>
            <span>
              +{active?.awardedPoints ?? active?.remainingPoints} points
            </span>
          </div>
          <p className="question">{active?.text}</p>
          {active?.rewards && (active.rewards.keys.length > 0 || active.rewards.incantationCount > 0) && <p className="challenge-inventory-rewards">Inventory rewards: {[...active.rewards.keys.map(color => `${color} key`), ...(active.rewards.incantationCount ? [`${active.rewards.incantationCount} incantation${active.rewards.incantationCount === 1 ? "" : "s"}`] : [])].join(" · ")}</p>}
          {active && (active.discoveryVideo || active.solveVideo) && <div className="cutscene-replays" aria-label="Replay cutscenes">
            {active.discoveryVideo && <button type="button" className="text-button" onClick={() => void playCutscene(active, "discovery", true)}>Replay discovery cutscene</button>}
            {solved.includes(active.id) && active.solveVideo && <button type="button" className="text-button" onClick={() => void playCutscene(active, "solve", true)}>Replay solve cutscene</button>}
          </div>}
          <p className="reward-details">
            {active?.grading === "manual"
              ? "Written response · admin review"
              : active?.answerRules || (active?.caseSensitive
                ? "Case-sensitive flag"
                : "Case-insensitive flag")}
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
                Hints <small>Point costs reduce your completion points. Selected rewards are withheld when you complete this challenge.</small>
              </h3>
              {active.hints.map((h) => (
                <div className="challenge-hint" key={h.id}>
                  <div className="hint-title">
                    <b>{h.label}</b>
                    {h.unlocked ? (
                      <span>
                        {hintCostLabel(h.cost, h.rewardCost)} · unlocked
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={
                          busy ||
                          solved.includes(active.id) ||
                          !!active.submission ||
                          !h.available
                        }
                        onClick={() => unlockHint(h.id)}
                      >
                        {hintCostLabel(h.cost, h.rewardCost) === "Free" ? "Reveal free hint" : `Unlock · ${hintCostLabel(h.cost, h.rewardCost)}`}
                      </button>
                    )}
                  </div>
                  {!h.unlocked && !h.available && !solved.includes(active.id) && !active.submission && <p>A reward required by this hint has already been used for another hint.</p>}
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
      {cutscene && <ChallengeCutscene key={cutscene.playbackId} scene={cutscene} onDone={() => setCutsceneQueue(queue => queue.slice(1))} />}
      <PlayerInventory open={inventoryOpen && !cutscene} onOpenChange={setInventoryOpen} items={inventory} />
      {lockedTransport && !cutscene && <TransportUnlock key={lockedTransport.id} target={lockedTransport} items={inventory} onClose={() => setLockedTransport(null)} onUnlock={unlockRoute} />}
    </main>
  );
}

function PlayerPopup({
  tile,
  onClose,
  players,
  characters,
  onMessage,
  featureRevision,
  canAdmin,
}: {
  tile: { map: string; x: number; y: number } | null;
  onClose: () => void;
  players: NearbyPlayer[];
  characters: Character[];
  onMessage: (id: string) => void;
  featureRevision: number;
  canAdmin: boolean;
}) {
  const [teams, setTeams] = useState<
    { id: string; label: string; score?: number; canMessage: boolean }[] | null
  >(null);
  const [error, setError] = useState("");
  const [mutes, setMutes] = useState<
    { username: string; muted: boolean; revision: number }[]
  >([]);
  const [muting, setMuting] = useState<string | null>(null);
  async function toggleMute(username: string) {
    const current = mutes.find((m) => m.username === username);
    if (!current) return;
    setMuting(username);
    setError("");
    try {
      const r = await fetch("/api/admin/mute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...current, muted: !current.muted }),
      });
      const d = (await r.json()) as {
        username: string;
        muted: boolean;
        revision: number;
        error?: string;
      };
      if (!r.ok) throw Error(d.error || "Could not mute user.");
      setMutes((ms) => ms.map((m) => (m.username === username ? d : m)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setMuting(null);
    }
  }
  useEffect(() => {
    if (!tile) return;
    let live = true;
    const controller = new AbortController();
    async function load(reset = false) {
      if (!live) return;
      if (reset) {
        setTeams(null);
        setError("");
      }
      try {
        const r = await fetch("/api/team-social", {
          signal: controller.signal,
        });
        const d = (await r.json()) as {
          error?: string;
          teams: {
            id: string;
            label: string;
            score?: number;
            canMessage: boolean;
          }[];
        };
        if (!r.ok) throw Error(d.error || "Could not load team details.");
        if (live) {
          setTeams(d.teams);
          if (canAdmin) {
            const response = await fetch("/api/admin/mute", {
              signal: controller.signal,
            });
            const muted = (await response.json()) as { users: typeof mutes };
            if (response.ok && live) setMutes(muted.users);
          }
          setError("");
        }
      } catch (e) {
        if (live) {
          setTeams(null);
          setError((e as Error).message);
        }
      }
    }
    void Promise.resolve().then(() => load(true));
    const timer = setInterval(() => void load(), 5000);
    return () => {
      live = false;
      controller.abort();
      clearInterval(timer);
    };
  }, [tile, featureRevision, canAdmin]);
  return (
    <Dialog
      open={!!tile}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="player-dialog">
        <DialogTitle>Players at this location</DialogTitle>
        <p className="player-popup-note">
          {players.length} {players.length === 1 ? "player" : "players"} · Tile{" "}
          {tile?.x}, {tile?.y}
        </p>
        {error && <p role="alert">{error}</p>}
        <div className="player-card-list">
          {!players.length && <p>These players have moved or left the map.</p>}
          {players.map((p) => {
            const t = teams?.find(
              (t) => t.id === (p.role === "admin" ? "instructors" : p.team),
            );
            const character =
              p.role === "admin"
                ? adminAvatar
                : characters.find((c) => c.id === p.hero);
            return (
              <article className="player-card" key={p.username}>
                {character && <Portrait hero={character} />}
                <div>
                  <strong>{p.username}</strong>
                  {p.role === "admin" && (
                    <small className="admin-player-label">Administrator</small>
                  )}
                  <p>
                    Team:{" "}
                    {p.team
                      ? t?.label || (teams ? "Unavailable" : "Loading…")
                      : "No team"}
                  </p>
                  {p.team && (
                    <p>
                      Team score:{" "}
                      {t?.score !== undefined
                        ? t.score
                        : teams
                          ? "Hidden by admin"
                          : "Loading…"}
                    </p>
                  )}
                  {t?.canMessage && (
                    <button
                      type="button"
                      className="player-message"
                      onClick={() => onMessage(t.id)}
                    >
                      {p.role === "admin"
                        ? "Message instructors"
                        : "Send message to team"}
                    </button>
                  )}
                  {canAdmin && mutes.some((m) => m.username === p.username) && (
                    <button
                      type="button"
                      className="player-message"
                      disabled={muting !== null}
                      onClick={() => void toggleMute(p.username)}
                    >
                      {muting === p.username
                        ? "Saving…"
                        : mutes.find((m) => m.username === p.username)?.muted
                          ? "Unmute user"
                          : "Mute user"}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
