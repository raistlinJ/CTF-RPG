"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Footprints,
  Ban,
  MapPin,
  Move,
  Image as ImageIcon,
  SlidersHorizontal,
  Paintbrush,
  RotateCcw,
  ArrowLeftRight,
} from "lucide-react";
import { paintStroke } from "@/lib/paint-stroke.mjs";
import { createWorld, activeWorld } from "@/lib/world-data.mjs";
type MapData = (typeof activeWorld.maps)[number] & {
  ground?: [number, number][] | null;
};
type Transport = {
  id: string;
  map: string;
  location: { x: number; y: number };
  to: string;
};
type WorldData = Omit<typeof activeWorld, "maps"> & {
  maps: MapData[];
  transports?: Transport[];
};
type Placement = {
  id: string;
  object: string;
  map: string;
  location: { x: number; y: number };
};
export default function MapSettings({
  world,
  mapId,
  themeRevision,
  contentRevision,
  onSaved,
  challenges,
  onOpenChange,
}: {
  world: WorldData;
  mapId: string;
  themeRevision: number;
  contentRevision: number;
  onSaved: () => Promise<void>;
  challenges: Placement[];
  onOpenChange: (open: boolean) => void;
}) {
  const original = world.maps.find((m) => m.id === mapId)!;
  const [map, setMap] = useState<MapData>(original),
    [cells, setCells] = useState<Set<string>>(new Set()),
    [image, setImage] = useState<File | null>(null),
    [imageUrl, setImageUrl] = useState<string | null>(null),
    [cursor, setCursor] = useState({ x: 0, y: 0 }),
    [editorOpen, setEditorOpen] = useState(false),
    [panel, setPanel] = useState<
      "ground" | "transport" | "artwork" | "advanced"
    >("ground"),
    [mode, setMode] = useState<"allow" | "block" | "spawn" | "move">("allow"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [previousSave, setPreviousSave] = useState<{
      map: MapData;
      transports: Transport[];
    } | null>(null),
    [transports, setTransports] = useState<Transport[]>(world.transports || []),
    [destination, setDestination] = useState(
      world.maps.find((m) => m.id !== mapId)?.id || "",
    ),
    [moves, setMoves] = useState<Record<string, { x: number; y: number }>>({}),
    [selectedChallenge, setSelectedChallenge] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null),
    dragging = useRef(false),
    lastPaint = useRef<{ x: number; y: number } | null>(null),
    imageInput = useRef<HTMLInputElement>(null);
  function reset() {
    const engine = createWorld(world),
      next = new Set<string>();
    for (let y = 0; y < 28; y++)
      for (let x = 0; x < 40; x++)
        if (!engine.blocked(mapId, x, y)) next.add(`${x},${y}`);
    setMap(structuredClone(original));
    setCells(next);
    setImage(null);
    setImageUrl(null);
    if (imageInput.current) imageInput.current.value = "";
    setCursor({ ...original.spawn });
    setMode("allow");
    setTransports(structuredClone(world.transports || []));
    setDestination(world.maps.find((m) => m.id !== mapId)?.id || "");
    setError("");
    setMoves({});
    setSelectedChallenge("");
    dragging.current = false;
    lastPaint.current = null;
  }
  useEffect(() => {
    reset();
  }, [world, mapId]);
  useEffect(() => {
    setPreviousSave(null);
    setMessage("");
  }, [mapId]);
  useEffect(() => {
    if (!image) {
      setImageUrl(null);
      return;
    }
    const url = URL.createObjectURL(image);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);
  const ground = useMemo(
    () => [...cells].map((k) => k.split(",").map(Number) as [number, number]),
    [cells],
  );
  const preview = useMemo(
    () => ({
      ...world,
      transports,
      maps: world.maps.map((m) =>
        m.id === mapId ? { ...map, obstacles: [], ground } : m,
      ),
    }),
    [world, mapId, map, ground, transports],
  );
  const engine = useMemo(() => createWorld(preview), [preview]);
  const placements = useMemo(
    () =>
      challenges.map((c) => ({ ...c, location: moves[c.id] || c.location })),
    [challenges, moves],
  );
  const invalid = placements.filter(
    (c) => !engine.canPlaceChallenge(c.map, c.location.x, c.location.y),
  );
  const duplicated = placements.filter((c, i) =>
    placements.some(
      (d, j) =>
        j < i &&
        d.map === c.map &&
        d.location.x === c.location.x &&
        d.location.y === c.location.y,
    ),
  );
  const transportProblems = transports.flatMap((t) => {
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
  });
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
        ctx.fillText("✦", c.location.x * 24 + 12, c.location.y * 24 + 19);
        if (c.id === selectedChallenge) {
          ctx.strokeStyle = "#ffe393";
          ctx.lineWidth = 3;
          ctx.strokeRect(c.location.x * 24 + 1, c.location.y * 24 + 1, 22, 22);
        }
      }
      for (const p of engine.transportTiles(mapId)) {
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
      ctx.strokeStyle = "#85f4ea";
      ctx.lineWidth = 3;
      const portals =
        mapId === world.startMap
          ? world.buildings.map((b) => b.door)
          : map.exit
            ? [map.exit]
            : [];
      for (const p of portals)
        ctx.strokeRect(p.x * 24 + 2, p.y * 24 + 2, 20, 20);
    };
    const src = imageUrl || map.background;
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
    imageUrl,
    engine,
    cursor,
    placements,
    selectedChallenge,
  ]);
  function paint(x: number, y: number, continuous = false) {
    if (
      !Number.isInteger(x) ||
      !Number.isInteger(y) ||
      x < 0 ||
      x > 39 ||
      y < 0 ||
      y > 27
    )
      return;
    setCursor({ x, y });
    if (panel === "transport") {
      if (!destination) {
        setError("Choose a destination map first.");
        return;
      }
      const existing = transports.find(
        (t) => t.map === mapId && t.location.x === x && t.location.y === y,
      );
      if (existing) {
        setDestination(existing.to);
        setMessage(
          "This transport is already placed. Remove it from the list to choose a new tile.",
        );
        return;
      }
      if (
        !engine.canPlaceChallenge(mapId, x, y) ||
        (x === map.spawn.x && y === map.spawn.y)
      ) {
        setError(
          "Choose reachable ground away from a spawn, doorway, or transport tile.",
        );
        return;
      }
      if (
        placements.some(
          (c) => c.map === mapId && c.location.x === x && c.location.y === y,
        )
      ) {
        setError(
          "Move the challenge off this tile before placing a transport.",
        );
        return;
      }
      const target = world.maps.find((m) => m.id === destination)!;
      if (
        placements.some(
          (c) =>
            c.map === destination &&
            c.location.x === target.spawn.x &&
            c.location.y === target.spawn.y,
        )
      ) {
        setError(
          "Move the challenge at the destination spawn before linking this map.",
        );
        return;
      }
      setTransports((ts) => [
        ...ts,
        {
          id: "transport-" + crypto.randomUUID(),
          map: mapId,
          location: { x, y },
          to: destination,
        },
      ]);
      setError("");
      setMessage("");
      return;
    }
    if (mode === "move") {
      const clicked = placements.find(
        (c) => c.map === mapId && c.location.x === x && c.location.y === y,
      );
      if (clicked) {
        setSelectedChallenge(clicked.id);
        setError("");
        return;
      }
      if (!selectedChallenge) {
        setError(
          "Click a challenge star or choose a challenge, then click its destination.",
        );
        return;
      }
      if (!engine.canPlaceChallenge(mapId, x, y)) {
        setError("Choose a free, reachable tile for this challenge.");
        return;
      }
      setMoves((s) => ({ ...s, [selectedChallenge]: { x, y } }));
      setError("");
      setMessage("");
      return;
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
  async function save(restore?: { map: MapData; transports: Transport[] }) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const form = new FormData();
      form.set(
        "map",
        JSON.stringify(
          restore
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
      form.set("transports", JSON.stringify(restore?.transports || transports));
      if (image && !restore) form.set("image", image);
      form.set(
        "moves",
        JSON.stringify(Object.entries(moves).map(([id, p]) => ({ id, ...p }))),
      );
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
            },
      );
      await onSaved();
      setMessage(
        `${restore ? "Previous saved map restored" : "Map saved"}. ${d.placement.moved.length} challenges moved. Reload the game to use it.`,
      );
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
      help: "Click a reachable tile to set the player’s starting position.",
    },
    move: {
      name: "Move challenge",
      label: "Move challenge",
      icon: Move,
      help: "Select a star or challenge name, then click a free green destination.",
    },
  };
  const attention = [
    ...new Map([...invalid, ...duplicated].map((c) => [c.id, c])).values(),
  ];
  return (
    <details
      className="map-settings"
      onToggle={(e) => {
        setEditorOpen(e.currentTarget.open);
        onOpenChange(e.currentTarget.open);
      }}
    >
      <summary>
        <span>
          <Paintbrush size={17} />
          Map artwork &amp; reachable ground
        </span>
        <span className="map-summary-hint">
          {editorOpen ? "Close editor" : "Edit map"}
        </span>
      </summary>
      <div className="map-settings-body">
        <div className="map-settings-tabs" aria-label="Map settings sections">
          {(
            [
              { id: "ground", label: "Ground", icon: Paintbrush },
              { id: "transport", label: "Transport", icon: ArrowLeftRight },
              { id: "artwork", label: "Artwork", icon: ImageIcon },
              { id: "advanced", label: "Advanced", icon: SlidersHorizontal },
            ] as const
          ).map((tab) => (
            <button
              type="button"
              key={tab.id}
              aria-pressed={panel === tab.id}
              onClick={() => setPanel(tab.id)}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </div>
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
                    aria-pressed={mode === tool}
                    onClick={() => {
                      setMode(tool);
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
              {tools[mode].help}
            </p>
            {mode === "move" && (
              <label className="map-move-picker">
                Challenge to move
                <select
                  value={selectedChallenge}
                  onChange={(e) => setSelectedChallenge(e.target.value)}
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
            <label>
              Destination map
              <select
                aria-label="Destination map"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
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
            <p id="transport-tool-help" className="map-tool-help">
              Choose a destination and click a free tile. Students arrive at
              that map’s spawn; step off and back onto its purple return tile to
              come back.
            </p>
            <div className="transport-list">
              {transports
                .filter((t) => t.map === mapId)
                .map((t) => (
                  <div key={t.id}>
                    <span>
                      <ArrowLeftRight size={15} />
                      {t.location.x}, {t.location.y} →{" "}
                      {world.maps.find((m) => m.id === t.to)?.name}
                    </span>
                    <button
                      type="button"
                      className="text-button"
                      aria-label={`Remove transport at ${t.location.x}, ${t.location.y}`}
                      onClick={() =>
                        setTransports((ts) => ts.filter((v) => v.id !== t.id))
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}
              {!transports.some((t) => t.map === mapId) && (
                <small>No outgoing transports on this map yet.</small>
              )}
            </div>
            {transports.some((t) => t.to === mapId) && (
              <small>
                The purple spawn tile returns students to the map they arrived
                from. Incoming links are managed on their source map.
              </small>
            )}
          </div>
        )}
        {panel === "artwork" && (
          <div className="map-settings-section">
            <label>
              Map name
              <input
                value={map.name}
                maxLength={80}
                onChange={(e) =>
                  setMap((m) => ({ ...m, name: e.target.value }))
                }
              />
            </label>
            <label>
              Upload map image
              <input
                ref={imageInput}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  setError("");
                  if (file && file.size > 4 * 1024 * 1024) {
                    setError("Image must be at most 4 MB.");
                    return;
                  }
                  setImage(file || null);
                }}
              />
            </label>
            {image && <small>Selected image: {image.name}</small>}
            <small>
              PNG, JPEG, WebP or GIF · up to 4 MB. Images fill the 40 × 28 grid;
              ground is painted separately.
            </small>
          </div>
        )}
        {panel === "advanced" && (
          <div className="map-settings-section">
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
        <canvas
          ref={canvas}
          width={960}
          height={672}
          className="ground-canvas"
          tabIndex={0}
          aria-label="Reachable ground painter"
          aria-describedby={
            panel === "ground"
              ? "map-tool-help"
              : panel === "transport"
                ? "transport-tool-help"
                : undefined
          }
          onPointerDown={(e) => {
            if ((panel !== "ground" && panel !== "transport") || busy) return;
            e.preventDefault();
            e.currentTarget.focus();
            lastPaint.current = null;
            dragging.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            at(e);
          }}
          onPointerMove={(e) => {
            if (dragging.current && panel === "ground" && mode !== "move")
              at(e);
          }}
          onPointerUp={() => {
            dragging.current = false;
            lastPaint.current = null;
          }}
          onLostPointerCapture={() => {
            dragging.current = false;
            lastPaint.current = null;
          }}
          onPointerCancel={() => {
            dragging.current = false;
            lastPaint.current = null;
          }}
          onKeyDown={(e) => {
            if ((panel !== "ground" && panel !== "transport") || busy) return;
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
              paint(cursor.x, cursor.y);
            }
          }}
        />
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
                setMessage(
                  "Unsaved map changes reset to the last saved version.",
                );
              }}
            >
              <RotateCcw size={15} />
              Reset
            </button>
            {previousSave && (
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
              busy || attention.length > 0 || transportProblems.length > 0
            }
            onClick={() => void save()}
          >
            {busy ? "Saving…" : "Save map"}
          </button>
        </div>
      </div>
    </details>
  );
}
