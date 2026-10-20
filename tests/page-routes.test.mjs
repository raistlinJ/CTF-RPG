import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync} from 'node:fs';
import {PAGE_ROUTES,pageRoute} from '../lib/page-routes.mjs';

test('every static application page is registered for standalone navigation',()=>{
  const discovered=[];
  function visit(directory,segments=[]){
    for(const entry of readdirSync(directory,{withFileTypes:true})){
      if(entry.isDirectory())visit(directory+'/'+entry.name,[...segments,entry.name]);
      else if(entry.name==='page.tsx'&&!segments.some(part=>part.includes('['))){
        discovered.push('/'+segments.filter(part=>!part.startsWith('(')).join('/'));
      }
    }
  }
  visit('app');
  assert.deepEqual(Object.keys(PAGE_ROUTES).sort(),discovered.sort(),'Register each new page in lib/page-routes.mjs and the typed component map in selfhost/main.tsx.');
});

test('account editor routes remain distinct from the roster, including reloads and query links',()=>{
  assert.equal(pageRoute('/admin/users'),'users');
  for(const path of ['/admin/users/details','/admin/users/details/']){
    const url=new URL(path+'?user=alice','https://quest.test');
    assert.equal(pageRoute(url.pathname),'user-details');assert.equal(url.searchParams.get('user'),'alice');
  }
  for(const path of Object.keys(PAGE_ROUTES)){
    assert.ok(pageRoute(path));if(path!=='/')assert.equal(pageRoute(path+'/'),pageRoute(path));
  }
  for(const path of ['/admin/users/details/missing','/admin/users/detailsXYZ','/admin/unknown','/.env','/data/quest.sqlite','constructor','/__proto__'])assert.equal(pageRoute(path),null);
});
