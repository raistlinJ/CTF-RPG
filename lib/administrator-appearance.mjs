// Reserved administrator artwork shared by previews, portraits, and map players.
export const DEFAULT_ADMIN_SPRITE = '/sprites/administrator-overseer-v1.webp';

/**
 * @param {string|null} [sprite]
 * @returns {{id:string,name:string,subtitle:string,sprite:string,fallback:'shield',administrator:true}}
 */
export function administratorAppearance(sprite = null) {
  return {
    id: 'quest-admin',
    name: 'Administrator',
    subtitle: 'Game master',
    sprite: sprite || DEFAULT_ADMIN_SPRITE,
    fallback: 'shield',
    administrator: true,
  };
}
