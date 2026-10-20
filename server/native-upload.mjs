import {mkdtemp, rm} from 'node:fs/promises';
import {createReadStream, createWriteStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {Transform, Readable} from 'node:stream';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

// Disk-backed ingress avoids retaining a second full multipart request in RAM.
// Handlers still enforce per-file validation and their existing total budgets.
export async function spoolUpload(request, limit, temporaryRoot=tmpdir()) {
  const folder=await mkdtemp(join(temporaryRoot,'ctf-upload-'));
  const path=join(folder,'body');
  let length=0;
  const cleanup=()=>rm(folder,{recursive:true,force:true});
  try {
    const counter=new Transform({transform(chunk,encoding,callback){
      length+=chunk.length;
      if(length>limit) {const error=new Error('Upload exceeds the request limit.');error.status=413;callback(error);}
      else callback(null,chunk);
    }});
    // Do not destroy IncomingMessage on a rejected upload before sending JSON.
    const disconnected=()=>counter.destroy(Error('Upload interrupted.'));
    const errored=error=>counter.destroy(error);
    request.once('aborted',disconnected);request.once('error',errored);
    request.once('close',()=>{request.off('aborted',disconnected);request.off('error',errored);});
    request.pipe(counter);
    await pipeline(counter,createWriteStream(path,{flags:'wx',mode:0o600}));
    const input=createReadStream(path);
    return {body:Readable.toWeb(input),async cleanup(){input.destroy();await cleanup();}};
  } catch(error) {request.unpipe();request.resume();await cleanup();throw error;}
}
