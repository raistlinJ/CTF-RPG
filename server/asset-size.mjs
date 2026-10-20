import {readAsset, assetKeyPattern} from './packs.mjs';
// Immutable objects can be checked without reading their contents into memory.
export async function assetSize(path, store, readBaseAsset) {
  if (path.startsWith('/api/assets/')) {
    const key=path.slice('/api/assets/'.length);
    if (!assetKeyPattern.test(key)) return null;
    if (store?.stat) return (await store.stat(key))?.size ?? null;
  } else if (readBaseAsset?.stat) return (await readBaseAsset.stat(path))?.size ?? null;
  return (await readAsset(path,store,readBaseAsset))?.length ?? null;
}
