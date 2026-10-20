// Native SQLite can accelerate literal substring searches with FTS5 trigrams.
// Hosted adapters, short queries, and non-ASCII queries retain the exact scan.
export function initializeChatSearch(sqlite) {
  sqlite.exec('SAVEPOINT chat_search_install');
  try {
    for (const table of ['team_messages','instructor_messages']) {
      const index=table+'_search';
      const exists=sqlite.prepare('SELECT 1 FROM sqlite_master WHERE name=?').get(index);
      sqlite.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS ${index} USING fts5(sender,text,content='${table}',content_rowid='rowid',tokenize='trigram');
        CREATE TRIGGER IF NOT EXISTS ${index}_insert AFTER INSERT ON ${table} BEGIN INSERT INTO ${index}(rowid,sender,text) VALUES(new.rowid,new.sender,new.text); END;
        CREATE TRIGGER IF NOT EXISTS ${index}_delete AFTER DELETE ON ${table} BEGIN INSERT INTO ${index}(${index},rowid,sender,text) VALUES('delete',old.rowid,old.sender,old.text); END;
        CREATE TRIGGER IF NOT EXISTS ${index}_update AFTER UPDATE OF sender,text ON ${table} BEGIN
          INSERT INTO ${index}(${index},rowid,sender,text) VALUES('delete',old.rowid,old.sender,old.text);
          INSERT INTO ${index}(rowid,sender,text) VALUES(new.rowid,new.sender,new.text); END;`);
      if(!exists)sqlite.prepare(`INSERT INTO ${index}(${index}) VALUES('rebuild')`).run();
    }
    sqlite.exec('RELEASE chat_search_install');
  } catch(error) {
    sqlite.exec('ROLLBACK TO chat_search_install; RELEASE chat_search_install');
    if(!/no such module: fts5|error in tokenizer constructor|no such tokenizer/i.test(error.message))throw error;
  }
}
export function searchCandidates(kind, query, enabled) {
  if(!enabled || query.length<3 || /[^\x20-\x7e]/.test(query))return null;
  const table=kind==='team'?'team_messages':'instructor_messages', index=table+'_search';
  if(kind==='instructor' && 'instructors'.includes(query.toLowerCase()))return null;
  const parts=[`SELECT rowid FROM ${index} WHERE ${index} MATCH ?`,
    `SELECT rowid FROM ${table} WHERE sender_user IN (SELECT id FROM students WHERE instr(lower(username),lower(?))>0)`];
  const args=['"'+query.replaceAll('"','""')+'"',query];
  for(const column of kind==='team'?['sender_team','recipient_team']:['team']) {
    parts.push(`SELECT rowid FROM ${table} WHERE ${column} IN (SELECT id FROM teams WHERE instr(lower(name),lower(?))>0)`);args.push(query);
  }
  if(kind==='team' && 'instructors'.includes(query.toLowerCase()))parts.push(`SELECT rowid FROM ${table} WHERE sender_team IS NULL`);
  return {sql:`m.rowid IN (${parts.join(' UNION ')})`,args};
}
