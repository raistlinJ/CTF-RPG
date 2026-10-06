"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { paintStroke } from "@/lib/paint-stroke.mjs";
import { createWorld, activeWorld } from "@/lib/world-data.mjs";
type MapData = (typeof activeWorld.maps)[number] & {
  ground?: [number, number][] | null;
};
type WorldData = Omit<typeof activeWorld, "maps"> & { maps: MapData[] };
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
}: {
  world: WorldData;
  mapId: string;
  themeRevision: number;
  contentRevision: number;
  onSaved: () => Promise<void>;
  challenges: Placement[];
}) {
  const original = world.maps.find((m) => m.id === mapId)!;
  const [map, setMap] = useState<MapData>(original),
    [cells, setCells] = useState<Set<string>>(new Set()),
    [image, setImage] = useState<File | null>(null),
    [imageUrl, setImageUrl] = useState<string | null>(null),
    [cursor, setCursor] = useState({ x: 0, y: 0 }),
    [mode, setMode] = useState<"allow" | "block" | "spawn" | "move">("allow"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [previousSave, setPreviousSave] = useState<MapData | null>(null),
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
      maps: world.maps.map((m) =>
        m.id === mapId ? { ...map, obstacles: [], ground } : m,
      ),
    }),
    [world, mapId, map, ground],
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
  async function save(restore?: MapData) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const form = new FormData();
      form.set(
        "map",
        JSON.stringify(
          restore
            ? { ...restore, ground: restore.ground ?? null }
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
      setPreviousSave(restore ? null : structuredClone(original));
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
  return (
    <details className="map-settings">
      <summary>Map artwork &amp; reachable ground</summary>
      <div className="map-settings-body">
        <p>
          Upload artwork for this map and paint the tiles students can walk on.
          The image fills a 40 × 28 grid. Gray tiles cannot hold challenges;
          green tiles are reachable from the yellow spawn. Amber tiles are
          painted walkable but disconnected. Painting overrides old building
          collision tiles; portals keep their existing positions.
        </p>
        <label>
          Map name
          <input
            value={map.name}
            maxLength={80}
            onChange={(e) => setMap((m) => ({ ...m, name: e.target.value }))}
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
          <small>
            PNG, JPEG, WebP or GIF · maximum 4 MB. Artwork changes do not
            automatically change walkable ground.
          </small>
        </label>
        <div className="admin-coordinate-fields">
          {(["left", "right", "top", "bottom"] as const).map((side) => (
            <label key={side}>
              Boundary {side}
              <input
                type="number"
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
        </div>
        <div className="admin-actions">
          {(["allow", "block", "spawn", "move"] as const).map((tool) => (
            <button
              type="button"
              className="secondary-button"
              aria-pressed={mode === tool}
              key={tool}
              onClick={() => setMode(tool)}
            >
              {tool === "allow"
                ? "Paint walkable"
                : tool === "block"
                  ? "Paint blocked"
                  : tool === "spawn"
                    ? "Set spawn"
                    : "Move challenge"}
            </button>
          ))}
        </div>
        <div className="admin-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              const next = new Set<string>();
              for (let y = map.bounds.top; y <= map.bounds.bottom; y++)
                for (let x = map.bounds.left; x <= map.bounds.right; x++)
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
        {mode === "move" && (
          <label>
            Challenge to move
            <select
              value={selectedChallenge}
              onChange={(e) => setSelectedChallenge(e.target.value)}
            >
              <option value="">Choose a challenge</option>
              {placements
                .filter((c) => c.map === mapId)
                .map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.object} ({c.location.x}, {c.location.y})
                  </option>
                ))}
            </select>
            <small>
              Choose a challenge or click its star, then click a free green
              destination. Moves are saved together with the map.
            </small>
          </label>
        )}
        <canvas
          ref={canvas}
          width={960}
          height={672}
          className="ground-canvas"
          tabIndex={0}
          aria-label="Reachable ground painter"
          onPointerDown={(e) => {
            e.preventDefault();
            lastPaint.current = null;
            dragging.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            at(e);
          }}
          onPointerMove={(e) => {
            if (dragging.current && mode !== "move") at(e);
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
        />
        <div className="admin-coordinate-fields">
          <label>
            Tile X
            <input
              type="number"
              min={0}
              max={39}
              value={cursor.x}
              onChange={(e) =>
                setCursor((c) => ({ ...c, x: Number(e.target.value) }))
              }
            />
          </label>
          <label>
            Tile Y
            <input
              type="number"
              min={0}
              max={27}
              value={cursor.y}
              onChange={(e) =>
                setCursor((c) => ({ ...c, y: Number(e.target.value) }))
              }
            />
          </label>
          <button
            type="button"
            className="secondary-button"
            onClick={() => paint(cursor.x, cursor.y)}
          >
            Apply tool at tile
          </button>
        </div>
        <small>
          Click or drag to paint. Yellow square: spawn ({map.spawn.x},{" "}
          {map.spawn.y}); cyan outlines: portals. Disconnected floor stays gray.
          Amber floor needs a connected path to spawn. Spawn and all door/exit
          approaches must remain reachable.
        </small>
        <div className="admin-actions">
          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={() => {
              reset();
              setMessage(
                "Unsaved map changes reset to the last saved version.",
              );
            }}
          >
            Reset
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={busy || !previousSave}
            onClick={() => void save(previousSave!)}
          >
            Undo last save
          </button>
        </div>
        <small>
          Reset discards unsaved map edits. Undo last save restores the map from
          before your most recent save on this page; it also restores the
          previous artwork. Earned points stay saved.
        </small>
        {(invalid.length > 0 || duplicated.length > 0) && (
          <div role="alert" className="error">
            <p>Move these challenges to free, reachable tiles before saving:</p>
            <ul>
              {[
                ...new Map(
                  [...invalid, ...duplicated].map((c) => [c.id, c]),
                ).values(),
              ].map((c) => (
                <li key={c.id}>
                  {c.object} ({c.location.x}, {c.location.y})
                </li>
              ))}
            </ul>
          </div>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {message && <p role="status">{message}</p>}
        <button
          type="button"
          className="primary"
          disabled={busy || invalid.length > 0 || duplicated.length > 0}
          onClick={() => void save()}
        >
          {busy ? "Saving map…" : "Save map"}
        </button>
      </div>
    </details>
  );
}
