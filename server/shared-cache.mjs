// Only shared aggregates belong here. Authentication, visibility, mute rules, and
// individual progress are always checked against the database for each request.
const databases = new WeakMap();
export function invalidateSharedCache(db) { databases.delete(db); }
export async function sharedAggregate(db, key, load, ttl = 2000) {
  let entries = databases.get(db);
  if (!entries) { entries = new Map(); databases.set(db, entries); }
  const existing = entries.get(key);
  if (existing && existing.expires > Date.now()) return existing.value;
  if (entries.size >= 128) entries.delete(entries.keys().next().value);
  const entry = {expires: Date.now() + ttl, value: Promise.resolve().then(load)};
  entries.set(key, entry);
  try { return await entry.value; }
  catch (error) { if (entries.get(key) === entry) entries.delete(key); throw error; }
}
