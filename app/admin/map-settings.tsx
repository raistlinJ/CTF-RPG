"use client";
import { drawBossIcon, challengeTiles, challengeBounds, drawChallengeFootprint } from "@/lib/challenge-icon.mjs";
import { useBossSprites } from "../use-boss-sprites";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Footprints,
  Ban,
  MapPin,
  Move,
  Users,
  SlidersHorizontal,
  Paintbrush,
  RotateCcw,
  ArrowLeftRight,
} from "lucide-react";
import EntityEditor from "./entity-editor";
import { EntityMarker } from "../entity-dialogue";
import { entitiesSchema, entityLocationAvailable, findEntityLocation } from "@/lib/non-player-entities.mjs";
import type { EntityCharacter, NonPlayerEntity } from "@/lib/non-player-entities";
import { challengeLocationAvailable } from "@/lib/challenge-placement.mjs";
import { clientUuid } from "@/lib/client-uuid.mjs";
import { paintStroke } from "@/lib/paint-stroke.mjs";
import { createWorld, activeWorld } from "@/lib/world-data.mjs";
import { KEY_COLORS } from "@/lib/inventory-data.mjs";
type TransportLock = { type: "key"; color: string } | { type: "incantation"; phrase: string };
type MapData = (typeof activeWorld.maps)[number] & {
  ground?: [number, number][] | null;
  originalBackground?: string | null;
};
type Transport = {
  id: string;
  map: string;
  location: { x: number; y: number };
  to: string;
  lock?: TransportLock | null;
};
type PortalOverride = {
  id: string;
  location: { x: number; y: number };
  to: string;
  lock?: TransportLock | null;
};
type WorldData = Omit<typeof activeWorld, "maps"> & {
  maps: MapData[];
  transports?: Transport[];
  portalOverrides?: PortalOverride[];
  entities?: NonPlayerEntity[];
};
type Placement = {
  id: string;
  object: string;
  icon?: "star" | "boss";
  bossStyle?: "classic" | "frost" | "clockwork" | "shadow" | "ember" | "serpent";
  iconSize?: 1 | 2 | 3;
  map: string;
  location: { x: number; y: number };
};
type MapItem = { kind: "entity" | "transport" | "challenge" | "spawn"; id: string; destination?: string; readOnly?: boolean };
type ItemDrag = MapItem & { pointerId: number; startX: number; startY: number; offsetX: number; offsetY: number; active: boolean; target: { x: number; y: number } };
function TransportLockDetails({ lock }: { lock?: TransportLock | null }) {
  if (!lock) return <span className="transport-unlocked">None</span>;
  if (lock.type === "key") return <span className="transport-required-key">{lock.color} key</span>;
  return <><span>Incantation</span><small className="transport-required-incantation">{lock.phrase.trim() || "Not set"}</small></>;
}
export default function MapSettings({
  world,
  mapId,
  themeRevision,
  contentRevision,
  onSaved,
  challenges,
  onOpenChange,
  standalone = false,
  onDirtyChange,
  characters = [],
  bossSpritePaths = {},
  entityOnly = false,
  initialEntityId = "",
  initialPanel = "ground",
  onPanelChange,
}: {
  world: WorldData;
  mapId: string;
  themeRevision: number;
  contentRevision: number;
  onSaved: () => Promise<void>;
  challenges: Placement[];
  onOpenChange?: (open: boolean) => void;
  standalone?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  characters?: EntityCharacter[];
  bossSpritePaths?: Record<string, string>;
  entityOnly?: boolean;
  initialEntityId?: string;
  initialPanel?: "ground" | "entities" | "transport" | "advanced";
  onPanelChange?: (panel: "ground" | "entities" | "transport" | "advanced") => void;
}) {
  const bossSprites = useBossSprites(bossSpritePaths);
  const original = world.maps.find((m) => m.id === mapId)!;
  const [map, setMap] = useState<MapData>(original),
    [cells, setCells] = useState<Set<string>>(new Set()),
    [cursor, setCursor] = useState({ x: 0, y: 0 }),
    [editorOpen, setEditorOpen] = useState(standalone),
    [panel, setPanel] = useState<
      "ground" | "entities" | "transport" | "advanced"
    >(entityOnly ? "entities" : initialPanel),
    [mode, setMode] = useState<"allow" | "block" | "spawn" | "move">("allow"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [previousSave, setPreviousSave] = useState<{
      map: MapData;
      transports: Transport[];
      portalOverrides: PortalOverride[];
      entities: NonPlayerEntity[];
    } | null>(null),
    [transports, setTransports] = useState<Transport[]>(world.transports || []),
    [portalOverrides, setPortalOverrides] = useState<PortalOverride[]>(
      world.portalOverrides || [],
    ),
    [selectedTransport, setSelectedTransport] = useState(""),
    [newLock, setNewLock] = useState<TransportLock | null>(null),
    [transportUndo, setTransportUndo] = useState<
      { transports: Transport[]; portalOverrides: PortalOverride[] }[]
    >([]),
    [destination, setDestination] = useState(
      world.maps.find((m) => m.id !== mapId)?.id || "",
    ),
    [moves, setMoves] = useState<Record<string, { x: number; y: number }>>({}),
    [selectedChallenge, setSelectedChallenge] = useState("");
  const [entities, setEntities] = useState<NonPlayerEntity[]>(world.entities || []);
  const [selectedEntity, setSelectedEntity] = useState("");
  const [mapAction, setMapAction] = useState<"ground" | "entities" | "transport" | null>(null);
  const [dragPreview, setDragPreview] = useState<(MapItem & { x: number; y: number }) | null>(null), [hoverItem, setHoverItem] = useState(false);
  const itemDrag = useRef<ItemDrag | null>(null);
  const mapPress = useRef<number | null>(null);
  const capturedPointer = useRef<number | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null),
    dragging = useRef(false),
    lastPaint = useRef<{ x: number; y: number } | null>(null);
  const cancelGesture = useCallback(() => {
    const pointerId = capturedPointer.current;
    capturedPointer.current = null;
    itemDrag.current = null; mapPress.current = null; dragging.current = false; lastPaint.current = null;
    setDragPreview(null); setHoverItem(false);
    if (pointerId !== null && canvas.current?.hasPointerCapture(pointerId)) canvas.current.releasePointerCapture(pointerId);
  }, []);
  useEffect(() => {
    window.addEventListener("blur", cancelGesture);
    return () => window.removeEventListener("blur", cancelGesture);
  }, [cancelGesture]);
  const [initialState, setInitialState] = useState("");
  function reset() {
    cancelGesture();
    const engine = createWorld(world),
      next = new Set<string>();
    for (let y = 0; y < 28; y++)
      for (let x = 0; x < 40; x++)
        if (!engine.blocked(mapId, x, y)) next.add(`${x},${y}`);
    setMap(structuredClone(original));
    setCells(next);
    setCursor({ ...original.spawn });
    setMode("allow");
    setMapAction(null);
    setTransports(structuredClone(world.transports || []));
    setPortalOverrides(structuredClone(world.portalOverrides || []));
    setSelectedTransport("");
    setNewLock(null);
    setTransportUndo([]);
    setDestination(world.maps.find((m) => m.id !== mapId)?.id || "");
    setError("");
    setMoves({});
    setSelectedChallenge("");
    setEntities(structuredClone(world.entities || []));
    setSelectedEntity(current => (entityOnly || initialPanel === "entities")
      ? [current, initialEntityId].find(id => (world.entities || []).some(e => e.id === id && e.map === mapId)) || ""
      : "");
    dragging.current = false;
    lastPaint.current = null;
    setInitialState(JSON.stringify([original, [...next].sort(), world.transports || [], world.portalOverrides || [], {}]));
  }
  const mapLayoutDirty = !!initialState && initialState !== JSON.stringify([map, [...cells].sort(), transports, portalOverrides, moves]);
  const entitiesDirty = JSON.stringify(entities) !== JSON.stringify(world.entities || []);
  const layoutDirty = mapLayoutDirty || entitiesDirty;
  const dirty = layoutDirty;
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    reset();
  }, [world, mapId]);
  useEffect(() => {
    setPreviousSave(null);
    setMessage("");
  }, [mapId]);
  const ground = useMemo(
    () => [...cells].map((k) => k.split(",").map(Number) as [number, number]),
    [cells],
  );
  const preview = useMemo(
    () => ({
      ...world,
      transports,
      portalOverrides,
      entities,
      maps: world.maps.map((m) =>
        m.id === mapId ? { ...map, obstacles: [], ground } : m,
      ),
    }),
    [world, mapId, map, ground, transports, portalOverrides, entities],
  );
  const engine = useMemo(() => createWorld(preview), [preview]);
  const selectedLink = selectedTransport.startsWith("portal:")
    ? engine.portals.find(p => p.id === selectedTransport.slice(7))
    : transports.find(t => t.id === selectedTransport.slice(10));
  const selectedLock = (selectedTransport ? selectedLink?.lock || null : newLock) as TransportLock | null;
  const placements = useMemo(
    () =>
      challenges.map((c) => ({ ...c, location: moves[c.id] || c.location })),
    [challenges, moves],
  );
  const invalid = placements.filter(
    (c) => !challengeLocationAvailable(engine, [], c.map, c.location.x, c.location.y, c.id, c),
  );
  const selectedNpc = entities.find(e => e.id === selectedEntity);
  const entityValidation = entitiesSchema.safeParse(entities);
  const entityProblems = [
    ...(!entityValidation.success ? entityValidation.error.issues.map(i => `Character ${i.path[0] === undefined ? "" : Number(i.path[0]) + 1}: ${i.message}`) : []),
    ...entities.flatMap(e => !characters.some(c => c.id === e.characterId) || !entityLocationAvailable(engine, placements, entities, e.map, e.location.x, e.location.y, e.id) ? [`${e.name || "Character"} needs a valid appearance and a separate map tile away from challenges, doors and transport.`] : []),
  ];
  function updateEntity(entity: NonPlayerEntity) {
    setEntities(all => all.map(e => e.id === entity.id ? entity : e)); setMessage(""); setError("");
  }
  function addEntity() {
    const location = findEntityLocation(engine, placements, entities, mapId, cursor);
    if (!location) { setError("This map has no available location for another character."); return; }
    const node = "dialogue-" + clientUuid(), id = "entity-" + clientUuid();
    setEntities(all => [...all, { id, name: "New character", characterId: characters.find(c => c.appearanceFor === "entity")?.id || characters[0]?.id || "web", map: mapId, location, startNode: node, nodes: [{ id: node, text: "Hello, traveler.", choices: [] }] }]);
    setMapAction("entities");
    setSelectedEntity(id); setCursor(location); setMessage(""); setError("");
  }
  const duplicated = placements.filter((c, i) =>
    placements.some(
      (d, j) =>
        j < i &&
        d.map === c.map &&
        challengeTiles(d).some(p => challengeTiles(c).some(t => t.x === p.x && t.y === p.y)),
    ),
  );
  const portalProblems = engine.portals.flatMap((p) =>
    !engine.reachable(p.map, p.location.x, p.location.y) ||
    !engine.canSpawn(p.to, p.arrival.x, p.arrival.y) ||
    engine.portals.some(
      (q) =>
        q.id !== p.id &&
        q.map === p.map &&
        q.location.x === p.location.x &&
        q.location.y === p.location.y,
    ) ||
    transports.some(
      (t) =>
        t.map === p.map &&
        t.location.x === p.location.x &&
        t.location.y === p.location.y,
    )
      ? [
          `Theme transport ${p.name} needs separate reachable source and arrival tiles.`,
        ]
      : [],
  );
  function rememberTransport() {
    setTransportUndo((history) => [
      ...history.slice(-29),
      {
        transports: structuredClone(transports),
        portalOverrides: structuredClone(portalOverrides),
      },
    ]);
  }
  function editDestination(to: string) {
    if (!to && selectedTransport) return;
    setDestination(to);
    if (!selectedTransport) return;
    rememberTransport();
    if (selectedTransport.startsWith("portal:")) {
      const id = selectedTransport.slice(7),
        p = engine.portals.find((p) => p.id === id)!;
      setPortalOverrides((os) => [
        ...os.filter((o) => o.id !== id),
        { id, location: { ...p.location }, to, lock: p.lock as TransportLock | null },
      ]);
    } else
      setTransports((ts) =>
        ts.map((t) =>
          t.id === selectedTransport.slice(10) ? { ...t, to } : t,
        ),
      );
  }
  function editLock(lock: TransportLock | null) {
    if (!selectedTransport) { setNewLock(lock); return; }
    rememberTransport();
    if (selectedTransport.startsWith("portal:")) {
      const p = engine.portals.find(p => p.id === selectedTransport.slice(7))!;
      setPortalOverrides(os => [...os.filter(o => o.id !== p.id), { id: p.id, location: {...p.location}, to: p.to, lock }]);
    } else setTransports(ts => ts.map(t => t.id === selectedTransport.slice(10) ? {...t,lock} : t));
  }
  const transportProblems = [
    ...[...transports, ...portalOverrides].filter(t => t.lock?.type === "incantation" && (!t.lock.phrase.trim() || t.lock.phrase.trim().length > 80 || /[\r\n]/.test(t.lock.phrase))).map(() => "Locked portals need an incantation of 1–80 characters."),
    ...portalProblems,
    ...transports.flatMap((t) => {
      const source = preview.maps.find((m) => m.id === t.map),
        target = preview.maps.find((m) => m.id === t.to);
      if (
        !source ||
        !target ||
        !engine.reachable(t.map, t.location.x, t.location.y) ||
        (source.spawn.x === t.location.x && source.spawn.y === t.location.y)
      )
        return [
          `Transport at ${t.location.x}, ${t.location.y} needs reachable ground away from spawn.`,
        ];
      if (
        ![
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].some(([dx, dy]) =>
          engine.canPlaceChallenge(
            t.to,
            target.spawn.x + dx,
            target.spawn.y + dy,
          ),
        )
      )
        return [
          `${target.name} needs an open tile beside its spawn for the return trip.`,
        ];
      return [];
    }),
  ];
  useEffect(() => {
    let cancelled = false;
    const draw = (img?: HTMLImageElement) => {
      if (cancelled || !canvas.current) return;
      const ctx = canvas.current.getContext("2d")!;
      ctx.fillStyle = map.floor;
      ctx.fillRect(0, 0, 960, 672);
      if (img) ctx.drawImage(img, 0, 0, 960, 672);
      for (let y = 0; y < 28; y++)
        for (let x = 0; x < 40; x++) {
          ctx.fillStyle = engine.canPlaceChallenge(mapId, x, y)
            ? "rgba(70,205,155,0.14)"
            : !engine.blocked(mapId, x, y)
              ? "rgba(235,170,60,0.40)"
              : "rgba(135,140,145,0.48)";
          ctx.fillRect(x * 24, y * 24, 24, 24);
          ctx.strokeStyle = "rgba(20,40,50,0.25)";
          ctx.strokeRect(x * 24, y * 24, 24, 24);
        }
      for (const c of placements.filter((c) => c.map === mapId)) {
        ctx.fillStyle = engine.canPlaceChallenge(
          c.map,
          c.location.x,
          c.location.y,
        )
          ? "#ffe393"
          : "#ff8585";
        ctx.font = "bold 20px Arial";
        ctx.textAlign = "center";
        const location = dragPreview?.kind === "challenge" && dragPreview.id === c.id ? dragPreview : c.location;
        const bounds = challengeBounds(c, 24, location);
        if (c.icon === "boss") {
          drawBossIcon(ctx, bounds.left, bounds.top, bounds.width, c.bossStyle, bossSprites[c.bossStyle || "classic"]);
        } else ctx.fillText("✦", bounds.left + 12, bounds.top + 19);
        if (c.id === selectedChallenge) {
          ctx.strokeStyle = "#ffe393";
          ctx.lineWidth = 3;
          ctx.strokeRect(bounds.left + 1, bounds.top + 1, bounds.width - 2, bounds.height - 2);
        }
      }
      for (const p of [
        ...engine.transportTiles(mapId),
        ...engine.portals.filter((p) => p.map === mapId).map((p) => p.location),
      ]) {
        ctx.fillStyle = "#9b8bff66";
        ctx.fillRect(p.x * 24 + 2, p.y * 24 + 2, 20, 20);
        ctx.strokeStyle = "#c4adff";
        ctx.lineWidth = 2;
        ctx.strokeRect(p.x * 24 + 2, p.y * 24 + 2, 20, 20);
        ctx.fillStyle = "#eee1ff";
        ctx.font = "bold 17px Arial";
        ctx.textAlign = "center";
        ctx.fillText("⇄", p.x * 24 + 12, p.y * 24 + 18);
      }
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.strokeRect(cursor.x * 24 + 1, cursor.y * 24 + 1, 22, 22);
      ctx.fillStyle = "#fff4a6";
      ctx.fillRect(map.spawn.x * 24 + 5, map.spawn.y * 24 + 5, 14, 14);
      if (dragPreview) {
        ctx.strokeStyle = dragPreview.kind === "entity" ? "#ffe293" : "#c4adff";
        ctx.lineWidth = 3; ctx.setLineDash([4, 3]);
        const challenge = dragPreview.kind === "challenge" ? placements.find(c => c.id === dragPreview.id) : undefined;
        ctx.fillStyle = "transparent";
        drawChallengeFootprint(ctx, challenge, 24, dragPreview);
        ctx.setLineDash([]);
        if (dragPreview.kind !== "entity" && dragPreview.kind !== "challenge") {
          ctx.fillStyle = ctx.strokeStyle; ctx.font = "bold 20px Arial"; ctx.textAlign = "center";
          ctx.fillText(dragPreview.kind === "transport" ? "⇄" : "◆", dragPreview.x * 24 + 12, dragPreview.y * 24 + 19);
        }
      }
    };
    const src = map.background;
    if (src) {
      const img = new Image();
      img.onload = () => draw(img);
      img.onerror = () => draw();
      img.src = src;
    } else draw();
    return () => {
      cancelled = true;
    };
  }, [
    map,
    world,
    mapId,
    engine,
    cursor,
    placements,
    bossSprites,
    selectedChallenge,
    dragPreview,
  ]);
  function paint(x: number, y: number, continuous = false, moving?: MapItem) {
    if (
      !Number.isInteger(x) ||
      !Number.isInteger(y) ||
      x < 0 ||
      x > 39 ||
      y < 0 ||
      y > 27
    ) {
      if (moving) setError("Drop the item inside the map grid.");
      return;
    }
    setCursor({ x, y });
    if (moving?.kind === "entity" || (!moving && panel === "entities")) {
      const existing = entities.find(e => e.map === mapId && e.location.x === x && e.location.y === y);
      if (existing && !moving) { setSelectedEntity(existing.id); setError(""); return; }
      const entity = moving ? entities.find(e => e.id === moving.id) : selectedNpc;
      if (!entity) { setError("Add or select a character, then click its location on the map."); return; }
      if (!entityLocationAvailable(engine, placements, entities, mapId, x, y, entity.id)) { setError("Choose an unoccupied map tile away from challenges, doors and transport. Non-walkable tiles are allowed."); return; }
      updateEntity({ ...entity, location: { x, y } }); setMapAction(null); return;
    }
    if (moving?.kind === "transport" || (!moving && panel === "transport")) {
      const transportId = moving?.id || selectedTransport, to = moving?.destination || destination;
      if (!to) {
        setError("Choose a destination map first.");
        return;
      }
      const existingPortal = engine.portals.find(
        (p) => p.map === mapId && p.location.x === x && p.location.y === y,
      );
      const existing = transports.find(
        (t) => t.map === mapId && t.location.x === x && t.location.y === y,
      );
      if ((existingPortal || existing) && !moving) {
        setSelectedTransport(
          existingPortal
            ? `portal:${existingPortal.id}`
            : `transport:${existing!.id}`,
        );
        setDestination((existingPortal || existing)!.to);
        setError("");
        setMessage(
          "Transport selected. Change its destination or click a free tile to move it.",
        );
        return;
      }
      if (
        !engine.canPlaceChallenge(mapId, x, y) || !entityLocationAvailable(engine, [], entities, mapId, x, y) ||
        (x === map.spawn.x && y === map.spawn.y)
      ) {
        setError(
          "Choose reachable ground away from a spawn, doorway, or transport tile.",
        );
        return;
      }
      if (
        placements.some(
          (c) => c.map === mapId && challengeTiles(c).some(p => p.x === x && p.y === y),
        )
      ) {
        setError(
          "Move the challenge off this tile before placing a transport.",
        );
        return;
      }
      const target = world.maps.find((m) => m.id === to)!;
      if (
        placements.some(
          (c) =>
            c.map === to &&
            challengeTiles(c).some(p => p.x === target.spawn.x && p.y === target.spawn.y),
        )
      ) {
        setError(
          "Move the challenge at the destination spawn before linking this map.",
        );
        return;
      }
      rememberTransport();
      if (transportId.startsWith("portal:")) {
        const id = transportId.slice(7);
        setPortalOverrides((os) => [
          ...os.filter((o) => o.id !== id),
          { id, location: { x, y }, to, lock: engine.portals.find(p => p.id === id)?.lock as TransportLock | null },
        ]);
      } else if (transportId.startsWith("transport:")) {
        setTransports((ts) =>
          ts.map((t) =>
            t.id === transportId.slice(10)
              ? { ...t, location: { x, y }, to }
              : t,
          ),
        );
      } else {
        const id = "transport-" + clientUuid();
        setTransports((ts) => [
          ...ts,
          {
            id,
            map: mapId,
            location: { x, y },
            to,
            lock: newLock,
          },
        ]);
        setSelectedTransport(`transport:${id}`);
      }
      setMapAction(null);
      setError("");
      setMessage("");
      return;
    }
    if (moving?.kind === "challenge" || (!moving && mode === "move")) {
      const clicked = placements.find(
        (c) => c.map === mapId && challengeTiles(c).some(p => p.x === x && p.y === y),
      );
      if (clicked && !moving) {
        setSelectedChallenge(clicked.id);
        setError("");
        return;
      }
      const challengeId = moving?.id || selectedChallenge;
      if (!challengeId) {
        setError(
          "Click a challenge star or choose a challenge, then click its destination.",
        );
        return;
      }
      if (!challengeLocationAvailable(engine, placements, mapId, x, y, challengeId)) {
        setError("Choose a free, reachable tile for this challenge.");
        return;
      }
      setMoves((s) => ({ ...s, [challengeId]: { x, y } }));
      setError("");
      setMessage("");
      return;
    }
    if (moving?.kind === "spawn") {
      if (!engine.canSpawn(mapId, x, y) || placements.some(c => c.map === mapId && challengeTiles(c).some(p => p.x === x && p.y === y)) || entities.some(e => e.map === mapId && e.location.x === x && e.location.y === y)) {
        setError("Choose a free, reachable tile for the spawn."); return;
      }
      setMap(m => ({ ...m, spawn: { x, y } })); setError(""); setMessage(""); return;
    }
    if (
      x < map.bounds.left ||
      x > map.bounds.right ||
      y < map.bounds.top ||
      y > map.bounds.bottom
    ) {
      setError(
        "This tile is outside the map boundaries. Expand the boundaries to paint here.",
      );
      lastPaint.current = null;
      return;
    }
    const points =
      mode === "spawn"
        ? [{ x, y }]
        : paintStroke(continuous ? lastPaint.current : null, { x, y });
    lastPaint.current = { x, y };
    if (mode === "spawn") setMap((m) => ({ ...m, spawn: { x, y } }));
    setCells((s) => {
      const next = new Set(s);
      for (const p of points) {
        if (mode === "block") next.delete(`${p.x},${p.y}`);
        else next.add(`${p.x},${p.y}`);
      }
      return next;
    });
    setError("");
    setMessage("");
  }
  function at(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    paint(
      Math.max(
        0,
        Math.min(39, Math.floor(((e.clientX - r.left) / r.width) * 40)),
      ),
      Math.max(
        0,
        Math.min(27, Math.floor(((e.clientY - r.top) / r.height) * 28)),
      ),
      true,
    );
  }
  function pointerTile(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: Math.floor((e.clientX - r.left) / r.width * 40), y: Math.floor((e.clientY - r.top) / r.height * 28) };
  }
  function itemAtTile(x: number, y: number): MapItem | null {
    const entity = entities.find(n => n.map === mapId && n.location.x === x && n.location.y === y);
    if (entity) return { kind: "entity", id: entity.id, readOnly: false };
    const portal = engine.portals.find(p => p.map === mapId && p.location.x === x && p.location.y === y);
    if (portal) return { kind: "transport", id: `portal:${portal.id}`, destination: portal.to, readOnly: entityOnly };
    const transport = transports.find(t => t.map === mapId && t.location.x === x && t.location.y === y);
    if (transport) return { kind: "transport", id: `transport:${transport.id}`, destination: transport.to, readOnly: entityOnly };
    if (engine.transportTiles(mapId).some((t: { kind: string; x: number; y: number }) => t.kind === "return" && t.x === x && t.y === y)) return { kind: "transport", id: "return", readOnly: true };
    const challenge = placements.find(c => c.map === mapId && challengeTiles(c).some(p => p.x === x && p.y === y));
    if (challenge) return { kind: "challenge", id: challenge.id, readOnly: entityOnly };
    if (map.spawn.x === x && map.spawn.y === y) return { kind: "spawn", id: "spawn", readOnly: entityOnly };
    return null;
  }
  function itemAt(e: React.PointerEvent<HTMLCanvasElement>): MapItem | null {
    const { x, y } = pointerTile(e), item = itemAtTile(x, y);
    if (item) return item;
    const marker = [...e.currentTarget.parentElement!.querySelectorAll<HTMLElement>(".entity-marker")].find(m => {
      const r = m.getBoundingClientRect();
      return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    });
    return marker ? { kind: "entity", id: marker.dataset.entityId!, readOnly: false } : null;
  }
  function selectMapItem(item: MapItem | null, point: { x: number; y: number }) {
    setMapAction(null);
    setError(""); setMessage("");
    if (entityOnly && item?.kind !== "entity") { setCursor(point); return; }
    if (item?.kind === "entity") {
      setPanel("entities"); onPanelChange?.("entities"); setSelectedEntity(item.id);
      setCursor(entities.find(n => n.id === item.id)!.location);
    } else if (item?.kind === "transport") {
      setPanel("transport"); setSelectedTransport(item.readOnly ? "" : item.id);
      if (item.destination) setDestination(item.destination);
      setCursor(point);
      if (item.readOnly) setMessage("This return tile follows incoming transports. Edit their links on the source map.");
    } else {
      setPanel("ground");
      if (item?.kind === "challenge") { setMode("move"); setSelectedChallenge(item.id); }
      else if (item?.kind === "spawn") setMode("spawn");
      setCursor(point);
    }
  }
  async function save(restore?: {
    map: MapData;
    transports: Transport[];
    portalOverrides: PortalOverride[];
    entities: NonPlayerEntity[];
  }) {
    cancelGesture();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const form = new FormData();
      const entitiesOnly = !restore && (entityOnly || (entitiesDirty && !mapLayoutDirty));
      form.set(
        "map",
        JSON.stringify(
          entitiesOnly ? { id: mapId } : restore
            ? { ...restore.map, ground: restore.map.ground ?? null }
            : {
                id: map.id,
                name: map.name,
                bounds: map.bounds,
                spawn: map.spawn,
                ground,
              },
        ),
      );
      form.set("themeRevision", String(themeRevision));
      form.set("contentRevision", String(contentRevision));
      if (restore) form.set("action", "restore");
      if (entitiesOnly) form.set("action", "update-entities");
      form.set("entities", JSON.stringify(restore?.entities || entities));
      if (!entitiesOnly) {
      form.set("transports", JSON.stringify(restore?.transports || transports));
      form.set(
        "portalOverrides",
        JSON.stringify(restore?.portalOverrides || portalOverrides),
      );
      form.set(
        "moves",
        JSON.stringify(Object.entries(moves).map(([id, p]) => ({ id, ...p }))),
      );
      }
      const r = await fetch("/api/admin/maps", { method: "POST", body: form }),
        d = (await r.json()) as {
          error?: string;
          placement: { moved: unknown[]; excluded: unknown[] };
        };
      if (!r.ok) throw Error(d.error || "Could not save the map.");
      setPreviousSave(
        restore
          ? null
          : {
              map: structuredClone(original),
              transports: structuredClone(world.transports || []),
              portalOverrides: structuredClone(world.portalOverrides || []),
              entities: structuredClone(world.entities || []),
            },
      );
      await onSaved();
      setMessage(entityOnly
        ? "Non-player entities saved. Reload the game to use them."
        : `${restore ? "Previous saved map restored" : "Map saved"}. ${d.placement.moved.length} challenges moved. Reload the game to use it.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const tools = {
    allow: {
      name: "Walkable",
      label: "Paint walkable",
      icon: Footprints,
      help: "Click or drag to paint walkable ground.",
    },
    block: {
      name: "Blocked",
      label: "Paint blocked",
      icon: Ban,
      help: "Click or drag to block tiles. Move any affected challenges before saving.",
    },
    spawn: {
      name: "Spawn",
      label: "Set spawn",
      icon: MapPin,
      help: "Click a reachable tile to set the player’s starting position, or drag the spawn marker. Escape cancels a drag.",
    },
    move: {
      name: "Move challenge",
      label: "Move challenge",
      icon: Move,
      help: "Drag a challenge star to free green ground, or select its name and click a destination. Escape cancels a drag.",
    },
  };
  const attention = [
    ...new Map([...invalid, ...duplicated].map((c) => [c.id, c])).values(),
  ];
  const EditorContainer = standalone ? "section" : "details";
  return (
    <EditorContainer
      className={`map-settings${standalone ? " map-settings-standalone" : ""}`}
      aria-busy={busy}
      onToggle={(e) => {
        if (standalone) return;
        const open = (e.currentTarget as HTMLDetailsElement).open;
        setEditorOpen(open);
        onOpenChange?.(open);
      }}
    >
      {!standalone && <summary>
        <span>
          <Paintbrush size={17} />
          Map ground, entities &amp; transport
        </span>
        <span className="map-summary-hint">
          {editorOpen ? "Close editor" : "Edit map"}
        </span>
      </summary>}
      <div className="map-settings-body">
        {!entityOnly && <div className="map-settings-tabs" aria-label="Map settings sections">
          {([
              { id: "ground", label: "Ground", icon: Paintbrush },
              { id: "transport", label: "Transport", icon: ArrowLeftRight },
              { id: "entities", label: "Non-player entities", icon: Users },
              { id: "advanced", label: "Advanced", icon: SlidersHorizontal },
            ] as const).map((tab) => (
            <button
              type="button"
              key={tab.id}
              aria-pressed={panel === tab.id}
              onClick={() => { cancelGesture(); setMapAction(null); setPanel(tab.id); onPanelChange?.(tab.id); }}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </div>}
        <div className="map-settings-controls">
        {panel === "entities" && <div className="map-settings-section">
          <p className="map-tool-help" id="entity-tool-help">Add a character, then click a free map tile to place it. Drag a character to move it; Escape cancels. Non-walkable tiles are allowed. Players use Search nearby within one tile to speak and choose their replies. Save entities to publish your characters and dialogue.</p>
          <a className="text-button" href="/admin/theme/appearances#selectable-characters">Manage character appearances</a>
          <button type="button" className="secondary-button" disabled={busy || entities.length >= 100 || !characters.length} onClick={addEntity}>Add character</button>
          <div className="entity-list" aria-label="Characters on this map">{entities.filter(e => e.map === mapId).map(e => <div key={e.id}>
            <button type="button" aria-pressed={selectedEntity === e.id} disabled={busy} onClick={() => { setMapAction(null); setSelectedEntity(e.id); setCursor({ ...e.location }); }}>{e.name || "Unnamed character"} · {e.location.x}, {e.location.y}</button>
            <button type="button" className="text-button" aria-label={`Remove character ${e.name}`} disabled={busy} onClick={() => { setEntities(all => all.filter(v => v.id !== e.id)); if (selectedEntity === e.id) setSelectedEntity(""); }}>Remove</button>
          </div>)}</div>
          {!entities.some(e => e.map === mapId) && <small>No characters on this map yet.</small>}
          {selectedNpc && <fieldset className="entity-fields" disabled={busy}><EntityEditor key={selectedNpc.id} entity={selectedNpc} characters={characters} onChange={updateEntity}
            dialogueHref={!entitiesDirty && (world.entities || []).some(e => e.id === selectedNpc.id)
              ? `/admin/theme/maps/dialogue?entity=${encodeURIComponent(selectedNpc.id)}` : undefined} /></fieldset>}
        </div>}
        {panel === "ground" && (
          <div className="map-edit-tools">
            <div className="map-tool-buttons" aria-label="Map tools">
              {(["allow", "block", "spawn", "move"] as const).map((tool) => {
                const Icon = tools[tool].icon;
                return (
                  <button
                    type="button"
                    key={tool}
                    aria-label={tools[tool].label}
                    aria-pressed={mapAction === "ground" && mode === tool}
                    onClick={() => {
                      cancelGesture();
                      setMode(tool);
                      setMapAction("ground");
                      lastPaint.current = null;
                    }}
                  >
                    <Icon size={16} />
                    {tools[tool].name}
                  </button>
                );
              })}
            </div>
            <p id="map-tool-help" className="map-tool-help">
              {mapAction === "ground" ? tools[mode].help : "Click an item to open its section, or empty ground to select a tile. Choose a tool above to edit ground; drag an item to move it."}
            </p>
            {mode === "move" && (
              <label className="map-move-picker">
                Challenge to move
                <select
                  value={selectedChallenge}
                  onChange={(e) => { setSelectedChallenge(e.target.value); setMapAction("ground"); }}
                >
                  <option value="">Choose a challenge</option>
                  {placements
                    .filter((c) => c.map === mapId)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.object} ({c.location.x}, {c.location.y})
                      </option>
                    ))}
                </select>
              </label>
            )}
          </div>
        )}
        {panel === "transport" && (
          <div className="map-settings-section">
            <div className="transport-edit-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                onClick={() => {
                  cancelGesture();
                  setSelectedTransport("");
                  setMapAction("transport");
                  setError("");
                  setNewLock(null);
                  setMessage(
                    "Choose a destination and click a free tile to add a transport.",
                  );
                }}
              >
                New transport
              </button>
              <button
                type="button"
                className="text-button"
                disabled={!transportUndo.length || busy}
                onClick={() => {
                  const last = transportUndo.at(-1)!;
                  setTransports(last.transports);
                  setPortalOverrides(last.portalOverrides);
                  setTransportUndo((h) => h.slice(0, -1));
                  setSelectedTransport("");
                  setError("");
                  setMessage("Last transport edit undone.");
                }}
              >
                Undo transport edit
              </button>
            </div>
            <label>
              Destination map
              <select
                aria-label="Destination map"
                value={destination}
                onChange={(e) => editDestination(e.target.value)}
              >
                <option value="">Choose a map</option>
                {world.maps
                  .filter((m) => m.id !== mapId)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>Lock requirement
              <select aria-label="Lock requirement" value={selectedLock?.type || "none"} onChange={e => editLock(e.target.value === "key" ? {type:"key",color:"red"} : e.target.value === "incantation" ? {type:"incantation",phrase:""} : null)}>
                <option value="none">No lock</option>
                <option value="key">Locked door · colored key</option>
                <option value="incantation">Locked portal · incantation</option>
              </select>
            </label>
            {selectedLock?.type === "key" && <label>Required key color
              <select aria-label="Required key color" value={selectedLock.color} onChange={e => editLock({type:"key",color:e.target.value})}>
                {KEY_COLORS.map(color => <option key={color} value={color}>{color}</option>)}
              </select>
            </label>}
            {selectedLock?.type === "incantation" && <label>Required incantation
              <input aria-label="Required incantation" maxLength={80} value={selectedLock.phrase} placeholder="open sesame" onChange={e => editLock({type:"incantation",phrase:e.target.value})} />
              <small>Players enter this short phrase to unlock the portal. Case and extra spaces are ignored.</small>
            </label>}
            <p className="map-tool-help">Lock settings apply to the selected transport, or to the next transport you add. Unlocks belong to each player; keys are kept after use.</p>
            <p id="transport-tool-help" className="map-tool-help">
              Click a transport to edit it, or drag it to a free tile to move it.
              Escape cancels a drag. Theme entrances and exits keep their original return
              behavior. New transports arrive at the destination spawn and
              return when students step off and back onto its purple tile.
            </p>

            {selectedTransport && (
              <p className="map-tool-help">
                Editing{" "}
                {selectedTransport.startsWith("portal:")
                  ? engine.portals.find(
                      (p) => p.id === selectedTransport.slice(7),
                    )?.name
                  : "transport"}
                . Destination changes apply immediately to the draft. Drag it to move it.
              </p>
            )}

          </div>
        )}
        {panel === "advanced" && (
          <div className="map-settings-section">
            <label>Map name<input value={map.name} maxLength={80} onChange={e=>setMap(m=>({...m,name:e.target.value}))} /></label>
            <fieldset className="map-boundaries">
              <legend>Map boundaries</legend>
              {(["left", "right", "top", "bottom"] as const).map((side) => (
                <label key={side}>
                  {side[0].toUpperCase() + side.slice(1)}
                  <input
                    type="number"
                    aria-label={`Boundary ${side}`}
                    min={0}
                    max={side === "left" || side === "right" ? 39 : 27}
                    value={map.bounds[side]}
                    onChange={(e) =>
                      setMap((m) => ({
                        ...m,
                        bounds: { ...m.bounds, [side]: Number(e.target.value) },
                      }))
                    }
                  />
                </label>
              ))}
            </fieldset>
            <div className="map-bulk-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  const next = new Set<string>();
                  for (
                    let y = Math.max(0, map.bounds.top);
                    y <= Math.min(27, map.bounds.bottom);
                    y++
                  )
                    for (
                      let x = Math.max(0, map.bounds.left);
                      x <= Math.min(39, map.bounds.right);
                      x++
                    )
                      next.add(`${x},${y}`);
                  setCells(next);
                }}
              >
                Fill walkable within bounds
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setCells(new Set())}
              >
                Block all tiles
              </button>
            </div>
            <small>
              Painted ground overrides the old collision tiles. Entrances,
              exits, and spawn must stay reachable. Challenges need separate,
              reachable tiles.
            </small>
            <small>
              Undo last save restores the previous artwork and terrain while
              this page remains open.
            </small>
          </div>
        )}
        </div>
        <div className="map-settings-preview">
        <div className="entity-map-surface"><canvas
          ref={canvas}
          width={960}
          height={672}
          className="ground-canvas"
          style={{ cursor: busy ? "wait" : dragPreview ? "grabbing" : hoverItem ? "grab" : "crosshair" }}
          tabIndex={0}
          aria-label={panel === "entities" ? "Non-player entity placement map" : panel === "transport" ? "Transport placement map" : "Reachable ground painter"}
          aria-describedby={
            panel === "ground"
              ? "map-tool-help"
              : panel === "transport"
                ? "transport-tool-help"
                : panel === "entities" ? "entity-tool-help" : undefined
          }
          onPointerDown={(e) => {
            if (e.button !== 0 || !e.isPrimary || busy) return;
            e.preventDefault();
            e.currentTarget.focus();
            lastPaint.current = null;
            dragging.current = true;
            capturedPointer.current = e.pointerId;
            e.currentTarget.setPointerCapture(e.pointerId);
            const item = itemAt(e);
            if (item) {
              const tile = pointerTile(e), challenge = item.kind === "challenge" ? placements.find(c => c.id === item.id) : undefined;
              const offsetX = challenge ? tile.x - challenge.location.x : 0, offsetY = challenge ? tile.y - challenge.location.y : 0;
              itemDrag.current = { ...item, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, offsetX, offsetY, active: false, target: { x: tile.x - offsetX, y: tile.y - offsetY } };
              // Opening the selected item's controls can shift the canvas on mobile.
              // Keep the layout steady until the pointer is released.
              setError("");
            } else if (mapAction === panel) at(e);
            else mapPress.current = e.pointerId;
          }}
          onPointerMove={(e) => {
            const drag = itemDrag.current;
            if (drag?.pointerId === e.pointerId) {
              if (drag.readOnly) return;
              if (!drag.active && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 4) return;
              const tile = pointerTile(e);
              drag.active = true; drag.target = { x: tile.x - drag.offsetX, y: tile.y - drag.offsetY };
              setDragPreview({ kind: drag.kind, id: drag.id, destination: drag.destination, ...drag.target });
              return;
            }
            if (dragging.current && mapAction === "ground" && mapPress.current === null && panel === "ground" && mode !== "move")
              at(e);
            else if (!dragging.current) setHoverItem(!!itemAt(e));
          }}
          onPointerUp={(e) => {
            const drag = itemDrag.current;
            const tile = pointerTile(e), target = drag?.active ? { x: tile.x - drag.offsetX, y: tile.y - drag.offsetY } : tile, pressed = mapPress.current === e.pointerId;
            cancelGesture();
            if (drag?.pointerId === e.pointerId) {
              selectMapItem(drag, target);
              if (drag.active && !drag.readOnly) paint(target.x, target.y, false, drag);
            } else if (pressed && target.x >= 0 && target.x < 40 && target.y >= 0 && target.y < 28) selectMapItem(null, target);
            if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
          }}
          onPointerLeave={() => { if (!dragging.current) setHoverItem(false); }}
          onLostPointerCapture={cancelGesture}
          onPointerCancel={cancelGesture}
          onKeyDown={(e) => {
            if (e.key === "Escape") { e.preventDefault(); cancelGesture(); setMapAction(null); return; }
            if (busy) return;
            const dirs: Record<string, [number, number]> = {
              ArrowLeft: [-1, 0],
              ArrowRight: [1, 0],
              ArrowUp: [0, -1],
              ArrowDown: [0, 1],
            };
            if (dirs[e.key]) {
              e.preventDefault();
              const [dx, dy] = dirs[e.key];
              setCursor((c) => ({
                x: Math.max(0, Math.min(39, c.x + dx)),
                y: Math.max(0, Math.min(27, c.y + dy)),
              }));
            } else if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              const item = itemAtTile(cursor.x, cursor.y);
              if (item || mapAction !== panel) selectMapItem(item, cursor);
              else paint(cursor.x, cursor.y);
            }
          }}
        />
        <div className="entity-map-layer">{entities.filter(e => e.map === mapId).map(e => <EntityMarker key={e.id} entity={dragPreview?.kind === "entity" && dragPreview.id === e.id ? { ...e, location: { x: dragPreview.x, y: dragPreview.y } } : e} character={characters.find(c => c.id === e.characterId)} selected={e.id === selectedEntity || (dragPreview?.kind === "entity" && dragPreview.id === e.id)} />)}</div></div>
        <div className="map-canvas-meta">
          <div className="map-legend">
            <span>
              <i className="legend-walkable" />
              Reachable
            </span>
            <span>
              <i className="legend-disconnected" />
              Disconnected
            </span>
            <span>
              <i className="legend-blocked" />
              Blocked
            </span>
            <span className="legend-star">✦ Challenge</span>
            <span>
              <i className="legend-transport" />
              Transport
            </span>
          </div>
          <span className="map-tile-readout">
            Tile {cursor.x}, {cursor.y}
          </span>
        </div>
        {panel === "transport" && <section className="map-transport-rows" aria-label="Transports on this map">
          <h3>Transports on this map</h3>
            <div className="transport-list" role="region" aria-label="Map transports" tabIndex={0}>
              <table className="transport-table"><thead><tr><th scope="col">Transport</th><th scope="col">Locks</th><th scope="col">Actions</th></tr></thead><tbody>
              {engine.portals
                .filter((p) => p.map === mapId)
                .map((p) => (
                  <tr
                    key={p.id}
                    className={
                      selectedTransport === `portal:${p.id}`
                        ? "selected-transport"
                        : ""
                    }
                  >
                    <td className="transport-route-cell"><span>
                      <ArrowLeftRight size={15} />
                      {p.name} · {p.location.x}, {p.location.y} →{" "}
                      {world.maps.find((m) => m.id === p.to)?.name}
                    </span><small>Theme predefined</small></td>
                    <td className="transport-lock-cell"><TransportLockDetails lock={p.lock as TransportLock | null} /></td>
                    <td><div className="transport-row-actions">
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => {
                        setMapAction(null);
                        setSelectedTransport(`portal:${p.id}`);
                        setDestination(p.to);
                        setCursor({ ...p.location });
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      disabled={
                        !portalOverrides.some((o) => o.id === p.id) || busy
                      }
                      onClick={() => {
                        cancelGesture();
                        rememberTransport();
                        setPortalOverrides((os) =>
                          os.filter((o) => o.id !== p.id),
                        );
                        setSelectedTransport("");
                        setError("");
                        setMessage(
                          "Theme transport reset to its original location and destination. Save map to keep it.",
                        );
                      }}
                    >
                      Reset to theme
                    </button>
                    </div></td>
                  </tr>
                ))}

              {transports
                .filter((t) => t.map === mapId)
                .map((t) => (
                  <tr key={t.id} className={selectedTransport === `transport:${t.id}` ? "selected-transport" : ""}>
                    <td className="transport-route-cell"><span>
                      <ArrowLeftRight size={15} />
                      {t.location.x}, {t.location.y} →{" "}
                      {world.maps.find((m) => m.id === t.to)?.name}
                    </span></td>
                    <td className="transport-lock-cell"><TransportLockDetails lock={t.lock} /></td>
                    <td><div className="transport-row-actions">
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => {
                        setMapAction(null);
                        setSelectedTransport(`transport:${t.id}`);
                        setDestination(t.to);
                        setCursor({ ...t.location });
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      aria-label={`Remove transport at ${t.location.x}, ${t.location.y}`}
                      onClick={() => {
                        rememberTransport();
                        setTransports((ts) => ts.filter((v) => v.id !== t.id));
                        setSelectedTransport("");
                      }}
                    >
                      Remove
                    </button>
                    </div></td>
                  </tr>
                ))}
              </tbody></table>
              {!transports.some((t) => t.map === mapId) &&
                !engine.portals.some((p) => p.map === mapId) && (
                  <small>No outgoing transports on this map yet.</small>
                )}
            </div>
            {transports.some((t) => t.to === mapId) && (
              <small>
                The purple spawn tile returns students to the map they arrived
                from. Incoming links are managed on their source map.
              </small>
            )}
        </section>}
        {attention.length > 0 && (
          <div role="alert" className="map-attention">
            <b>
              {attention.length}{" "}
              {attention.length === 1 ? "challenge needs" : "challenges need"} a
              valid location
            </b>
            <p>Move to free, reachable ground before saving.</p>
            <ul>
              {attention.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setPanel("ground");
                      setMode("move");
                      setSelectedChallenge(c.id);
                      setCursor(c.location);
                    }}
                  >
                    {c.object}
                    <span>
                      {c.location.x}, {c.location.y} →
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {transportProblems.length > 0 && (
          <p role="alert" className="error">
            {transportProblems.join(" ")}
          </p>
        )}
        {entityProblems.length > 0 && <p role="alert" className="error">{entityProblems.join(" ")}</p>}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {message && <p role="status">{message}</p>}
        <div className="map-edit-footer">
          <div>
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => {
                reset();
                setMessage(entityOnly ? "Unsaved entity changes reset to the last saved version." : "Unsaved map changes reset to the last saved version.");
              }}
            >
              <RotateCcw size={15} />
              Reset
            </button>
            {previousSave && !entityOnly && (
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={() => void save(previousSave)}
              >
                Undo last save
              </button>
            )}
          </div>
          <button
            type="button"
            className="primary"
            disabled={
              busy || (entityOnly ? !entitiesDirty || entityProblems.length > 0 : attention.length > 0 || transportProblems.length > 0 || entityProblems.length > 0)
            }
            onClick={() => void save()}
          >
            {busy ? "Saving…" : entityOnly ? "Save entities" : "Save map"}
          </button>
        </div>
        </div>
      </div>
    </EditorContainer>
  );
}
