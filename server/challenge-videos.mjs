import { assertAsset, assetTypes } from "./packs.mjs";

export async function handleChallengeVideoUpload(req, { user, platformAdmin, assetStore }) {
  const reply = (data, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
  const u = await user(req);
  if (!platformAdmin && u?.role !== "admin") return reply({ error: "Administrator access required." }, u ? 403 : 401);
  if (req.method !== "POST") return reply({ error: "Method not allowed." }, 405);
  try {
    const ext = new URL(req.url).searchParams.get("type");
    if (!["mp4", "webm"].includes(ext)) throw Error("Choose an MP4 or WebM video.");
    const limit = 4 * 1024 * 1024;
    if (Number(req.headers.get("content-length")) > limit) throw Error("Videos must be at most 4 MB. Use a hosted video URL for larger files.");
    const reader = req.body?.getReader();
    if (!reader) throw Error("Choose a video file.");
    const chunks = [];
    let length = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > limit) {
        await reader.cancel();
        throw Error("Videos must be at most 4 MB. Use a hosted video URL for larger files.");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    assertAsset(bytes, ext);
    if (!assetStore) throw Error("Video storage is unavailable.");
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), b => b.toString(16).padStart(2, "0")).join("");
    const key = `${digest}.${ext}`;
    await assetStore.put(key, bytes, assetTypes[ext]);
    return reply({ url: `/api/assets/${key}` });
  } catch (error) {
    return reply({ error: error.message || "The video could not be uploaded." }, 400);
  }
}
