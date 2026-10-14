// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
import {strFromU8} from 'fflate';

export function ctfdTable(entries, name, required = false) {
  const bytes = entries['db/' + name + '.json'];
  if (!bytes) {
    if (required) throw Error('Missing CTFd table: ' + name);
    return [];
  }
  // CTFd exports can represent a table with no records as a zero-byte file.
  const text = strFromU8(bytes).trim();
  if (!text) return [];
  let value;
  try { value = JSON.parse(text); }
  catch { throw Error('Invalid CTFd table JSON: ' + name); }
  const rows = Array.isArray(value) ? value : value?.results;
  if (!Array.isArray(rows) || rows.length > 10000 || rows.some(row => !row || typeof row !== 'object' || Array.isArray(row)))
    throw Error('Invalid CTFd table: ' + name);
  return rows;
}
