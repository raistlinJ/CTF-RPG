export async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: new TextEncoder().encode(salt),
      iterations: 100000,
      hash: "SHA-256",
    },
    key,
    256,
  );
  return Array.from(new Uint8Array(bits), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
}
export function equal(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++)
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}
export async function configuredCredentials(cfg, row) {
  if (cfg.passwordHash) return { hash: cfg.passwordHash, salt: cfg.salt };
  const salt = row?.salt || crypto.randomUUID();
  return { hash: await passwordHash(cfg.password, salt), salt };
}
export function effectiveAccount(row, cfg, config) {
  return {
    id: row?.id || null,
    username: row?.username || cfg.username,
    hero: row?.managed
      ? row.hero
      : cfg?.hero || row?.hero || config.characters[0].id,
    role: row?.managed ? row.role : cfg?.role || "student",
    spawn: row?.managed
      ? row.spawn
        ? JSON.parse(row.spawn)
        : null
      : cfg?.spawn || null,
    disabled: !!row?.disabled,
    muted: !!row?.muted,
    revision: row?.revision || 0,
    source: row?.managed ? "studio" : cfg ? "yaml" : "registration",
    provisioned: !!row?.provisioned,
  };
}
