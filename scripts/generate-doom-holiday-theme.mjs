// Doom's Winter Dominion: authored theme and optional practice CTF adventure.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';
import { SOUND_EVENTS } from '../lib/sound-events.mjs';
import { DEFAULT_ADMIN_SPRITE } from '../lib/administrator-appearance.mjs';
import { expansionMaps, expansionGround, expansionCast } from './doom-holiday-expansion-layouts.mjs';
import { pathMaps, pathTransports } from './doom-holiday-path-maps.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const folder=resolve(root,'themes/doom-holiday'),assets='/themes/doom-holiday';
mkdirSync(folder,{recursive:true});
const write=(name,data)=>writeFileSync(resolve(folder,name),JSON.stringify(data,null,2)+'\n');
const roster=[
 ['web','Winter Courier','winter-courier','Deliver hope through the snowbound streets of Latveria.','web','both'],
 ['thunder','Thor','thor','Thunder, snow, and a hammer fit for a winter rescue.','thunder','both'],
 ['shield','Winter Guard Captain','winter-guard-captain','Bring the team together. Bring the holidays home.','shield','both'],
 ['aurora-engineer','Aurora Engineer','aurora-engineer','A winter reactor expert with a gift for debugging.','thunder','both'],
 ['lantern-warden','Lantern Warden','lantern-warden','Keep the vault lanterns lit through the longest night.','shield','both'],
 ['ribbon-weaver','Ribbon Weaver','ribbon-weaver','Tie every clue together with a little holiday craft.','web','both'],
 ['doctor-strange','Doctor Strange','doctor-strange','Every snowglobe holds a different possibility.','web','both'],
 ['radio-archivist','Radio Archivist','radio-archivist','Every dispatch deserves a careful reading.','thunder','both'],
 ['snowglobe-keeper','Snowglobe Keeper','snowglobe-keeper','A keeper of glass worlds and hidden gifts.','shield','both'],
 ['hearth-tender','Hearth Tender','hearth-tender','Warm cocoa and good clues from the hearth.','thunder','both'],
 ['gift-hauler','Gift Hauler','gift-hauler','A wooden clockwork helper with a gift for heavy lifting.','shield','both'],
 ['squirrel-girl','Squirrel Girl','squirrel-girl','No holiday mystery is too tough to crack.','web','both'],
 ['doctor-doom','Doctor Doom','doctor-doom','Doom has declared the holidays under new management.','shield','entity'],
 ['santa-claus','Santa Claus','santa-claus','The Holiday Star belongs to everyone.','shield','entity'],
 ['doombot','Holiday Doombot','doombot','Parcel processing, perfectly wrapped.','thunder','entity'],
];
const characters=roster.map(([id,name,image,subtitle,fallback,appearanceFor])=>({id,name,subtitle,sprite:`${assets}/sprites/${image}.webp`,fallback,appearanceFor}));
const locations=[
 ['town','Doomstadt Winter Square','doomstadt-square','#536878','winter-dominion.mid'],
 ['castle','Castle Doom: The Holiday Throne','castle-doom','#243e39','iron-and-mistletoe.mid'],
 ['toy-workshop','Doombot Gift Foundry','gift-foundry','#394a48','iron-and-mistletoe.mid'],
 ['cocoa-cottage','Snowglobe Sanctum','snowglobe-sanctum','#343d59','winter-dominion.mid'],
 ['post-office','Sleigh Signal Relay','sleigh-relay','#3a5263','winter-dominion.mid'],
 ['elf-house','Aurora Reactor Vault','aurora-vault','#233d36','iron-and-mistletoe.mid'],
 ['bakery','The Holiday Truce Hall','truce-banquet','#6a493a','holiday-truce.mid'],
];
const maps=locations.map(([id,name,image,floor,track])=>({id,name,bounds:{left:2,right:37,top:3,bottom:24},spawn:{x:20,y:23},exit:null,background:`${assets}/maps/${image}.webp`,floor,wall:'#101d24',obstacles:[],music:`${assets}/audio/${track}`}));
maps.push(...[...expansionMaps,...pathMaps].map(map=>({id:map.id,name:map.name,bounds:{left:1,right:38,top:1,bottom:26},spawn:map.spawn||{x:20,y:23},exit:null,background:`${assets}/maps/${map.image}.webp`,floor:map.floor,wall:'#101d24',obstacles:[],ground:expansionGround(map.collision||map),music:`${assets}/audio/${map.music}`})));
characters.push(...expansionCast.map(character=>({id:character.id,name:character.name,subtitle:character.subtitle,sprite:`${assets}/sprites/${character.id}.webp`,fallback:character.role==='hero'?'web':'shield',appearanceFor:character.role==='hero'?'both':'entity'})));
const destinations=[['foundry-route','toy-workshop',6,6],['relay-route','post-office',12,6],['throne-route','castle',20,4],['sanctum-route','cocoa-cottage',28,6],['vault-route','elf-house',34,12],['banquet-route','bakery',28,21]];
const transports=destinations.map(([id,to,x,y])=>({id,map:'town',location:{x,y},to}));
transports.push(
 {id:'office-route',map:'town',location:{x:3,y:13},to:'latverian-offices'},
 {id:'office-orbit-lift',map:'latverian-offices',location:{x:20,y:3},to:'orbital-station'},
 {id:'orbital-castle-airlock',map:'orbital-station',location:{x:20,y:3},to:'castle-corridors'},
 ...pathTransports,
);
function npc(id,characterId,map,x,y,greeting,advice){
 const name=characters.find(c=>c.id===characterId).name;
 return {id:`dh-${id}`,name,characterId,map,location:{x,y},size:1,startNode:'welcome',nodes:[
  {id:'welcome',text:greeting,choices:[{id:'help',label:'What should I investigate?',to:'briefing'},{id:'holiday',label:'Any holiday advice?',to:'holiday'}]},
  {id:'briefing',text:advice,choices:[]},
  {id:'holiday',text:'Work together, keep notes, and verify what you find. Search near a challenge marker to open it. Emoji reactions are always available, even when a character has no secret reply.',choices:[{id:'back',label:'Back to the briefing',to:'welcome'}]},
 ]};
}
const entities=[
 npc('spider','web','town',18,22,'Happy holidays! Doom has commandeered the Holiday Star. This is our chance to get it back without ruining the party.','Winter Guard Captain is at (25,19). Ask what to investigate, then examine the winter signal at (18,20). Glowing transport tiles connect the square to the six rooms; return to a room’s arrival tile to come back.'),
 npc('captain','shield','town',25,19,'Doom has locked the sleigh network. We need clear evidence, careful teamwork, and a plan.','Begin at the signal marker in this square. Follow the files through the Gift Foundry and Sleigh Relay. A red key opens the Aurora Reactor Vault; the vault’s gold key opens Castle Doom. All flags use FLAG{...}.'),
 npc('squirrel','squirrel-girl','town',8,20,'I brought emergency acorns. Doom brought emergency legislation. Mine will be more useful.','There is an acorn audit at (23,17). A second rumor says a gift is buried at the square’s exact tile (15,21). Stand there and Search; try a friendly wave if you find anything.'),
 npc('reed','radio-archivist','post-office',8,9,'The sleigh receiver still works. Doom merely made the messages unnecessarily theatrical.','Read the dispatch headers, then reverse the mirrored message. These are static practice files: no external target, scanning, or live exploitation is required.'),
 npc('thor','thunder','post-office',29,10,'The storm has delayed the sleigh. It shall not delay our investigation.','A route hidden in a response header tells us where the sleigh should go. Read the whole file before guessing.'),
 npc('doombot','doombot','toy-workshop',10,10,'SEASONAL GREETING. PARCEL INTEGRITY IS A MATTER OF IMPERIAL PRIDE.','The gift terminal uses Base64. The parcel sentry’s diagnostic uses binary ASCII. Decode them carefully; one earns a red vault key.'),
 npc('torch','hearth-tender','toy-workshop',30,10,'There is a warm cup waiting for every tired gift-maker. Let us get this loading dock moving again.','Base64 often ends in one or two equals signs. A free hint explains how to decode the gift terminal without needing a live website.'),
 npc('thing','gift-hauler','toy-workshop',30,19,'My wooden gears can move a mountain of presents. You handle the tiny numbers on the labels.','Eight binary digits describe one ASCII character. Put the characters together in the order printed by the sentry.'),
 npc('strange','doctor-strange','cocoa-cottage',20,6,'Seven snowglobes. Seven possibilities. Doom chose the one with the worst holiday music.','A Caesar shift replaces letters by a fixed number of positions. Undo a shift of three to recover the snowglobe’s message.'),
 npc('wanda','ribbon-weaver','cocoa-cottage',29,10,'The ornaments remember every message, including the ones Doom tried to disguise.','Percent escapes such as %7B represent characters in a URL. Decode the ornament inscription once; leave the flag’s punctuation intact.'),
 npc('sue','snowglobe-keeper','cocoa-cottage',9,10,'I catalog every snowglobe in this library. The invisible gift, however, keeps disappearing from the catalog.','A hidden gift in the square has a secret greeting. Discover it and wave to reveal the Secret Santa challenge here. The hidden item is found only from its exact anchor tile.'),
 npc('tony','aurora-engineer','elf-house',9,10,'Doom wired the reactor into the holiday lights. Excessive? Yes. A troubleshooting opportunity? Also yes.','Convert the power display from binary to decimal. The gold key it releases opens the northern throne route in Doomstadt.'),
 npc('panther','lantern-warden','elf-house',30,10,'The vault watches for impatience. Slow down and read the color values.','In #RRGGBB, the first pair is red, the second green, and the third blue. The sentinel’s strongest channel names the flag.'),
 npc('doom','doctor-doom','castle',20,6,'The holidays require coordination. Doom has generously appointed himself the coordinator.','You have the files, the fragments, and the evidence. Assemble the final words. Doom will accept a correctly formatted answer, even from an inconveniently competent team.'),
 npc('santa','santa-claus','bakery',20,9,'There you are! The cocoa is still warm, and the Holiday Star is waiting for the signal.','After the throne puzzle, restore the sleigh’s final dispatch here. Then write a brief team debrief. Keep any real assessment answers separate from these public practice flags.'),
];
entities.find(e=>e.id==='dh-doom').size=3;
entities.find(e=>e.id==='dh-doom').emojiInteractions=[{emoji:'😮',response:'Astonishment is an appropriate response to Doom’s festive efficiency.',effect:'fireworks',once:false,outputNodeId:null}];
entities.find(e=>e.id==='dh-santa').emojiInteractions=[{emoji:'👋',response:'A little kindness is the brightest signal of all. Happy holidays!',effect:'hearts',once:false,outputNodeId:null}];
entities.find(e=>e.id==='dh-doombot').emojiInteractions=[{emoji:'👍',response:'POSITIVE FEEDBACK RECEIVED. GIFT-WRAPPING MORALE INCREASED.',effect:'sparkles',once:true,outputNodeId:null}];
entities.push({id:'dh-hidden-gift',name:'The Invisible Gift',characterId:'doombot',map:'town',location:{x:15,y:21},size:1,invisible:true,startNode:'found',nodes:[
 {id:'found',text:'A ribbon rustles beneath your boots. You found a gift with no visible wrapping. The tag asks for a friendly wave.',choices:[]},
 {id:'cache-found',text:'The tag unfolds: FLAG{SECRET_SANTA}. A Secret Santa marker is now available in the Snowglobe Sanctum at (12,18).',choices:[]},
],emojiInteractions:[{emoji:'👋',response:'The invisible tag reads FLAG{SECRET_SANTA}. Search the newly revealed Secret Santa marker in Snowglobe Sanctum at (12,18).',effect:'sparkles',once:true,outputNodeId:'cache-found'}]});
entities.push(...expansionCast.map(character=>npc(character.id,character.id,character.map,character.x,character.y,character.greeting,character.advice)));
const sounds={clips:SOUND_EVENTS.map(({id,label})=>({name:label,src:`${assets}/audio/sounds/${id}.wav`,source:'theme'})),maps:Object.fromEntries(maps.map(m=>[m.id,`${assets}/audio/sounds/mapEntry.wav`])),events:Object.fromEntries(SOUND_EVENTS.map(({id})=>[id,`${assets}/audio/sounds/${id}.wav`]))};
if(!sounds.clips.some(c=>c.src.endsWith('/mapEntry.wav')))sounds.clips.push({name:'Map entry',src:`${assets}/audio/sounds/mapEntry.wav`,source:'theme'});
const theme={format:'quest-theme',version:1,title:"Doom’s Winter Dominion",badge:'snowflake',description:'A Marvel holiday CTF in snowbound Latveria: 25 character appearances, seventeen distinct maps, Doombots, hidden gifts, and an optional 15-challenge rescue of the Holiday Star.',world:{startMap:'town',renderer:'tiles',maps,buildings:[],trees:[],transports,portalOverrides:[],entities},characters,audio:{midi:`${assets}/audio/winter-dominion.mid`,loop:true,volume:.1,playlist:[{name:'Winter Dominion',midi:`${assets}/audio/winter-dominion.mid`},{name:'Iron and Mistletoe',midi:`${assets}/audio/iron-and-mistletoe.mid`},{name:'The Holiday Truce',midi:`${assets}/audio/holiday-truce.mid`}]},sounds,adminSprite:DEFAULT_ADMIN_SPRITE,bosses:[{id:'boss-holiday-doombot',label:'Parcel Sentry'},{id:'boss-aurora-sentinel',label:'Aurora Sentinel'},{id:'boss-doctor-doom',label:'Doctor Doom'}],bossSprites:{'boss-holiday-doombot':`${assets}/bosses/parcel-sentry.webp`,'boss-aurora-sentinel':`${assets}/bosses/aurora-sentinel.webp`,'boss-doctor-doom':`${assets}/bosses/doctor-doom.webp`},media:[]};
const demo=structuredClone(theme);
// In the adventure Doom appears as the final encounter; the reusable world keeps his dialogue NPE.
demo.world.entities=demo.world.entities.filter(entity=>entity.id!=='dh-doom');
const reusableGift=theme.world.entities.find(e=>e.id==='dh-hidden-gift');
reusableGift.nodes.find(node=>node.id==='cache-found').text='The invisible gift opens with a shower of festive sparks. You found a secret holiday greeting!';
reusableGift.emojiInteractions[0].response='You found the invisible gift. A friendly wave is all it takes to share a little holiday cheer.';
for(const t of demo.world.transports){if(t.id==='vault-route')t.lock={type:'key',color:'red'};if(t.id==='throne-route')t.lock={type:'key',color:'gold'};}
const baseId='dh-holiday-v1-';
const id=s=>baseId+s;
const region=map=>maps.find(m=>m.id===map).name;
const download=(name,path)=>({name,url:`/downloads/doom-holiday/${path}`,filename:path});
const make=(key,map,x,y,title,text,flag,depends=[],extra={})=>({id:id(key),map,location:{x,y},object:title,region:region(map),text,grading:'automatic',visibility:'visible',icon:'star',iconSize:1,flags:[flag],caseSensitive:true,points:100,hints:[{id:`${key}-nudge`,label:'Free nudge',text:'Read the task carefully and preserve the exact FLAG{...} format.',cost:0}],downloads:[],dependsOn:depends.map(d=>d.startsWith('npe:')?d:id(d)),rewards:{keys:[],incantations:[]},...extra});
const challenges=[
 make('signal','town',18,20,'01 · The Winter Signal','Winter Guard Captain asks you to recover the opening signal. Decode this hexadecimal ASCII message, then submit the result exactly.\n\n`46 4c 41 47 7b 48 4f 4c 49 44 41 59 7d`\n\nThis is a local practice puzzle; no network target is involved.','FLAG{HOLIDAY}',['npe:dh-captain:briefing'],{hints:[{id:'signal-hex',label:'Hex to text',text:'Each two-digit hexadecimal number represents one ASCII character. For example, 46 is F and 4c is L.',cost:0}]}),
 make('manifest','town',11,18,'02 · The Misrouted Parcel','Download the gift manifest. Find the parcel whose destination is LATVERIA and whose status is MISROUTED. Submit the flag in that row.','FLAG{RETURN_TO_SENDER}',['signal'],{downloads:[download('Gift manifest (CSV)','gift-manifest.csv')]}),
 make('gift-code','toy-workshop',20,12,'03 · The Gift Terminal','Decode the Base64 string on the gift terminal:\n\n`RkxBR3tHSUZUX0ZPUkdFfQ==`\n\nA correct answer releases the **red key** for the Aurora Reactor Vault.','FLAG{GIFT_FORGE}',['signal'],{rewards:{keys:['red'],incantations:[]},hints:[{id:'gift-base64',label:'Decode Base64',text:'Use a local Base64 decoder. On macOS or Linux: printf %s RkxBR3tHSUZUX0ZPUkdFfQ== | base64 -d. The output is the complete flag.',cost:0}]}),
 make('parcel-sentry','toy-workshop',18,17,'04 · Parcel Sentry','The Doombot prints four binary ASCII bytes:\n\n`01000100 01001111 01001111 01001101`\n\nDecode the word and wrap it as `FLAG{WORD}`.','FLAG{DOOM}',['gift-code'],{icon:'boss',bossStyle:'boss-holiday-doombot',iconSize:1,points:150}),
 make('relay','post-office',20,12,'05 · Sleigh Route Header','Download the captured sleigh response. The `X-Holiday-Route` header contains the real route flag; the body contains a decoy. Submit the header value.','FLAG{NORTHBOUND}',['manifest'],{downloads:[download('Captured sleigh response','sleigh-response.txt')]}),
 make('mirror','post-office',24,17,'06 · The Archivist’s Mirrored Memo','Read the downloaded memo. Reverse the entire line under MIRRORED MESSAGE, preserving punctuation, to recover the flag.','FLAG{SILVER_BELLS}',['relay'],{downloads:[download('Mirrored memo','mirrored-memo.txt')]}),
 make('snowglobe','cocoa-cottage',20,13,'07 · Strange’s Snowglobe','The snowglobe uses a Caesar shift of **+3**. Undo the shift on letters only:\n\n`IODJ{ZLQWHU_VSDUN}`\n\nBraces and underscores remain unchanged.','FLAG{WINTER_SPARK}',['signal'],{hints:[{id:'snowglobe-shift',label:'Shift backwards',text:'Move each letter three places backwards: I becomes F, O becomes L, D becomes A, and J becomes G.',cost:0}]}),
 make('ornament','cocoa-cottage',26,17,'08 · The Ribbon Weaver’s Encoded Ornament','The ornament inscription is URL-encoded:\n\n`FLAG%7BCRIMSON_STAR%7D`\n\nDecode it once to recover the complete flag.','FLAG{CRIMSON_STAR}',['snowglobe']),
 make('secret-santa','cocoa-cottage',12,18,'09 · The Invisible Gift','The hidden gift’s friendly wave revealed a flag. Submit the exact flag printed on its tag. Ask Squirrel Girl in Doomstadt if you need to find the gift again.','FLAG{SECRET_SANTA}',['npe:dh-hidden-gift:cache-found'],{points:125}),
 make('power','elf-house',20,12,'10 · Aurora Power Budget','The reactor reads `00011001` in binary. Convert it to decimal, then submit `FLAG{NUMBER_WATTS}`. For example, a reading of 3 would use FLAG{3_WATTS}.\n\nThis restores the **gold key** to Castle Doom.','FLAG{25_WATTS}',['gift-code','relay'],{rewards:{keys:['gold'],incantations:[]},points:125}),
 make('sentinel','elf-house',18,17,'11 · Aurora Sentinel','The sentinel’s RGB display reads `#00FF00`. Which color channel is at its maximum? Submit `FLAG{COLOR}` using uppercase letters.','FLAG{GREEN}',['power','ornament'],{icon:'boss',bossStyle:'boss-aurora-sentinel',iconSize:2,points:175}),
 make('doom','castle',19,12,'12 · Doom’s Holiday Decree','Doom’s final decree is split into three numbered records. Download the decree, put its records in numerical order, join the three words with underscores, and submit `FLAG{YOUR_WORDS}`.','FLAG{DOOM_NEEDS_FRIENDS}',['sentinel','parcel-sentry','mirror','secret-santa'],{icon:'boss',bossStyle:'boss-doctor-doom',iconSize:3,points:250,downloads:[download('Doom’s final decree','holiday-decree.txt')],rewards:{keys:['silver'],incantations:['let the holidays shine']}}),
 make('star','bakery',18,15,'13 · Restore the Holiday Star','Santa’s dispatch is ready. Download the final delivery note and submit the flag on its CONFIRMED line. The Holiday Star can shine again.','FLAG{JOY_RESTORED}',['doom'],{downloads:[download('Final delivery note','final-delivery.txt')],points:150}),
 make('debrief','bakery',25,18,'14 · The Holiday Truce','Write a short team debrief: describe one encoding you recognized, one piece of evidence you verified, and how your team handled a wrong answer. Your instructor reviews this response. Do not include passwords or other real credentials.',null,['star'],{grading:'manual',flags:[],caseSensitive:false,points:100}),
 make('acorn-audit','town',23,17,'15 · Squirrel Girl’s Acorn Audit','Optional side quest: download the acorn ledger and find the only entry with `verified=yes`. Submit the flag from that entry.','FLAG{NUTCRACKER}',[],{downloads:[download('Acorn ledger','acorn-ledger.txt')],points:75,rewards:{keys:['orange'],incantations:[]},hints:[{id:'acorn-free',label:'Free nudge',text:'Only one line ends with verified=yes. Read its flag field.',cost:0},{id:'acorn-answer',label:'Reveal answer (forfeits orange key)',text:'The verified line contains FLAG{NUTCRACKER}.',cost:10,rewardCost:{keys:['orange'],incantations:[]}}]}),
];
write('theme.json',theme);write('demo-theme.json',demo);
writeFileSync(resolve(folder,'demo-challenges.yaml'),'# Public practice adventure. Replace flags and IDs before a graded holiday event.\n'+stringify({challenges}));
write('demo-content.json',challenges);
const downloads={
 'gift-manifest.csv':'parcel,destination,status,flag\nA17,NORTH_POLE,DELIVERED,FLAG{DECOY_ONE}\nD25,LATVERIA,MISROUTED,FLAG{RETURN_TO_SENDER}\nB08,LATVERIA,DELIVERED,FLAG{DECOY_TWO}\n',
 'sleigh-response.txt':'HTTP/1.1 200 OK\nContent-Type: text/plain\nX-Holiday-Route: FLAG{NORTHBOUND}\nX-Sleigh-ID: RUDOLPH-25\n\nDoom’s dashboard suggests FLAG{WRONG_WAY}. Trust the specified header, not this decoy.\n',
 'mirrored-memo.txt':'RADIO ARCHIVIST — INTERCEPTED MEMO\nMIRRORED MESSAGE\n'+[...'FLAG{SILVER_BELLS}'].reverse().join('')+'\n',
 'holiday-decree.txt':'DOOM’S IMPERIAL HOLIDAY DECREE\nRecord 03: FRIENDS\nRecord 01: DOOM\nRecord 02: NEEDS\n\nPut the words in record-number order. Separate them with underscores inside FLAG{...}.\n',
 'final-delivery.txt':'NORTH POLE DELIVERY CONTROL\nStatus: Holiday Star restored\nCONFIRMED: FLAG{JOY_RESTORED}\nMessage: Even Latveria deserves a peaceful holiday.\n',
 'acorn-ledger.txt':'item=walnut flag=FLAG{WALNUT} verified=no\nitem=acorn flag=FLAG{NUTCRACKER} verified=yes\nitem=chestnut flag=FLAG{CHESTNUT} verified=no\n',
};
const downloadsFolder=resolve(root,'public/downloads/doom-holiday');mkdirSync(downloadsFolder,{recursive:true});
for(const[name,text]of Object.entries(downloads))writeFileSync(resolve(downloadsFolder,name),text);
// Keep authoring and generated copies deterministic and separate from live state.
console.log(`Authored ${characters.length} appearances, ${maps.length} maps, ${entities.length} NPEs, ${challenges.length} challenges.`);
