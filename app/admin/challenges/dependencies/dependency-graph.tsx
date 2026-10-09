"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Maximize2, ZoomIn, ZoomOut, LayoutGrid, Trash2, Info } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { dependencyBounds, dependencyWorldPoint, fitDependencyCamera, zoomDependencyCamera, DEPENDENCY_NODE_WIDTH, DEPENDENCY_NODE_HEIGHT } from "@/lib/dependency-viewport.mjs";
export type DependencyNode = {
  id: string; object: string; map: string; region: string;
  visibility: "hidden" | "visible"; points: number; dependsOn: string[];
  summary: string; grading: "automatic" | "manual";
};
type Point = { x: number; y: number };
const nodeWidth = DEPENDENCY_NODE_WIDTH, nodeHeight = DEPENDENCY_NODE_HEIGHT;
type Camera = Point & { zoom: number };
type Capture = { element: HTMLElement; pointerId: number };
function arrange(nodes: DependencyNode[]): Record<string, Point> {
  const byId = new Map(nodes.map((c) => [c.id, c]));
  const levels = new Map<string, number>();
  function level(id: string): number {
    if (levels.has(id)) return levels.get(id)!;
    const prerequisites = byId.get(id)?.dependsOn || [];
    const depth = prerequisites.length ? 1 + Math.max(...prerequisites.map(level)) : 0;
    levels.set(id, depth); return depth;
  }
  const groups = new Map<number, DependencyNode[]>();
  for (const c of nodes) {
    const depth = level(c.id);
    if (!groups.has(depth)) groups.set(depth, []);
    groups.get(depth)!.push(c);
  }
  const positions: Record<string, Point> = {};
  let x = 32;
  for (const [, group] of [...groups].sort(([a], [b]) => a - b)) {
    group.sort((a, b) => a.object.localeCompare(b.object) || a.id.localeCompare(b.id));
    group.forEach((c, i) => { positions[c.id] = { x: x + Math.floor(i / 4) * 336, y: 32 + (i % 4) * 148 }; });
    x += Math.ceil(group.length / 4) * 336;
  }
  return positions;
}
function curve(from: Point, to: Point) {
  const bend = Math.max(72, Math.abs(to.x - from.x) * .45);
  return `M ${from.x} ${from.y} C ${from.x + bend} ${from.y}, ${to.x - bend} ${to.y}, ${to.x} ${to.y}`;
}
export default function DependencyGraph({ nodes, disabled, onConnect, onRemove }: {
  nodes: DependencyNode[]; disabled: boolean;
  onConnect: (from: string, to: string) => boolean;
  onRemove: (from: string, to: string) => void;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const [positions, setPositions] = useState(() => arrange(nodes));
  const positionsRef = useRef(positions);
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, zoom: 1 });
  const cameraRef = useRef(camera), fitted = useRef(false);
  const [source, setSource] = useState<string | null>(null), [pointer, setPointer] = useState<Point | null>(null),
    [selected, setSelected] = useState<string | null>(null), [infoId, setInfoId] = useState<string | null>(null);
  const infoTrigger = useRef<HTMLButtonElement | null>(null);
  const connecting = useRef<string | null>(null);
  const suppressClick = useRef(false);
  const drag = useRef<(Capture & { id: string; offset: Point }) | null>(null);
  const pan = useRef<(Capture & { start: Point; camera: Camera }) | null>(null);
  const edges = nodes.flatMap((c) => c.dependsOn.map((from) => ({ from, to: c.id, id: `${from}>${c.id}` })));
  const edgesRef = useRef(edges);
  // Pointer handlers and resize callbacks always use the latest geometry.
  useLayoutEffect(() => { positionsRef.current = positions; edgesRef.current = edges; }, [positions, edges]);
  const selectedEdge = edges.find((e) => e.id === selected), info = nodes.find((c) => c.id === infoId);
  const bounds = dependencyBounds(positions, edges);
  const zoom = camera.zoom;
  const applyCamera = useCallback((next: Camera) => { cameraRef.current = next; setCamera(next); }, []);
  function cancel() { connecting.current = null; setSource(null); setPointer(null); }
  const stopGesture = useCallback(() => {
    const captured = drag.current || pan.current;
    drag.current = null; pan.current = null;
    if (captured?.element.hasPointerCapture(captured.pointerId)) captured.element.releasePointerCapture(captured.pointerId);
  }, []);
  const fit = useCallback(() => {
    const el = viewport.current;
    if (!el) return;
    stopGesture(); fitted.current = true;
    connecting.current = null; setSource(null); setPointer(null);
    applyCamera(fitDependencyCamera(dependencyBounds(positionsRef.current, edgesRef.current), el.clientWidth, el.clientHeight));
  }, [applyCamera, stopGesture]);
  const changeZoom = useCallback((next: number, anchor?: Point) => {
    const el = viewport.current;
    if (!el) return;
    stopGesture(); fitted.current = false;
    connecting.current = null; setSource(null); setPointer(null);
    const current = cameraRef.current;
    // Fit can use a smaller scale for a widely spread graph; zoom back in gradually.
    const scale = Math.max(Math.min(.01, current.zoom), Math.min(3, next));
    applyCamera(zoomDependencyCamera(current, scale, anchor || { x: el.clientWidth / 2, y: el.clientHeight / 2 }));
  }, [applyCamera, stopGesture]);
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    let size = { width: el.clientWidth, height: el.clientHeight };
    const observer = new ResizeObserver(() => {
      const next = { width: el.clientWidth, height: el.clientHeight };
      if (next.width === size.width && next.height === size.height) return;
      if (fitted.current) fit();
      else {
        const current = cameraRef.current;
        applyCamera({ ...current, x: current.x + (next.width - size.width) / 2, y: current.y + (next.height - size.height) / 2 });
      }
      size = next;
    });
    observer.observe(el);
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      if (drag.current || pan.current || connecting.current) return;
      const rect = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) changeZoom(cameraRef.current.zoom * Math.exp(-e.deltaY * .002), { x: e.clientX - rect.left, y: e.clientY - rect.top });
      else { fitted.current = false; const current = cameraRef.current; applyCamera({ ...current, x: current.x - e.deltaX, y: current.y - e.deltaY }); }
    };
    const abort = () => { stopGesture(); connecting.current = null; setSource(null); setPointer(null); };
    const visibility = () => { if (document.hidden) abort(); };
    el.addEventListener("wheel", wheel, { passive: false });
    window.addEventListener("blur", abort);
    document.addEventListener("visibilitychange", visibility);
    return () => { observer.disconnect(); el.removeEventListener("wheel", wheel); window.removeEventListener("blur", abort); document.removeEventListener("visibilitychange", visibility); stopGesture(); };
  }, [applyCamera, changeZoom, fit, stopGesture]);
  function begin(id: string) {
    if (disabled) return;
    stopGesture(); suppressClick.current = false; connecting.current = id; setSource(id); setSelected(null);
    const p = positionsRef.current[id]; setPointer({ x: p.x + nodeWidth + 70, y: p.y + nodeHeight / 2 });
  }
  function finish(id: string) {
    const from = connecting.current;
    if (!from || disabled) return;
    suppressClick.current = true; cancel();
    if (onConnect(from, id)) setSelected(`${from}>${id}`);
  }
  function coordinate(e: React.PointerEvent): Point {
    const rect = viewport.current!.getBoundingClientRect();
    return dependencyWorldPoint(cameraRef.current, { x: e.clientX - rect.left, y: e.clientY - rect.top });
  }
  function moveNode(e: React.PointerEvent<HTMLButtonElement>, id: string) {
    if (disabled || e.button !== 0 || drag.current || pan.current) return;
    cancel(); setSelected(null); fitted.current = false;
    const point = coordinate(e), position = positionsRef.current[id];
    drag.current = { id, offset: { x: point.x - position.x, y: point.y - position.y }, element: e.currentTarget, pointerId: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function dragNode(e: React.PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const point = coordinate(e);
    setPositions((previous) => ({ ...previous, [d.id]: { x: point.x - d.offset.x, y: point.y - d.offset.y } }));
  }
  function arrangeGraph() {
    stopGesture(); cancel(); setSelected(null);
    const next = arrange(nodes); positionsRef.current = next; setPositions(next); fit();
  }
  return <section className="dependency-graph-shell" aria-label="Dependency graph editor">
    <div className="dependency-graph-toolbar">
      <p>{nodes.length} challenges · {edges.length} connections</p>
      <div className="dependency-graph-tools">
        <button type="button" className="secondary-button" aria-label="Zoom out" disabled={disabled || zoom <= .01} onClick={() => changeZoom(cameraRef.current.zoom / 1.25)}><ZoomOut size={17}/>Zoom out</button>
        <button type="button" className="secondary-button dependency-zoom" aria-label="Reset zoom to 100%" title="Reset zoom to 100%" disabled={disabled} onClick={() => changeZoom(1)}>{zoom < .001 ? "<0.1" : zoom < .01 ? (zoom * 100).toFixed(1) : Math.round(zoom * 100)}%</button>
        <button type="button" className="secondary-button" aria-label="Zoom in" disabled={disabled || zoom >= 3} onClick={() => changeZoom(cameraRef.current.zoom * 1.25)}><ZoomIn size={17}/>Zoom in</button>
        <button type="button" className="secondary-button" disabled={disabled} onClick={fit}><Maximize2 size={17}/>Fit graph</button>
        <button type="button" className="secondary-button" disabled={disabled} onClick={arrangeGraph}><LayoutGrid size={17}/>Arrange graph</button>
        <button type="button" className="secondary-button" disabled={disabled || !selectedEdge} onClick={() => { if (selectedEdge) onRemove(selectedEdge.from, selectedEdge.to); setSelected(null); }}><Trash2 size={17}/>Remove connection</button>
      </div>
    </div>
    <div className="dependency-graph-hint">
      <p role="status">{source ? `Choose a left handle to require ${nodes.find((c) => c.id === source)?.object}.` : "Drag a right handle to a left handle. Drag cards to move; drag the background to pan."}</p>
      <button type="button" className="text-button" onClick={cancel} disabled={!source} style={{ visibility: source ? "visible" : "hidden" }}>Cancel</button>
    </div>
    <div className="dependency-graph-viewport" ref={viewport} role="region" aria-label="Challenge dependency graph" tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Escape") { stopGesture(); cancel(); }
        if (e.target !== e.currentTarget || disabled) return;
        if (e.key === "+" || e.key === "=") { e.preventDefault(); changeZoom(cameraRef.current.zoom * 1.25); }
        if (e.key === "-") { e.preventDefault(); changeZoom(cameraRef.current.zoom / 1.25); }
        if (e.key === "Home") { e.preventDefault(); fit(); }
      }}
      onPointerDown={(e) => {
        if (e.button !== 0 || connecting.current || drag.current || pan.current) return;
        const target = e.target as Element;
        if (target !== e.currentTarget && !target.hasAttribute("data-canvas-background")) return;
        fitted.current = false;
        pan.current = { start: { x: e.clientX, y: e.clientY }, camera: cameraRef.current, element: e.currentTarget, pointerId: e.pointerId };
        e.currentTarget.setPointerCapture(e.pointerId); setSelected(null);
      }}
      onPointerMove={(e) => {
        if (connecting.current) setPointer(coordinate(e));
        const p = pan.current;
        if (p?.pointerId === e.pointerId) applyCamera({ ...p.camera, x: p.camera.x + e.clientX - p.start.x, y: p.camera.y + e.clientY - p.start.y });
      }}
      onPointerUp={(e) => {
        if (pan.current?.pointerId === e.pointerId) stopGesture();
        const target = document.elementFromPoint(e.clientX,e.clientY)?.closest<HTMLElement>("[data-dependency-input]");
        if (target) finish(target.dataset.dependencyInput!);
      }}
      onPointerCancel={() => { stopGesture(); cancel(); }}
      onLostPointerCapture={(e) => { if (pan.current?.pointerId === e.pointerId) pan.current = null; }}>
      <div className="dependency-graph-background" data-canvas-background/>
        <div className="dependency-graph-world" data-canvas-background style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${zoom})` }}>
          <svg className="dependency-edges" width={bounds.right - bounds.left} height={bounds.bottom - bounds.top} viewBox={`${bounds.left} ${bounds.top} ${bounds.right - bounds.left} ${bounds.bottom - bounds.top}`} style={{ left: bounds.left, top: bounds.top }} data-canvas-background aria-label="Prerequisite connections">
            <defs><marker id="dependency-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor"/></marker></defs>
            {edges.map((edge) => {
              const from = positions[edge.from], to = positions[edge.to];
              if (!from || !to) return null;
              const d = curve({ x: from.x + nodeWidth + 14, y: from.y + nodeHeight / 2 }, { x: to.x - 16, y: to.y + nodeHeight / 2 });
              const label = `${nodes.find((c) => c.id === edge.from)?.object} prerequisite for ${nodes.find((c) => c.id === edge.to)?.object}`;
              return <g key={edge.id} className={selected === edge.id ? "dependency-edge selected" : "dependency-edge"}>
                <path d={d} className="dependency-edge-line" markerEnd="url(#dependency-arrow)"/>
                <path d={d} className="dependency-edge-hit" role="button" tabIndex={disabled ? -1 : 0} aria-label={label} aria-pressed={selected === edge.id}
                  onClick={() => { if (!disabled) { cancel(); setSelected(edge.id); } }}
                  onKeyDown={(e) => {
                    if (disabled) return;
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); cancel(); setSelected(edge.id); }
                    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); onRemove(edge.from, edge.to); setSelected(null); }
                  }}/>
              </g>;
            })}
            {source && pointer && positions[source] && <path className="dependency-edge-preview" d={curve({ x: positions[source].x + nodeWidth, y: positions[source].y + nodeHeight / 2 }, pointer)}/>}
          </svg>
          {nodes.map((c) => <article className={"dependency-node" + (source === c.id ? " connecting" : "")} key={c.id} aria-label={`Challenge ${c.object}`} style={{ left: positions[c.id].x, top: positions[c.id].y, width: nodeWidth, height: nodeHeight }}>
            <button type="button" className="dependency-handle input" data-dependency-input={c.id} aria-label={`Connect prerequisite to ${c.object}`} title="Connect a prerequisite here" disabled={disabled} onClick={() => finish(c.id)}/>
            <button type="button" className="dependency-node-drag" aria-label={`Move challenge ${c.object}`} title={`${c.object}\n${c.id}\nDrag to move, or use arrow keys while focused.`} disabled={disabled}
              onPointerDown={(e) => moveNode(e,c.id)} onPointerMove={dragNode} onPointerUp={(e) => { if (drag.current?.pointerId === e.pointerId) stopGesture(); }} onPointerCancel={stopGesture} onLostPointerCapture={(e) => { if (drag.current?.pointerId === e.pointerId) drag.current = null; }}
              onKeyDown={(e) => {
                const step = { ArrowLeft: [-16,0], ArrowRight: [16,0], ArrowUp: [0,-16], ArrowDown: [0,16] }[e.key];
                if (!step) return;
                e.preventDefault(); fitted.current = false; setPositions((previous) => ({ ...previous, [c.id]: { x: previous[c.id].x + step[0], y: previous[c.id].y + step[1] } }));
              }}>
              <strong>{c.object}</strong><small>{c.id}</small>
              <span className="dependency-node-meta">{c.visibility === "hidden" ? "Hidden · " : ""}{c.dependsOn.length ? `${c.dependsOn.length} prerequisite${c.dependsOn.length === 1 ? "" : "s"}` : "Available at start"}</span>
            </button>
            <button type="button" className="dependency-node-info" aria-label={`Challenge info: ${c.object}`} title="Challenge info" onClick={(e) => { stopGesture(); cancel(); infoTrigger.current = e.currentTarget; setInfoId(c.id); }}><Info size={17}/></button>
            <button type="button" className="dependency-handle output" aria-label={`Start connection from ${c.object}`} title="Connect to the challenge this unlocks" disabled={disabled} onPointerDown={(e) => { if (e.button === 0) begin(c.id); }} onClick={(e) => { if (e.detail > 0 && suppressClick.current) { suppressClick.current = false; return; } begin(c.id); }}/>
          </article>)}
        </div>
    </div>
    <Dialog open={!!info} onOpenChange={(open) => { if (!open) setInfoId(null); }}>
      <DialogContent className="dependency-info-dialog" showCloseButton={false} onCloseAutoFocus={(e) => { e.preventDefault(); infoTrigger.current?.focus({ preventScroll: true }); }}>
        <DialogTitle>{info?.object}</DialogTitle>
        <DialogDescription>{info?.region} · {info?.map}</DialogDescription>
        <div className="dependency-info-body">
        <dl className="dependency-info-details">
          <div><dt>Points</dt><dd>{info?.points.toLocaleString()}</dd></div>
          <div><dt>Answer checking</dt><dd>{info?.grading === "manual" ? "Written answer" : "Automatic"}</dd></div>
          <div><dt>Visibility</dt><dd>{info?.visibility === "hidden" ? "Hidden" : "Visible"}</dd></div>
          <div><dt>Challenge ID</dt><dd>{info?.id}</dd></div>
        </dl>
        <div><h3>Challenge preview</h3><p className="dependency-info-preview">{info?.summary || "No challenge text available."}</p></div>
        <div><h3>Prerequisites</h3><p>{info?.dependsOn.length ? info.dependsOn.map((id) => nodes.find((c) => c.id === id)?.object || id).join(", ") : "No prerequisites"}</p></div>
        </div>
        <DialogClose className="secondary-button">Close</DialogClose>
      </DialogContent>
    </Dialog>
  </section>;
}
