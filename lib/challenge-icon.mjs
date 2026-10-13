// Copyright Jaime C Acosta 2026
export const challengeSize = c => c?.icon === "boss" ? (c.iconSize || 1) : 1;
export function challengeTiles(c, location = c.location) {
  const tiles = [], size = challengeSize(c);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) tiles.push({x: location.x + x, y: location.y + y});
  return tiles;
}
export function challengeDistance(c, p) {
  const s = challengeSize(c);
  return Math.max(c.location.x - p.x, 0, p.x - (c.location.x + s - 1)) + Math.max(c.location.y - p.y, 0, p.y - (c.location.y + s - 1));
}

/** @param {CanvasRenderingContext2D} ctx */
export function drawBossIcon(ctx, left, top, width) {
  const unit = width / 16;
  const pixel = (x,y,w,h,color) => { ctx.fillStyle=color; ctx.fillRect(left+x*unit,top+y*unit,w*unit,h*unit); };
  pixel(2,1,3,5,"#f5c66b"); pixel(11,1,3,5,"#f5c66b");
  pixel(3,4,10,10,"#592947"); pixel(4,5,8,8,"#c95a68");
  pixel(3,7,3,3,"#fff0c2"); pixel(10,7,3,3,"#fff0c2");
  pixel(5,8,1,2,"#211f34"); pixel(10,8,1,2,"#211f34");
  pixel(7,10,2,2,"#592947"); pixel(5,12,6,2,"#211f34");
  pixel(5,12,1,1,"#fff0c2"); pixel(10,12,1,1,"#fff0c2");
}
