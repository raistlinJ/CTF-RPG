// Shared by the native HTTP server and browser entry point. Keep page URLs
// exact so unknown paths cannot expose private files or open the wrong editor.
export const PAGE_ROUTES = Object.freeze(/** @type {const} */ ({
  '/': 'game',
  '/scoreboard': 'scoreboard',
  '/admin': 'admin',
  '/admin/challenges/dependencies': 'dependencies',
  '/admin/challenges/submissions': 'submissions',
  '/admin/challenges/review': 'review',
  '/admin/data': 'data',
  '/admin/data/ctfd': 'ctfd',
  '/admin/theme': 'maps',
  '/admin/theme/maps': 'maps',
  '/admin/theme/maps/dialogue': 'dialogue',
  '/admin/theme/appearances': 'appearances',
  '/admin/theme/media': 'media',
  '/admin/theme/sounds': 'sounds',
  '/admin/theme/library': 'library',
  '/admin/teams': 'teams',
  '/admin/teams/configuration': 'team-configuration',
  '/admin/teams/players': 'players',
  '/admin/teams/scoreboard': 'scoreboard-settings',
  '/admin/users': 'users',
  '/admin/users/details': 'user-details',
  '/admin/notifications': 'notifications',
  '/admin/social': 'notifications',
  '/admin/social/notifications': 'notifications',
  '/admin/social/chats': 'chats',
}));

/**
 * @param {string} pathname
 * @returns {(typeof PAGE_ROUTES)[keyof typeof PAGE_ROUTES] | null}
 */
export function pageRoute(pathname) {
  const path = pathname.length > 1 ? pathname.replace(/\/$/,'') : pathname;
  return Object.hasOwn(PAGE_ROUTES,path) ? PAGE_ROUTES[path] : null;
}
