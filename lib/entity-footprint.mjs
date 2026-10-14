// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
export const entitySize = entity => entity?.size || 1;
export function entityTiles(entity, location = entity.location) {
  const tiles = [], size = entitySize(entity);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) tiles.push({x:location.x+x, y:location.y+y});
  return tiles;
}
export function entityOccupiesTile(entity, map, x, y) {
  const size = entitySize(entity);
  return entity.map === map && x >= entity.location.x && x < entity.location.x+size && y >= entity.location.y && y < entity.location.y+size;
}
export function entityDistance(entity, x, y) {
  const size = entitySize(entity);
  return Math.max(entity.location.x-x, 0, x-(entity.location.x+size-1)) + Math.max(entity.location.y-y, 0, y-(entity.location.y+size-1));
}
