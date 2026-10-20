// Explicit maintenance only. Preview is read-only; no background retention runs.
import {DatabaseSync} from 'node:sqlite';
import {openSync,writeSync,fsyncSync,closeSync,linkSync,unlinkSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
const flags=Object.fromEntries(process.argv.slice(2).map(arg=>{const [key,...value]=arg.replace(/^--/,'').split('=');return[key,value.join('=')];}));
if('help' in flags){console.log('node scripts/archive-social.mjs --database=/path/quest.sqlite --before=2026-01-01T00:00:00Z [--apply --archive=/path/social.jsonl]\nDefault: read-only counts. Apply during a maintenance window; archives messages, notifications, recipients and read records before deleting the archived history. Accounts, teams, scores and personal mute/clear settings are preserved.');process.exit(0);}
if(Object.keys(flags).some(key=>!['database','before','apply','archive'].includes(key)) || !flags.database || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(flags.before||''))throw Error('Provide --database and an explicit UTC --before timestamp. Use --help.');
if('apply' in flags && flags.apply!=='')throw Error('Use --apply without a value to explicitly apply retention.');
const before=Date.parse(flags.before),apply='apply' in flags;
if(!Number.isFinite(before)||before<0||before>Date.now() || new Date(before).toISOString().replace('.000Z','Z')!==flags.before.replace('.000Z','Z') || (apply&&!flags.archive))throw Error('Choose a past cutoff and, when applying, a new archive path.');
const db=new DatabaseSync(resolve(flags.database),{readOnly:!apply});
const tables={team_messages:'created_at<?',instructor_messages:'created_at<?',notification_reads:'notification IN (SELECT id FROM notifications WHERE created_at<?)',notification_recipients:'notification IN (SELECT id FROM notifications WHERE created_at<?)',notifications:'created_at<?'};
let transaction=false,fd,temporary;
try {
  db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=1000');
  if(apply){db.exec('BEGIN IMMEDIATE');transaction=true;}
  const counts=Object.fromEntries(Object.entries(tables).map(([table,where])=>[table,db.prepare(`SELECT COUNT(*) count FROM ${table} WHERE ${where}`).get(before).count]));
  if(apply) {
    const archive=resolve(flags.archive);temporary=archive+'.partial-'+crypto.randomUUID();fd=openSync(temporary,'wx',0o600);
    const write=value=>{const bytes=Buffer.from(JSON.stringify(value)+'\n');let at=0;while(at<bytes.length)at+=writeSync(fd,bytes,at,bytes.length-at);};
    write({format:'ctf-social-archive',version:1,before:flags.before,createdAt:new Date().toISOString(),counts});
    for(const [table,where] of Object.entries(tables))for(const row of db.prepare(`SELECT * FROM ${table} WHERE ${where}`).iterate(before))write({table,row});
    fsyncSync(fd);closeSync(fd);fd=undefined;
    // A complete durable archive must exist first. Never replace another archive.
    linkSync(temporary,archive);unlinkSync(temporary);temporary=undefined;
    const directory=openSync(dirname(archive),'r');try{fsyncSync(directory);}finally{closeSync(directory);}
    for(const [table,where] of Object.entries(tables))db.prepare(`DELETE FROM ${table} WHERE ${where}`).run(before);
    db.exec('COMMIT');transaction=false;
  }
  console.log(JSON.stringify({applied:apply,before:flags.before,counts,...apply?{archive:resolve(flags.archive)}:{}},null,2));
} finally {
  if(transaction)db.exec('ROLLBACK');
  if(fd!==undefined)closeSync(fd);
  if(temporary)try{unlinkSync(temporary);}catch{}
  db.close();
}
