// Interpolate skipped pointer events into a connected, one-tile-wide stroke.
export function paintStroke(from, to) {
  let x = from?.x ?? to.x,
    y = from?.y ?? to.y;
  const points = [{ x, y }],
    dx = Math.abs(to.x - x),
    dy = Math.abs(to.y - y);
  const sx = Math.sign(to.x - x),
    sy = Math.sign(to.y - y);
  let ix = 0,
    iy = 0;
  while (ix < dx || iy < dy) {
    if (ix < dx && (iy === dy || (ix + 0.5) / dx <= (iy + 0.5) / dy)) {
      x += sx;
      ix++;
    } else {
      y += sy;
      iy++;
    }
    points.push({ x, y });
  }
  return points;
}
