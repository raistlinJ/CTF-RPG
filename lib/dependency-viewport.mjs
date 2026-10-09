// Geometry shared by the dependency graph's camera and pointer interactions.
export const DEPENDENCY_NODE_WIDTH = 240;
export const DEPENDENCY_NODE_HEIGHT = 112;
/** @param {Record<string, {x:number,y:number}>} positions @param {{from:string,to:string}[]} [edges] */
export function dependencyBounds(positions, edges = []) {
  const points = Object.values(positions);
  if (!points.length) return { left: 0, top: 0, right: 240, bottom: 112 };
  let left = Math.min(...points.map((p) => p.x - 16));
  let right = Math.max(...points.map((p) => p.x + DEPENDENCY_NODE_WIDTH + 16));
  const top = Math.min(...points.map((p) => p.y));
  const bottom = Math.max(...points.map((p) => p.y + DEPENDENCY_NODE_HEIGHT));
  // Include curve control points when a card is moved behind its prerequisite.
  for (const edge of edges) {
    const source = positions[edge.from], target = positions[edge.to];
    if (!source || !target) continue;
    const from = source.x + DEPENDENCY_NODE_WIDTH + 14, to = target.x - 16;
    const bend = Math.max(72, Math.abs(to - from) * .45);
    left = Math.min(left, to - bend, from);
    right = Math.max(right, from + bend, to);
  }
  return { left, top, right, bottom };
}
/** @param {{left:number,top:number,right:number,bottom:number}} bounds */
export function fitDependencyCamera(bounds, width, height) {
  const zoom = Math.min(1, Math.max(1, width - 48) / (bounds.right - bounds.left), Math.max(1, height - 48) / (bounds.bottom - bounds.top));
  return {
    zoom,
    x: width / 2 - (bounds.left + bounds.right) / 2 * zoom,
    y: height / 2 - (bounds.top + bounds.bottom) / 2 * zoom,
  };
}
/** @param {{x:number,y:number,zoom:number}} camera @param {{x:number,y:number}} point */
export function dependencyWorldPoint(camera, point) {
  return { x: (point.x - camera.x) / camera.zoom, y: (point.y - camera.y) / camera.zoom };
}
/** Keep the same world point under the cursor or viewport center during zoom. */
export function zoomDependencyCamera(camera, zoom, anchor) {
  const world = dependencyWorldPoint(camera, anchor);
  return { zoom, x: anchor.x - world.x * zoom, y: anchor.y - world.y * zoom };
}
