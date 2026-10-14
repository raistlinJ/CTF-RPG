// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
export async function readCtfdImportResponse(response, applying=false) {
  const status=response.status;
  const uncertain=applying?' The import may still be running or may have completed; check Users and Challenges before retrying.':'';
  let text;
  try{text=await response.text();}catch{throw Error('The connection ended before the CTFd import result arrived.'+uncertain);}
  let data;try{data=JSON.parse(text);}catch{}
  if(!response.ok){
    if(typeof data?.error==='string'&&data.error.trim())throw Error(data.error);
    if(status===413)throw Error('The CTFd upload was rejected as too large. Use the web importer to prepare exports up to 512 MB; the prepared upload must fit within 64 MB. Check any additional proxy upload limits.');
    if(status===408||status===504)throw Error(`The CTFd import request timed out (HTTP ${status}). Check the application and proxy logs.`+uncertain);
    if(status===401||status===403)throw Error('Administrator access is required. Sign in again, then retry the CTFd preview.');
    if(status===404)throw Error('The CTFd import endpoint was not found. Pull the latest code and rebuild the application.');
    throw Error(`The CTFd import failed (HTTP ${status}). Check the application and proxy logs.`+uncertain);
  }
  if(!data||typeof data!=='object'||Array.isArray(data))throw Error('The CTFd importer returned an empty or non-JSON response. Check the application and proxy logs.'+uncertain);
  if(typeof data.error==='string')throw Error(data.error);
  const r=data.report;
  if(!r||!['challenges','users','teams','warnings','excluded'].every(key=>Array.isArray(r[key]))||!Number.isInteger(r.themeRevision)||!Number.isInteger(r.contentRevision)||typeof r.fingerprint!=='string'||!Number.isFinite(r.currentMax)||!Number.isFinite(r.requiredMax)||!(data.preview||data.imported||data.alreadyImported))throw Error('The CTFd importer returned an incomplete result. Check the application logs.'+uncertain);
  if(r.omittedAttachments!==undefined&&!Array.isArray(r.omittedAttachments))throw Error('The CTFd importer returned invalid attachment details.');
  return data;
}
