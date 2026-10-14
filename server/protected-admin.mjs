// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
import { requireStartupAdmin } from '../lib/config-schema.mjs';
import { passwordHash } from './passwords.mjs';

// Environment credentials are used only to create a missing administrator.
// Existing credentials, character choices and progress remain authoritative.
export async function ensureStartupAdmin(db, config, password) {
  const username = requireStartupAdmin(config);
  const existing = await db.prepare('SELECT id FROM students WHERE username=?').bind(username).first();
  if (!existing) {
    if (typeof password !== 'string' || password.length < 8 || password.length > 128)
      throw Error('Set ADMIN_PASSWORD in the project root .env to 8–128 characters to create the protected administrator.');
    const salt = crypto.randomUUID();
    await db.prepare("INSERT OR IGNORE INTO students(id,username,hash,salt,hero,role,managed,provisioned,hero_selected) VALUES(?,?,?,?,?,'admin',1,1,0)")
      .bind(crypto.randomUUID(), username, await passwordHash(password, salt), salt, config.characters[0].id).run();
  }
  await db.batch([
    db.prepare('DELETE FROM deleted_accounts WHERE username=?').bind(username),
    db.prepare("UPDATE students SET role='admin',disabled=0,provisioned=1,managed=1,revision=revision+1 WHERE username=? AND (role<>'admin' OR disabled<>0 OR provisioned<>1 OR managed<>1)").bind(username),
  ]);
}
