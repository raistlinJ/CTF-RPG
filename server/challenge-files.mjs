import {CHALLENGE_FILE_LIMIT} from '../lib/pack-limits.mjs';
const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});

export async function handleChallengeFileUpload(req,{user,platformAdmin,assetStore}) {
  const account=await user(req);
  if(!platformAdmin&&account?.role!=='admin')return reply({error:'Administrator access required.'},account?403:401);
  if(req.method!=='POST')return reply({error:'Method not allowed.'},405);
  const rawName=new URL(req.url).searchParams.get('name');
  if(!rawName||rawName.length>1024)return reply({error:'Provide a file name.'},400);
  const name=rawName.split(/[\\/]/).at(-1).replace(/[\x00-\x1f\x7f]/g,'').trim().slice(0,200);
  if(!name||name==='.'||name==='..')return reply({error:'Provide a valid file name.'},400);
  const filename=name.replace(/[^a-zA-Z0-9_.-]/g,'_').replace(/^\.+/,'')||'challenge-file';
  const tooLarge=()=>reply({error:'Challenge files must be at most 4 MB. Use a hosted file link for larger files.'},413);
  if(Number(req.headers.get('content-length'))>CHALLENGE_FILE_LIMIT)return tooLarge();
  if(!assetStore)return reply({error:'File storage is unavailable.'},503);
  const reader=req.body?.getReader();
  if(!reader)return reply({error:'Choose a file to upload.'},400);
  const chunks=[];let size=0;
  try {
    for(;;){
      const {value,done}=await reader.read();if(done)break;
      size+=value.length;
      if(size>CHALLENGE_FILE_LIMIT){await reader.cancel().catch(()=>{});return tooLarge();}
      chunks.push(value);
    }
  }catch{return reply({error:'The file upload was interrupted. Please retry.'},400);}
  if(!size)return reply({error:'Choose a nonempty file to upload.'},400);
  const bytes=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  try {
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
    // Every challenge attachment is an opaque download, including HTML, scripts,
    // packet captures, and unfamiliar extensions. Never serve uploads as pages.
    const key=digest+'.bin';
    await assetStore.put(key,bytes,'application/octet-stream');
    return reply({name,filename,url:'/api/assets/'+key,size});
  }catch{return reply({error:'The file could not be stored. Please retry.'},503);}
}
