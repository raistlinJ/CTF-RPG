// Copyright Jaime C Acosta 2026
export const challengeSize = c => c?.icon === "boss" ? (c.iconSize || 1) : 1;
export function challengeBounds(c, tileSize, location = c.location) {
  const size = challengeSize(c) * tileSize;
  return { left: location.x * tileSize, top: location.y * tileSize, width: size, height: size };
}
export function drawChallengeFootprint(ctx, c, tileSize, location = c.location) {
  const { left, top, width, height } = challengeBounds(c, tileSize, location);
  ctx.fillRect(left, top, width, height);
  ctx.strokeRect(left + 1, top + 1, width - 2, height - 2);
}
export function challengeTiles(c, location = c.location) {
  const tiles = [], size = challengeSize(c);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) tiles.push({x: location.x + x, y: location.y + y});
  return tiles;
}
export function challengeDistance(c, p) {
  const s = challengeSize(c);
  return Math.max(c.location.x - p.x, 0, p.x - (c.location.x + s - 1)) + Math.max(c.location.y - p.y, 0, p.y - (c.location.y + s - 1));
}

export const BOSS_STYLES = [
  { id: "classic", label: "Classic horned boss", sprite: "/sprites/boss-classic.png" },
  { id: "frost", label: "Frost warden", sprite: "/sprites/boss-frost.png" },
  { id: "clockwork", label: "Clockwork golem", sprite: "/sprites/boss-clockwork.png" },
  { id: "shadow", label: "Shadow mage", sprite: "/sprites/boss-shadow.png" },
  { id: "ember", label: "Ember dragon", sprite: "/sprites/boss-ember.png" },
  { id: "serpent", label: "Ice serpent", sprite: "/sprites/boss-serpent.png" },
];

/** @param {CanvasRenderingContext2D} ctx
 * @param {HTMLImageElement | null} image */
export function drawBossIcon(ctx, left, top, width, style = "classic", image = null) {
  if (image?.naturalWidth) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, left, top, width, width);
    ctx.restore();
    return;
  }
  const unit = width / 16;
  const pixel = (x,y,w,h,color) => { ctx.fillStyle=color; ctx.fillRect(left+x*unit,top+y*unit,w*unit,h*unit); };
  if (style === "frost") {
    pixel(1,3,14,11,"#1b3c69"); pixel(3,1,2,5,"#b6efff"); pixel(7,0,2,5,"#e9fbff"); pixel(11,1,2,5,"#b6efff");
    pixel(3,5,10,9,"#83d4ef"); pixel(4,6,8,7,"#d7f6ff"); pixel(4,8,3,2,"#245a91"); pixel(9,8,3,2,"#245a91");
    pixel(5,8,1,2,"#f9ffff"); pixel(10,8,1,2,"#f9ffff"); pixel(6,12,4,1,"#3a6e9a"); pixel(7,13,2,2,"#b6efff");
    return;
  }
  if (style === "clockwork") {
    pixel(2,2,12,12,"#594332"); pixel(0,5,3,5,"#b77940"); pixel(13,5,3,5,"#b77940"); pixel(5,0,6,3,"#dba85f");
    pixel(3,3,10,10,"#ba854a"); pixel(4,4,8,8,"#e0bb75"); pixel(4,6,3,3,"#273d50"); pixel(9,6,3,3,"#273d50");
    pixel(5,7,1,1,"#8ce8ed"); pixel(10,7,1,1,"#8ce8ed"); pixel(7,8,2,3,"#8a5b3b"); pixel(5,12,6,2,"#594332");
    pixel(6,12,1,1,"#f3d99e"); pixel(9,12,1,1,"#f3d99e"); return;
  }
  if (style === "shadow") {
    pixel(6,0,4,2,"#7151a3"); pixel(3,2,10,3,"#553675"); pixel(1,5,14,10,"#2a274a"); pixel(3,5,10,8,"#593f78");
    pixel(4,7,8,5,"#1b1c37"); pixel(4,8,3,2,"#b9f2ee"); pixel(9,8,3,2,"#b9f2ee");
    pixel(5,8,1,1,"#49b8c8"); pixel(10,8,1,1,"#49b8c8"); pixel(6,12,4,1,"#9a6dbb"); pixel(2,14,12,2,"#553675"); return;
  }
  if (style === "ember") {
    pixel(1,0,3,6,"#f5a23a"); pixel(12,0,3,6,"#f5a23a"); pixel(3,3,10,11,"#842f37"); pixel(4,4,8,9,"#df5a3e");
    pixel(2,6,2,5,"#b44437"); pixel(12,6,2,5,"#b44437"); pixel(4,7,3,2,"#f8d36a"); pixel(9,7,3,2,"#f8d36a");
    pixel(5,8,1,1,"#44293c"); pixel(10,8,1,1,"#44293c"); pixel(7,9,2,3,"#f5a23a"); pixel(5,12,6,2,"#44293c");
    pixel(5,12,1,2,"#fff1c2"); pixel(10,12,1,2,"#fff1c2"); return;
  }
  if (style === "serpent") {
    pixel(3,1,10,3,"#2d785f"); pixel(2,4,12,9,"#205d57"); pixel(3,5,10,7,"#58b98b"); pixel(4,7,3,2,"#f5eaa6");
    pixel(9,7,3,2,"#f5eaa6"); pixel(5,8,1,1,"#1b4652"); pixel(10,8,1,1,"#1b4652"); pixel(6,10,4,2,"#2d785f");
    pixel(4,12,8,2,"#194851"); pixel(6,12,1,1,"#e7f8db"); pixel(9,12,1,1,"#e7f8db"); pixel(7,14,2,2,"#e86e82"); return;
  }
  pixel(2,1,3,5,"#f5c66b"); pixel(11,1,3,5,"#f5c66b");
  pixel(3,4,10,10,"#592947"); pixel(4,5,8,8,"#c95a68");
  pixel(3,7,3,3,"#fff0c2"); pixel(10,7,3,3,"#fff0c2");
  pixel(5,8,1,2,"#211f34"); pixel(10,8,1,2,"#211f34");
  pixel(7,10,2,2,"#592947"); pixel(5,12,6,2,"#211f34");
  pixel(5,12,1,1,"#fff0c2"); pixel(10,12,1,1,"#fff0c2");
}
