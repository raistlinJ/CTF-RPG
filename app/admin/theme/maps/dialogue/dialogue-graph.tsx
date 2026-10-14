"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Flag, LayoutGrid, Maximize2, Pencil, Plus, Trash2, ZoomIn, ZoomOut } from "lucide-react";
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem } from "@/components/ui/context-menu";
import { dependencyBounds, dependencyWorldPoint, fitDependencyCamera, zoomDependencyCamera, DEPENDENCY_NODE_HEIGHT, DEPENDENCY_NODE_WIDTH } from "@/lib/dependency-viewport.mjs";
import type { EntityNode, NonPlayerEntity } from "@/lib/non-player-entities";

type Point = { x: number; y: number };
type Camera = Point & { zoom: number };
type Edge = { from: string; to: string; id: string; label: string };

function arrange(entity: NonPlayerEntity): Record<string, Point> {
  const levels = new Map<string, number>([[entity.startNode, 0]]);
  const queue = [entity.startNode];
  for (let i = 0; i < queue.length; i++) {
    const node = entity.nodes.find(n => n.id === queue[i]);
    for (const choice of node?.choices || []) if (!levels.has(choice.to)) {
      levels.set(choice.to, levels.get(queue[i])! + 1);
      queue.push(choice.to);
    }
  }
  const last = Math.max(0, ...levels.values());
  for (const node of entity.nodes) if (!levels.has(node.id)) levels.set(node.id, last + 1);
  const rows = new Map<number, EntityNode[]>();
  for (const node of entity.nodes) {
    const level = levels.get(node.id)!;
    rows.set(level, [...(rows.get(level) || []), node]);
  }
  const positions: Record<string, Point> = {};
  for (const [level, nodes] of rows) nodes.forEach((node, row) => {
    positions[node.id] = { x: 48 + level * 360, y: 48 + row * 180 };
  });
  return positions;
}

function curve(from: Point, to: Point) {
  const bend = Math.max(72, Math.abs(to.x - from.x) * .45);
  return `M ${from.x} ${from.y} C ${from.x + bend} ${from.y}, ${to.x - bend} ${to.y}, ${to.x} ${to.y}`;
}
function graphBounds(positions: Record<string, Point>, edges: Edge[]) {
  const bounds = dependencyBounds(positions, edges);
  const loops = edges.filter(edge => edge.from === edge.to && positions[edge.from]);
  return { ...bounds, top: Math.min(bounds.top, ...loops.map((edge, index) => positions[edge.from].y - 112 - index * 20)) };
}
function freePosition(point: Point, positions: Record<string, Point>): Point {
  const origin = { x: point.x - DEPENDENCY_NODE_WIDTH / 2, y: point.y - DEPENDENCY_NODE_HEIGHT / 2 };
  const occupied = Object.values(positions);
  for (let radius = 0; radius <= occupied.length + 1; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      const dx = radius - Math.abs(dy);
      for (const stepX of dx ? [-dx, dx] : [0]) {
        const candidate = { x: origin.x + stepX * (DEPENDENCY_NODE_WIDTH + 32), y: origin.y + dy * (DEPENDENCY_NODE_HEIGHT + 32) };
        if (occupied.every(position => Math.abs(position.x - candidate.x) >= DEPENDENCY_NODE_WIDTH + 24 || Math.abs(position.y - candidate.y) >= DEPENDENCY_NODE_HEIGHT + 24)) return candidate;
      }
    }
  }
  return origin;
}

