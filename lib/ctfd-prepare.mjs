// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
import {unzipSync,zipSync,strToU8} from 'fflate';
import {ctfdTable} from './ctfd-table.mjs';
import {CTFD_SOURCE_ZIP_LIMIT,CTFD_UPLOAD_ZIP_LIMIT,CTFD_METADATA_LIMIT,IMAGE_FILE_LIMIT,CONTENT_PACK_LIMIT} from './pack-limits.mjs';
export const CTFD_PREPARATION_FILE = 'ctf-rpg-import.json';
export const ctfdUploadPath = location => String(location||'').replace(/^\/?(?:uploads|files)\//,'').split('?')[0];
const supported = new Set(['challenges','flags','hints','files','tags','users','teams','solutions']);
export function prepareCtfdArchive(bytes) {
  if (!bytes.length || bytes.length>CTFD_SOURCE_ZIP_LIMIT) throw Error('Choose a nonempty CTFd export ZIP up to 512 MB.');
  let metadataSize=0,count=0;
  const names=new Set(),sizes=new Map(),ignoredTables=new Set();
  const metadata=unzipSync(bytes,{filter:f=>{
    if (++count>10000 || names.has(f.name) || f.name.startsWith('/') || f.name.includes('\\') || f.name.includes('\0') || f.name.split('/').includes('..')) throw Error('Unsafe or duplicate export path.');
    names.add(f.name);sizes.set(f.name,f.originalSize);
    const match=/^db\/([^/]+)\.json$/.exec(f.name);
    if (!match || !supported.has(match[1])) { if(match)ignoredTables.add(match[1]);return false; }
    metadataSize+=f.originalSize;
    if(metadataSize>CTFD_METADATA_LIMIT)throw Error('Supported CTFd database tables exceed 16 MB. Split or reduce the export.');
    return true;
  }});
  if(!metadata['db/challenges.json'])throw Error('Missing CTFd table: challenges');
  const rows=name=>ctfdTable(metadata,name);
  const challenges=new Set(rows('challenges').map(c=>String(c.id)));
  const references=[...new Set(rows('files').filter(f=>challenges.has(String(f.challenge_id)) && !/^https:\/\//i.test(String(f.location))).map(f=>ctfdUploadPath(f.location)))].sort();
  const selected=new Set(),omittedFiles=[];let total=0;
  for(const path of references){
    const size=sizes.get('uploads/'+path);
    if(size===undefined)continue;
    let reason;
    if(size>IMAGE_FILE_LIMIT)reason='File exceeds the 4 MB per-attachment limit.';
    else if(total+size>CONTENT_PACK_LIMIT)reason='File would exceed the 8 MB total attachment limit.';
    if(reason){omittedFiles.push({path,reason});continue;}
    total+=size;selected.add('uploads/'+path);
  }
  // Only selected entries are decompressed. Large unused/history files stay in the source ZIP.
  const attachments=unzipSync(bytes,{filter:f=>selected.has(f.name)});
  const entries=Object.fromEntries([...Object.entries(metadata),...Object.entries(attachments)].sort(([a],[b])=>a<b?-1:a>b?1:0));
  entries[CTFD_PREPARATION_FILE]=strToU8(JSON.stringify({format:'prepared-ctfd',version:1,omittedFiles,ignoredTables:[...ignoredTables].sort()}));
  // Stable timestamps make preview/retry/import identity independent of when preparation runs.
  const result=zipSync(entries,{level:6,mtime:new Date(2000,0,1)});
  if(result.length>CTFD_UPLOAD_ZIP_LIMIT)throw Error('Prepared CTFd content exceeds the 64 MB upload limit. Split the export.');
  return result;
}
