// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
import { requireStartupAdmin } from '../lib/config-schema.mjs';

// Preserve credentials and progress while restoring the configured administrator's access.
export async function ensureStartupAdmin(db, config) {
  const username = requireStartupAdmin(config);
  await db.batch([
    db.prepare('DELETE FROM deleted_accounts WHERE username=?').bind(username),
    db.prepare("UPDATE students SET role='admin',disabled=0,provisioned=1,revision=revision+1 WHERE username=? AND (role<>'admin' OR disabled<>0 OR provisioned<>1)").bind(username),
  ]);
}
