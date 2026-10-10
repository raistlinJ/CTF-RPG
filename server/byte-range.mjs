// Browsers use single byte ranges to seek in MP4/WebM videos.
export function byteRange(range, length) {
  const headers = { "Accept-Ranges": "bytes", "Content-Length": String(length) };
  if (!range) return { status: 200, headers, start: 0, end: length - 1 };
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match || (!match[1] && !match[2])) return { status: 416, headers: { "Content-Range": `bytes */${length}` } };
  const start = match[1] ? Number(match[1]) : Math.max(0, length - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), length - 1) : length - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= length || end < start)
    return { status: 416, headers: { "Content-Range": `bytes */${length}` } };
  return { status: 206, start, end, headers: { ...headers, "Content-Length": String(end - start + 1), "Content-Range": `bytes ${start}-${end}/${length}` } };
}