export default function DialogueGraph({ entity, selectedNodeId, selectedChoiceId, disabled, onSelectNode, onSelectChoice, onOpenChoice, onOpenDialogue, onSetStart, onConnect, onAddDialogue, onRemoveDialogue, onAddChoice, onRemoveChoice }: {
  entity: NonPlayerEntity;
  selectedNodeId: string;
  selectedChoiceId: string;
  disabled: boolean;
  onSelectNode: (id: string) => void;
  onSelectChoice: (nodeId: string, choiceId: string) => void;
  onOpenChoice: (nodeId: string, choiceId: string) => void;
  onOpenDialogue: (id: string) => void;
  onSetStart: (id: string) => void;
  onConnect: (from: string, to: string) => void;
  onAddDialogue: () => string | undefined;
  onRemoveDialogue: (id: string) => void;
  onAddChoice: (id: string) => void;
  onRemoveChoice: (nodeId: string, choiceId: string) => void;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const [overrides, setOverrides] = useState<Record<string, Point>>({});
  const [camera, setCamera] = useState<Camera>({ x: 24, y: 24, zoom: 1 });
  const cameraRef = useRef(camera), fitted = useRef(false);
  const [source, setSource] = useState("");
  const sourceRef = useRef("");
  const [connectionPoint, setConnectionPoint] = useState<Point | null>(null);
  const connection = useRef<{ id: string; pointerId: number; start: Point } | null>(null);
  const drag = useRef<{ id: string; pointerId: number; offset: Point; element: HTMLElement } | null>(null);
  const pan = useRef<{ pointerId: number; start: Point; camera: Camera; element: HTMLElement } | null>(null);
  const addingDialogue = useRef(false);
  const editingFromMenu = useRef("");
  const editingChoiceFromMenu = useRef<{ from: string; id: string } | null>(null);
  const settingStartFromMenu = useRef("");
  const [contextNodeId, setContextNodeId] = useState("");
  const [contextChoice, setContextChoice] = useState<{ from: string; id: string } | null>(null);
  const menuPoint = useRef<Point | null>(null);
  const positions = useMemo(() => ({ ...arrange(entity), ...overrides }), [entity, overrides]);
  const edges: Edge[] = useMemo(() => entity.nodes.flatMap(node => node.choices.map(choice => ({ from: node.id, to: choice.to, id: choice.id, label: choice.label }))), [entity.nodes]);
  const positionsRef = useRef(positions), edgesRef = useRef(edges);
  useLayoutEffect(() => { positionsRef.current = positions; edgesRef.current = edges; }, [positions, edges]);
  const bounds = graphBounds(positions, edges);
  const removable = (id: string) => entity.nodes.length > 1 && id !== entity.startNode && !edges.some(edge => edge.to === id);
  const worldPoint = (clientX: number, clientY: number) => {
    const rect = viewport.current!.getBoundingClientRect();
    return dependencyWorldPoint(cameraRef.current, { x: clientX - rect.left, y: clientY - rect.top });
  };
  const applyCamera = useCallback((next: Camera) => { cameraRef.current = next; setCamera(next); }, []);
  const stopGesture = useCallback(() => {
    const captured = drag.current || pan.current;
    drag.current = null; pan.current = null;
    if (captured?.element.hasPointerCapture(captured.pointerId)) captured.element.releasePointerCapture(captured.pointerId);
  }, []);
  const fit = useCallback(() => {
    const el = viewport.current;
    if (!el) return;
    stopGesture(); fitted.current = true;
    applyCamera(fitDependencyCamera(graphBounds(positionsRef.current, edgesRef.current), el.clientWidth, el.clientHeight));
  }, [applyCamera, stopGesture]);
  const zoom = useCallback((scale: number, anchor?: Point) => {
    const el = viewport.current;
    if (!el) return;
    stopGesture(); fitted.current = false;
    const current = cameraRef.current;
    const next = Math.max(Math.min(.01, current.zoom), Math.min(3, scale));
    applyCamera(zoomDependencyCamera(current, next, anchor || { x: el.clientWidth / 2, y: el.clientHeight / 2 }));
  }, [applyCamera, stopGesture]);
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    let size = { width: el.clientWidth, height: el.clientHeight };
    let initialized = false;
    const observer = new ResizeObserver(() => {
      const next = { width: el.clientWidth, height: el.clientHeight };
      if (!next.width || !next.height) return;
      if (!initialized) { initialized = true; fit(); size = next; return; }
      if (next.width === size.width && next.height === size.height) return;
      if (fitted.current) fit();
      else { const current = cameraRef.current; applyCamera({ ...current, x: current.x + (next.width - size.width) / 2, y: current.y + (next.height - size.height) / 2 }); }
      size = next;
    });
    observer.observe(el);
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      if (drag.current || pan.current || sourceRef.current) return;
      const rect = el.getBoundingClientRect();
      if (event.ctrlKey || event.metaKey) zoom(cameraRef.current.zoom * Math.exp(-event.deltaY * .002), { x: event.clientX - rect.left, y: event.clientY - rect.top });
      else { fitted.current = false; const current = cameraRef.current; applyCamera({ ...current, x: current.x - event.deltaX, y: current.y - event.deltaY }); }
    };
    const abort = () => { stopGesture(); connection.current = null; sourceRef.current = ""; setSource(""); setConnectionPoint(null); };
    const visibility = () => { if (document.hidden) abort(); };
    el.addEventListener("wheel", wheel, { passive: false });
    window.addEventListener("blur", abort);
    document.addEventListener("visibilitychange", visibility);
    return () => { observer.disconnect(); el.removeEventListener("wheel", wheel); window.removeEventListener("blur", abort); document.removeEventListener("visibilitychange", visibility); stopGesture(); };
  }, [applyCamera, fit, stopGesture, zoom]);
  const nodeNumber = useMemo(() => new Map(entity.nodes.map((node, index) => [node.id, index + 1])), [entity.nodes]);
  function cancelConnection() {
    sourceRef.current = "";
    setSource("");
    setConnectionPoint(null);
    connection.current = null;
  }
  function finishConnection(clientX: number, clientY: number, pointerId: number) {
    const active = connection.current;
    if (!active || active.pointerId !== pointerId) return;
    connection.current = null;
    const target = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>("[data-dialogue-input]");
    const to = target?.dataset.dialogueInput;
    if (to && !target?.hasAttribute("disabled")) { onConnect(active.id, to); cancelConnection(); }
    else if (Math.hypot(clientX - active.start.x, clientY - active.start.y) > 4) cancelConnection();
    else setConnectionPoint(null);
  }
  function arrangeGraph() {
    stopGesture(); cancelConnection(); setOverrides({});
    const el = viewport.current;
    if (el) { fitted.current = true; applyCamera(fitDependencyCamera(graphBounds(arrange(entity), edges), el.clientWidth, el.clientHeight)); }
  }
  return <section className="dependency-graph-shell dialogue-graph-shell" aria-label="Dialogue graph editor">
    <div className="dependency-graph-toolbar">
      <p>{entity.nodes.length} dialogue screens · {edges.length} player choices</p>
      <div className="dependency-graph-tools">
        <button type="button" className="secondary-button" disabled={disabled || entity.nodes.length >= 50} onClick={onAddDialogue}><Plus size={17}/>Add dialogue</button>
        <button type="button" className="secondary-button" disabled={disabled || camera.zoom <= .01} onClick={() => { cancelConnection(); zoom(cameraRef.current.zoom / 1.25); }} aria-label="Zoom out"><ZoomOut size={17}/>Zoom out</button>
        <button type="button" className="secondary-button dependency-zoom" disabled={disabled} onClick={() => { cancelConnection(); zoom(1); }} aria-label="Reset zoom to 100%" title="Reset zoom to 100%">{camera.zoom < .001 ? "<0.1" : camera.zoom < .01 ? (camera.zoom * 100).toFixed(1) : Math.round(camera.zoom * 100)}%</button>
        <button type="button" className="secondary-button" disabled={disabled || camera.zoom >= 3} onClick={() => { cancelConnection(); zoom(cameraRef.current.zoom * 1.25); }} aria-label="Zoom in"><ZoomIn size={17}/>Zoom in</button>
        <button type="button" className="secondary-button" disabled={disabled} onClick={() => { cancelConnection(); fit(); }}><Maximize2 size={17}/>Fit graph</button>
        <button type="button" className="secondary-button" disabled={disabled} onClick={arrangeGraph}><LayoutGrid size={17}/>Arrange graph</button>
      </div>
    </div>
    <div className="dependency-graph-hint"><p role="status">{source ? `Drag to a dialogue's left handle, or select it, to add a choice from dialogue ${nodeNumber.get(source)}.` : "Double-click or right-click a card or connection to edit it. Right-click empty canvas for New dialogue."}</p><button type="button" className="text-button" onClick={cancelConnection} disabled={!source} style={{ visibility: source ? "visible" : "hidden" }}>Cancel</button></div>
    <ContextMenu onOpenChange={open => { if (open) { stopGesture(); cancelConnection(); } }}>
    <ContextMenuTrigger asChild disabled={disabled}>
    <div className="dependency-graph-viewport" ref={viewport} role="region" aria-label="Conversation branching graph" tabIndex={0}
      onContextMenu={event => {
        const target = event.target as Element;
        const choice = target.closest("[data-dialogue-choice]");
        if (choice) {
          setContextChoice({ from: choice.getAttribute("data-dialogue-from") || "", id: choice.getAttribute("data-dialogue-choice") || "" });
          setContextNodeId(""); menuPoint.current = null; return;
        }
        const node = target.closest<HTMLElement>("[data-dialogue-node]");
        if (node) { setContextNodeId(node.dataset.dialogueNode || ""); setContextChoice(null); menuPoint.current = null; return; }
        if (target !== event.currentTarget && !target.hasAttribute("data-canvas-background")) { event.preventDefault(); return; }
        setContextNodeId(""); setContextChoice(null);
        menuPoint.current = event.clientX && event.clientY ? worldPoint(event.clientX, event.clientY) : null;
      }}
      onKeyDown={e => {
        if (e.key === "Escape") { stopGesture(); cancelConnection(); }
        if (e.target !== e.currentTarget || disabled) return;
        if (e.key === "+" || e.key === "=") { e.preventDefault(); cancelConnection(); zoom(cameraRef.current.zoom * 1.25); }
        if (e.key === "-") { e.preventDefault(); cancelConnection(); zoom(cameraRef.current.zoom / 1.25); }
        if (e.key === "Home") { e.preventDefault(); cancelConnection(); fit(); }
      }}
      onPointerDown={e => {
        if (e.button !== 0 || sourceRef.current || drag.current || pan.current || e.target !== e.currentTarget && !(e.target as Element).hasAttribute("data-canvas-background")) return;
        fitted.current = false;
        pan.current = { pointerId: e.pointerId, start: { x: e.clientX, y: e.clientY }, camera: cameraRef.current, element: e.currentTarget };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={e => { if (connection.current?.pointerId === e.pointerId) setConnectionPoint(worldPoint(e.clientX, e.clientY)); const p = pan.current; if (p?.pointerId === e.pointerId) applyCamera({ ...p.camera, x: p.camera.x + e.clientX - p.start.x, y: p.camera.y + e.clientY - p.start.y }); }}
      onPointerUp={e => { if (pan.current?.pointerId === e.pointerId) stopGesture(); finishConnection(e.clientX, e.clientY, e.pointerId); }}
      onPointerCancel={() => { stopGesture(); cancelConnection(); }}
      onLostPointerCapture={e => { if (pan.current?.pointerId === e.pointerId) pan.current = null; }}>
      <div className="dependency-graph-background" data-canvas-background />
      <div className="dependency-graph-world" data-canvas-background style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})` }}>
        <svg className="dependency-edges" width={bounds.right - bounds.left} height={bounds.bottom - bounds.top} viewBox={`${bounds.left} ${bounds.top} ${bounds.right - bounds.left} ${bounds.bottom - bounds.top}`} style={{ left: bounds.left, top: bounds.top }} data-canvas-background aria-label="Player choice connections">
          <defs><marker id="dialogue-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" /></marker></defs>
          {edges.map(edge => {
            const from = positions[edge.from], to = positions[edge.to];
            if (!from || !to) return null;
            const start = { x: from.x + DEPENDENCY_NODE_WIDTH + 14, y: from.y + DEPENDENCY_NODE_HEIGHT / 2 };
            const end = { x: to.x - 16, y: to.y + DEPENDENCY_NODE_HEIGHT / 2 };
            const loop = edge.from === edge.to;
            const loopIndex = edges.filter(item => item.from === edge.from && item.to === edge.to).findIndex(item => item.id === edge.id);
            const path = loop
              ? `M ${start.x} ${start.y} C ${start.x + 100} ${from.y - 92 - loopIndex * 20}, ${end.x - 100} ${from.y - 92 - loopIndex * 20}, ${end.x} ${end.y}`
              : curve(start, end);
            const selected = edge.from === selectedNodeId && edge.id === selectedChoiceId;
            const labelX = loop ? from.x + DEPENDENCY_NODE_WIDTH / 2 : (start.x + end.x) / 2;
            const labelY = loop ? from.y - 72 - loopIndex * 20 : (start.y + end.y) / 2 - 12;
            return <g key={`${edge.from}:${edge.id}`} data-dialogue-choice={edge.id} data-dialogue-from={edge.from} className={selected ? "dependency-edge selected" : "dependency-edge"}>
              <path d={path} className="dependency-edge-line" markerEnd="url(#dialogue-arrow)" />
              <path d={path} className="dependency-edge-hit" role="button" tabIndex={0} aria-label={`${edge.label || "Untitled choice"}: dialogue ${nodeNumber.get(edge.from)} to dialogue ${nodeNumber.get(edge.to)}`} aria-pressed={selected}
                onClick={() => onSelectChoice(edge.from, edge.id)} onDoubleClick={() => { if (!disabled) onOpenChoice(edge.from, edge.id); }} onKeyDown={e => { if (!disabled && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onOpenChoice(edge.from, edge.id); } }} />
              <text className="dialogue-edge-label" x={labelX} y={labelY} textAnchor="middle" onClick={() => onSelectChoice(edge.from, edge.id)} onDoubleClick={() => { if (!disabled) onOpenChoice(edge.from, edge.id); }}>{edge.label || "Untitled choice"}</text>
              <g className="dialogue-edge-remove" role="button" tabIndex={disabled ? -1 : 0} aria-label={`Remove choice ${edge.label || "Untitled choice"} from dialogue ${nodeNumber.get(edge.from)}`} aria-disabled={disabled}
                onClick={event => { event.stopPropagation(); if (!disabled) onRemoveChoice(edge.from, edge.id); }}
                onKeyDown={event => { if (!disabled && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onRemoveChoice(edge.from, edge.id); } }}
                transform={`translate(${labelX}, ${labelY + 15})`}>
                <circle r="12"/><path d="M -4 -4 L 4 4 M 4 -4 L -4 4"/>
              </g>
            </g>;
          })}
          {source && connectionPoint && positions[source] && <path className="dependency-edge-preview" d={curve({ x: positions[source].x + DEPENDENCY_NODE_WIDTH + 14, y: positions[source].y + DEPENDENCY_NODE_HEIGHT / 2 }, connectionPoint)} />}
        </svg>
        {entity.nodes.map(node => <article key={node.id} data-dialogue-node={node.id} className={`dependency-node dialogue-node${node.id === selectedNodeId ? " selected" : ""}${node.id === entity.startNode ? " first" : ""}`} style={{ left: positions[node.id].x, top: positions[node.id].y, width: DEPENDENCY_NODE_WIDTH, height: DEPENDENCY_NODE_HEIGHT }} aria-label={`Dialogue ${nodeNumber.get(node.id)}`}>
          <button type="button" className="dependency-handle input" data-dialogue-input={node.id} disabled={disabled} aria-label={`Connect choice to dialogue ${nodeNumber.get(node.id)}`} title="Use this dialogue as the response" onClick={() => { if (source) { onConnect(source, node.id); cancelConnection(); } }} />
          <button type="button" className="dependency-node-drag" aria-pressed={node.id === selectedNodeId} aria-label={`Edit dialogue ${nodeNumber.get(node.id)}`} title="Double-click or right-click to edit dialogue text" onClick={() => { onSelectNode(node.id); cancelConnection(); }} onDoubleClick={() => { if (!disabled) onOpenDialogue(node.id); }} onKeyDown={event => { if (!disabled && event.key === "Enter") { event.preventDefault(); onOpenDialogue(node.id); } }}
            onPointerDown={e => { if (disabled || e.button !== 0 || drag.current || pan.current) return; cancelConnection(); fitted.current = false; const point = worldPoint(e.clientX, e.clientY); const position = positions[node.id]; drag.current = { id: node.id, pointerId: e.pointerId, offset: { x: point.x - position.x, y: point.y - position.y }, element: e.currentTarget }; e.currentTarget.setPointerCapture(e.pointerId); }}
            onPointerMove={e => { const d = drag.current; if (d?.pointerId !== e.pointerId) return; const point = worldPoint(e.clientX, e.clientY); setOverrides(previous => ({ ...previous, [d.id]: { x: point.x - d.offset.x, y: point.y - d.offset.y } })); }}
            onPointerUp={e => { if (drag.current?.pointerId === e.pointerId) stopGesture(); }}
            onPointerCancel={stopGesture}
            onLostPointerCapture={e => { if (drag.current?.pointerId === e.pointerId) drag.current = null; }}>
            <strong>Dialogue {nodeNumber.get(node.id)}{node.id === entity.startNode ? " · Start" : ""}</strong>
            <small>{node.text || "Write this dialogue"}</small>
            <span className="dependency-node-meta">{node.choices.length ? `${node.choices.length} player ${node.choices.length === 1 ? "choice" : "choices"}` : "Conversation ends"}</span>
          </button>
          <div className="dialogue-node-actions">
            <button type="button" disabled={disabled || node.choices.length >= 10} aria-label={`Add choice to dialogue ${nodeNumber.get(node.id)}`} title="Add a choice from this dialogue" onClick={() => onAddChoice(node.id)}><Plus size={15}/></button>
            <button type="button" disabled={disabled || !removable(node.id)} aria-label={`Remove dialogue ${nodeNumber.get(node.id)}`} title={removable(node.id) ? "Remove this dialogue" : "Change the first dialogue and remove incoming choices before deleting"} onClick={() => onRemoveDialogue(node.id)}><Trash2 size={15}/></button>
          </div>
          <button type="button" className="dependency-handle output" disabled={disabled || node.choices.length >= 10} aria-label={`Start choice from dialogue ${nodeNumber.get(node.id)}`} title="Drag to a response dialogue" onClick={event => { if (event.detail === 0) { sourceRef.current = node.id; setSource(node.id); onSelectNode(node.id); } }}
            onPointerDown={event => {
              if (event.button !== 0) return;
              connection.current = { id: node.id, pointerId: event.pointerId, start: { x: event.clientX, y: event.clientY } };
              sourceRef.current = node.id;
              setSource(node.id); setConnectionPoint(worldPoint(event.clientX, event.clientY)); onSelectNode(node.id);
            }}
            onPointerCancel={cancelConnection} />
        </article>)}
      </div>
    </div>
    </ContextMenuTrigger>
    <ContextMenuContent className="dependency-canvas-menu" onCloseAutoFocus={event => {
      if (editingChoiceFromMenu.current) {
        event.preventDefault();
        const { from, id } = editingChoiceFromMenu.current;
        editingChoiceFromMenu.current = null;
        viewport.current?.focus({ preventScroll: true });
        onOpenChoice(from, id);
        return;
      }
      if (editingFromMenu.current) {
        event.preventDefault();
        const id = editingFromMenu.current;
        editingFromMenu.current = "";
        viewport.current?.focus({ preventScroll: true });
        onOpenDialogue(id);
        return;
      }
      if (settingStartFromMenu.current) {
        event.preventDefault();
        const id = settingStartFromMenu.current;
        settingStartFromMenu.current = "";
        viewport.current?.focus({ preventScroll: true });
        onSetStart(id);
        return;
      }
      if (!addingDialogue.current) return;
      event.preventDefault(); addingDialogue.current = false;
      viewport.current?.focus({ preventScroll: true });
      const id = onAddDialogue();
      if (id && menuPoint.current) setOverrides(previous => ({ ...previous, [id]: freePosition(menuPoint.current!, positionsRef.current) }));
      menuPoint.current = null;
    }}>
      {contextChoice
        ? <ContextMenuItem disabled={disabled} onSelect={() => { editingChoiceFromMenu.current = contextChoice; }}><Pencil size={17}/>Edit connection</ContextMenuItem>
        : contextNodeId
        ? <><ContextMenuItem disabled={disabled} onSelect={() => { editingFromMenu.current = contextNodeId; }}><Pencil size={17}/>Edit dialogue</ContextMenuItem>
          <ContextMenuItem disabled={disabled || contextNodeId === entity.startNode} onSelect={() => { settingStartFromMenu.current = contextNodeId; }}><Flag size={17}/>Set as first dialogue</ContextMenuItem></>
        : <ContextMenuItem disabled={disabled || entity.nodes.length >= 50} onSelect={() => { addingDialogue.current = true; }}><Plus size={17}/>New dialogue</ContextMenuItem>}
    </ContextMenuContent>
    </ContextMenu>
  </section>;
}
