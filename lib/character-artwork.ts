import { visibleSprite } from "./visible-sprite";

export const MAP_AVATAR_SIZE = 42;

export type CharacterArtwork = {
  sprite: string | null;
  fallback: "web" | "thunder" | "shield";
  administrator?: boolean;
};
export type SpriteImage = { path: string; image: HTMLImageElement | null };

/** Only return artwork belonging to the currently requested source. */
export function matchingSprite(path: string | null, artwork: SpriteImage | null) {
  return path && artwork?.path === path ? artwork.image : null;
}

export function drawCharacter(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  character: CharacterArtwork,
  image: HTMLImageElement | null,
  size: number,
) {
  if ((character.sprite || character.administrator) && !image) {
    // A configured image is still loading or failed. Do not substitute a legacy
    // character (including a previous administrator appearance) for this theme's artwork.
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size / 32, size / 32);
    ctx.fillStyle = "#8faab5";
    ctx.beginPath();
    ctx.arc(0, -8, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-9, 1, 18, 13);
    ctx.restore();
  } else if (image) {
    ctx.save();
    if (character.administrator) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
    }
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
    ctx.restore();
  } else sprite(ctx, x, y, character.fallback, size / 32);
}
function sprite(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  hero: string,
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
