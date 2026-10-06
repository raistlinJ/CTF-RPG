"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createWorld, activeWorld } from "@/lib/world-data.mjs";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
type MapData = (typeof activeWorld.maps)[number] & {
  ground?: [number, number][] | null;
};
type WorldData = Omit<typeof activeWorld, "maps"> & { maps: MapData[] };
type Overflow = { kept: number; excluded: { id: string; object: string }[] };
export default function MapSettings({
  world,
  mapId,
  themeRevision,
  contentRevision,
  onSaved,
}: {
  world: WorldData;
  mapId: string;
  themeRevision: number;
  contentRevision: number;
  onSaved: () => Promise<void>;
}) {
  const original = world.maps.find((m) => m.id === mapId)!;
  const [map, setMap] = useState<MapData>(original),
    [cells, setCells] = useState<Set<string>>(new Set()),
    [image, setImage] = useState<File | null>(null),
    [imageUrl, setImageUrl] = useState<string | null>(null),
    [cursor, setCursor] = useState({ x: 0, y: 0 }),
    [mode, setMode] = useState<"allow" | "block" | "spawn">("allow"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [overflow, setOverflow] = useState<Overflow | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null),
    dragging = useRef(false);
  useEffect(() => {
    const engine = createWorld(world),
      next = new Set<string>();
    for (let y = 0; y < 28; y++)
      for (let x = 0; x < 40; x++)
        if (!engine.blocked(mapId, x, y)) next.add(`${x},${y}`);
    setMap(original);
    setCells(next);
    setImage(null);
    setError("");
    setOverflow(null);
  }, [world, mapId]);
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
            : "rgba(135,140,145,0.48)";
          ctx.fillRect(x * 24, y * 24, 24, 24);
          ctx.strokeStyle = "rgba(20,40,50,0.25)";
          ctx.strokeRect(x * 24, y * 24, 24, 24);
        }
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
  }, [map, world, mapId, imageUrl, engine]);
  function paint(x: number, y: number) {
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
    if (mode === "spawn") {
      setMap((m) => ({ ...m, spawn: { x, y } }));
      setCells((s) => new Set(s).add(`${x},${y}`));
    } else
      setCells((s) => {
        const next = new Set(s);
        if (mode === "allow") next.add(`${x},${y}`);
        else next.delete(`${x},${y}`);
        return next;
      });
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
    );
  }
  async function save(dropOverflow = false) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const form = new FormData();
      form.set(
        "map",
        JSON.stringify({
          id: map.id,
          name: map.name,
          bounds: map.bounds,
          spawn: map.spawn,
          ground,
        }),
      );
      form.set("themeRevision", String(themeRevision));
      form.set("contentRevision", String(contentRevision));
      if (image) form.set("image", image);
      if (dropOverflow) form.set("dropOverflow", "true");
      const r = await fetch("/api/admin/maps", { method: "POST", body: form }),
        d = (await r.json()) as {
          error?: string;
          needsDecision?: boolean;
          placement: Overflow & { moved: unknown[] };
        };
      if (!r.ok) throw Error(d.error || "Could not save the map.");
      if (d.needsDecision) {
        setOverflow(d.placement);
        return;
      }
      setOverflow(null);
      await onSaved();
      setMessage(
        `Map saved. ${d.placement.moved.length} challenges moved; ${d.placement.excluded.length} excluded. Reload the game to use it.`,
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
          green tiles are reachable from the yellow spawn. Buildings and portals
          keep their existing positions.
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
          {(["allow", "block", "spawn"] as const).map((tool) => (
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
                  : "Set spawn"}
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
        <canvas
          ref={canvas}
          width={960}
          height={672}
          className="ground-canvas"
          tabIndex={0}
          aria-label="Reachable ground painter"
          onPointerDown={(e) => {
            e.preventDefault();
            dragging.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            at(e);
          }}
          onPointerMove={(e) => {
            if (dragging.current) at(e);
          }}
          onPointerUp={() => {
            dragging.current = false;
          }}
          onPointerCancel={() => {
            dragging.current = false;
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
          Spawn and all door/exit approaches must remain reachable.
        </small>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {message && <p role="status">{message}</p>}
        <button
          type="button"
          className="primary"
          disabled={busy}
          onClick={() => void save()}
        >
          {busy ? "Saving map…" : "Save map"}
        </button>
      </div>
      <AlertDialog
        open={!!overflow}
        onOpenChange={(open) => {
          if (!open && !busy) setOverflow(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Not every challenge fits</AlertDialogTitle>
            <AlertDialogDescription>
              Nothing has changed. Cancel to add more reachable ground, or save
              the map and exclude the listed extras. Export your content first
              to keep a copy.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-48 overflow-y-auto">
            {overflow?.excluded.map((c) => (
              <p key={c.id}>
                {c.object} ({c.id})
              </p>
            ))}
            <a href="/api/admin/packs?kind=content">Export current content</a>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void save(true);
              }}
            >
              Save and exclude {overflow?.excluded.length}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </details>
  );
}
