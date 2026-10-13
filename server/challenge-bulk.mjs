// CTF-RPG — Copyright Jaime C Acosta 2026
export async function bulkChallengeVisibility(body,{db,current,themeRevision}) {
 const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
 const {ids,visibility}=body;
 if(!Array.isArray(ids)||!ids.length||ids.length>100||ids.some(id=>typeof id!=='string')||new Set(ids).size!==ids.length||!['visible','hidden'].includes(visibility))return reply({error:'Select 1–100 challenges and choose enabled or disabled.'},400);
 if(body.themeRevision!==themeRevision)return reply({error:'The theme changed. Reload before updating challenges.'},409);
 if(ids.some(id=>!current.challenges.some(c=>c.id===id)))return reply({error:'A selected challenge no longer exists. Reload the collection.'},409);
 const selected=new Set(ids),updated=current.challenges.map(c=>selected.has(c.id)?{...c,visibility}:c),payload=JSON.stringify(updated);
 if(new TextEncoder().encode(payload).byteLength>1500000)return reply({error:'The challenge set exceeds the 1.5 MB limit.'},400);
 const result=current.revision===0
  ?await db.prepare("INSERT OR IGNORE INTO challenge_catalog(id,payload,revision) SELECT 'active',?,1 WHERE COALESCE((SELECT revision FROM theme_catalog WHERE id='active'),0)=?").bind(payload,themeRevision).run()
  :await db.prepare("UPDATE challenge_catalog SET payload=?,revision=revision+1 WHERE id='active' AND revision=? AND COALESCE((SELECT revision FROM theme_catalog WHERE id='active'),0)=?").bind(payload,body.revision,themeRevision).run();
 if(Number(result.meta?.changes??result.changes)!==1)return reply({error:'Another administrator saved first. Reload the collection.'},409);
 return reply({challenges:updated,revision:current.revision+1,updated:ids.length});
}
