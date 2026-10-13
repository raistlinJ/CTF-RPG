const spriteBounds = new WeakMap<HTMLImageElement, { x: number; y: number; w: number; h: number }>();

/** Find the visible artwork inside a sprite's transparent padding. */
export function visibleSprite(image: HTMLImageElement) {
  const saved = spriteBounds.get(image);
  if (saved) return saved;
  const width = image.naturalWidth, height = image.naturalHeight;
  let bounds = { x: 0, y: 0, w: width, h: height };
  try {
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(image, 0, 0);
    const data = ctx.getImageData(0, 0, width, height).data;
    let left = width, top = height, right = -1, bottom = -1;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        if (data[(y * width + x) * 4 + 3] > 20) {
          left = Math.min(left, x); top = Math.min(top, y);
          right = Math.max(right, x); bottom = Math.max(bottom, y);
        }
    if (right >= left) bounds = { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
  } catch {}
  spriteBounds.set(image, bounds);
  return bounds;
}
