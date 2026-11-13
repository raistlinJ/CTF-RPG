// Seven additional holiday maps. Rectangles describe traversable floors, not walls.
// Reference drawings and collision masks share the same 40×28 logical grid.
export const pathMaps = [
 {id:'royal-archives',name:'Castle Doom: The Royal Archives',image:'royal-archives-v1',floor:'#3c4543',music:'iron-and-mistletoe.mid',
  rooms:[[3,3,7,5],[30,3,7,5],[10,10,7,6],[29,18,8,5]],
  corridors:[[19,20,3,5],[4,20,32,3],[4,4,3,19],[4,4,32,3],[33,4,3,19],[12,12,24,3],[12,5,3,10],[22,13,3,9]],furniture:[[7,3,2,2],[30,3,2,2],[10,10,2,2],[34,18,2,2]],
  from:'castle-corridors',door:[20,4],probes:[[5,5],[35,5],[13,13],[32,21]],barriers:[[18,9],[9,17]],
  description:'A secret Latverian royal archive. Emerald carpets form a perimeter loop, an offset interior gallery, and crooked passages between tightly packed dark oak book stacks. Four small reading alcoves, brass lamps, snowy narrow windows, red holiday ribbons and silver Doom-mask reliefs. Bookshelves fill the dark NONWALKABLE islands between corridors. Reading desks occupy only the marked gold blocks. A visible upper-right doorway leads to the winter hedge maze.'},
 {id:'parcel-depot',name:'Doomstadt Parcel Depot',image:'parcel-depot-v1',floor:'#3a494e',music:'winter-dominion.mid',
  rooms:[[3,3,7,5],[30,3,7,5]],corridors:[[19,21,3,4],[4,4,32,3],[4,12,32,3],[4,21,32,3],[4,4,3,20],[13,4,3,20],[24,4,3,20],[33,4,3,20]],furniture:[[7,3,2,2],[30,3,2,2]],
  from:'latverian-offices',door:[3,12],probes:[[5,5],[35,5],[14,13],[25,22]],barriers:[[19,9],[19,18]],
  description:'A busy holiday parcel sorting depot inside a Latverian warehouse. Three horizontal cross aisles and four long vertical aisles weave between tall shelves of wrapped gifts, shipping crates and idle conveyor machinery. Upper corner loading booths, overhead warm work lamps, green iron supports, red ribbons and snowy loading windows. All crates, racks and conveyor belts belong in the dark solid islands between the blue paths. Floors are empty clear gray flagstones. Upper-right freight hatch leads to the service tunnels.'},
 {id:'service-tunnels',name:'Latverian Service Tunnels',image:'service-tunnels-v1',floor:'#3c4950',music:'iron-and-mistletoe.mid',
  rooms:[[3,3,7,5],[29,3,8,5],[3,18,7,5],[25,11,7,5]],
  corridors:[[19,19,3,6],[4,19,31,3],[4,13,3,9],[4,13,26,3],[27,7,3,9],[4,7,26,3],[4,4,3,6],[4,4,32,3],[33,4,3,18]],furniture:[[7,3,2,2],[30,3,2,2],[3,18,2,2],[25,11,2,2]],
  from:'parcel-depot',door:[35,5],probes:[[5,5],[34,5],[5,20],[28,14]],barriers:[[19,11],[15,17]],
  description:'An intricate underground maintenance network beneath Castle Doom. Zigzag stone service passages turn left then right around solid rock and pipe chambers; a narrow eastern bypass creates a second route. Copper steam pipes, green-lit cable conduits, frosted grates and tiny red holiday bulbs on walls. Four utility alcoves; machinery occupies only gold blocks and dark areas. Clear blue-gray walking floor, shallow cutaway stone wall fronts. The upper-left hatch opens toward the frozen canals.'},
 {id:'frozen-canals',name:'Doomstadt Frozen Canals',image:'frozen-canals-v1',floor:'#627680',music:'winter-dominion.mid',
  rooms:[[5,3,7,5],[29,18,8,5]],corridors:[[19,19,3,6],[8,19,27,3],[8,4,3,18],[8,4,27,3],[32,4,3,18],[8,12,27,3],[19,4,3,11]],furniture:[[5,3,2,2],[35,18,2,2]],
  from:'service-tunnels',door:[5,5],probes:[[9,5],[33,5],[20,13],[33,20]],barriers:[[15,17],[25,8]],
  description:'A winter canal district in snowbound Doomstadt. Narrow snowy stone towpaths follow a squared river loop. A long east-west footbridge crosses the center; a north-south bridge reaches a tiny central island and joins it. Icy dark blue water fills ALL nonwalkable islands, with reflected emerald lanterns. Small market booths, warm street lamps, gifts and snow-covered iron railings only outside the clear paths or in gold blocks. Bridges must align exactly with the reference corridors. No skating across the water. Low railings and short stone wall faces add cutaway depth.'},
 {id:'winter-hedge-maze',name:'Doom’s Winter Hedge Maze',image:'winter-hedge-maze-v1',floor:'#758584',music:'winter-dominion.mid',
  rooms:[],corridors:[[3,3,34,3],[3,3,3,22],[34,3,3,22],[3,22,34,3],[4,4,18,3],[19,4,3,9],[10,10,12,3],[10,10,3,10],[10,17,20,3],[27,4,3,16],[19,10,18,3],[19,17,3,8],[4,15,4,3]],furniture:[],
  from:'royal-archives',door:[35,5],probes:[[4,4],[35,4],[11,11],[28,18],[6,16]],barriers:[[15,15],[24,7]],
  description:'An intricate outdoor Christmas hedge maze in Castle Doom’s snowy gardens. Dense evergreen hedge islands follow every nonwalkable region of the blueprint; narrow snowy paths contain the outer loop, interior switchbacks, side loops and dead ends exactly as drawn. Frosted hedge tops, occasional red bows, tiny warm lanterns and silver star ornaments stay embedded in the hedges, never on walking lanes. Low cutaway hedge faces and visible snow path surfaces. A stone garden gate on the lower central path marks the arrival. No big central clearing, no people, no extra openings through hedges.'},
 {id:'orbital-labs',name:'Doom’s Orbital Research Labs',image:'orbital-labs-v1',floor:'#3d5360',music:'iron-and-mistletoe.mid',
  rooms:[[3,18,8,5],[29,18,8,5],[12,9,6,7],[25,3,8,5]],
  corridors:[[19,19,3,6],[4,19,32,3],[4,4,3,18],[4,4,32,3],[33,4,3,18],[19,12,17,3],[19,5,3,10],[5,10,15,3]],furniture:[[3,18,2,2],[34,18,2,2],[12,9,2,2],[25,3,2,2]],
  from:'orbital-station',door:[16,12],probes:[[5,5],[35,5],[15,13],[20,13],[32,21]],barriers:[[25,10],[12,18]],
  description:'A maze-like orbital research annex above a blue planet. Narrow pressurized corridors form a perimeter circuit and staggered cross-links between four small laboratories. Cyan glass sample chambers, green holographic research screens, silver bulkheads, amber airlock lights and modest strings of holiday lights. Dark solid regions are sealed machinery bays and outer-space gaps; only the marked blue areas are walkable deck. Scientific equipment sits in gold blocks or solid bays. A northeastern launch doorway leads to a mountain observatory. Shallow dollhouse cutaway walls, no giant open lobby.'},
 {id:'mountain-observatory',name:'Latverian Mountain Observatory',image:'mountain-observatory-v1',floor:'#4c5c67',music:'holiday-truce.mid',
  rooms:[[3,3,9,5],[29,3,8,5],[14,11,9,5],[3,18,9,5]],
  corridors:[[19,19,3,6],[6,19,28,3],[6,5,3,17],[6,5,16,3],[19,5,3,10],[19,12,15,3],[31,5,3,17]],furniture:[[3,3,2,2],[29,3,2,2],[14,11,2,2],[3,18,2,2]],
  from:'orbital-labs',door:[35,5],probes:[[7,5],[33,5],[20,13],[7,20]],barriers:[[25,9],[15,18]],
  description:'A mountaintop observatory complex at a snowy Latverian night. Small telescope domes, a chart room and a warm weather office are linked by long narrow enclosed galleries and right-angle glass skywalks over dark snowy ravines. Two vertical routes and offset horizontal passages make a circuit, with side chambers to enter and leave. Brass star instruments and telescope bases occupy only gold blocks or dark solid zones; walking lanes stay clear. Blue-white snow, warm gold lamps, emerald roof trim, red holiday garlands. Low wall cutaways expose the exact floor plan; no enormous open viewing plaza.'}
];

export const pathTransports = pathMaps.map(map=>({id:`${map.id}-route`,map:map.from,location:{x:map.door[0],y:map.door[1]},to:map.id}));

// The paintings expose wall fronts and railings inside the initial diagram outlines.
// These final masks follow the visible floor; the original rectangles remain as art references.
const paintedFloors={
 'royal-archives':{rooms:[[3,4,7,2],[30,4,7,2],[12,9,4,4],[10,11,6,2],[29,17,7,4]],corridors:[[19,20,2,4],[4,20,32,1],[4,4,2,17],[4,4,32,2],[34,4,2,17],[12,11,23,2],[13,5,1,7],[22,12,2,9]],furniture:[[7,3,2,2],[30,3,2,2],[34,17,2,2]]},
 'parcel-depot':{rooms:[[3,4,7,2],[30,4,7,2]],corridors:[[19,20,2,5],[4,4,32,2],[4,11,32,2],[4,19,32,3],[4,4,2,18],[13,4,2,18],[24,4,2,18],[34,4,2,18]],furniture:[[6,3,3,2],[31,3,2,2]]},
 'service-tunnels':{rooms:[[3,4,7,3],[29,4,7,2],[4,17,5,3],[27,10,3,3]],corridors:[[19,19,2,4],[4,18,32,2],[4,12,2,8],[4,12,26,2],[27,6,3,8],[4,4,32,4],[34,4,2,16]],furniture:[[7,3,2,1],[30,3,2,1],[25,9,2,2]]},
 'frozen-canals':{rooms:[[7,3,4,3],[29,17,7,2]],corridors:[[19,18,2,7],[8,17,26,2],[8,4,2,15],[8,4,26,1],[32,4,2,15],[8,11,26,1],[19,4,2,5]],furniture:[[18,9,4,2],[35,16,2,2]]},
 'winter-hedge-maze':{rooms:[],corridors:[[4,4,32,1],[4,4,2,17],[34,4,2,17],[4,20,32,1],[19,20,3,5],[19,4,2,6],[9,9,20,1],[9,9,2,8],[9,15,20,2],[27,4,2,13],[27,9,9,1],[4,13,3,2]],furniture:[]},
 'orbital-labs':{rooms:[[3,17,4,3],[33,17,4,3],[15,9,2,4],[28,3,4,3]],corridors:[[19,17,2,6],[4,17,32,2],[4,4,2,16],[4,4,32,2],[34,4,2,16],[19,11,17,1],[19,5,2,7],[5,9,12,1]],furniture:[[25,3,2,2],[12,10,3,3],[16,8,2,2]]},
 'mountain-observatory':{rooms:[[3,4,8,2],[29,4,7,2],[14,12,8,2],[3,18,8,3]],corridors:[[19,19,2,5],[6,19,27,2],[6,5,2,16],[6,5,15,1],[20,5,2,9],[20,12,13,1],[31,5,2,16]],furniture:[[14,10,3,3],[3,17,3,3]]}
};
for(const map of pathMaps)map.collision=paintedFloors[map.id];
pathMaps.find(m=>m.id==='service-tunnels').spawn={x:20,y:22};
pathMaps.find(m=>m.id==='orbital-labs').spawn={x:20,y:22};
const finalProbes={
 'royal-archives':[[5,5],[35,5],[13,12],[32,20]],
 'parcel-depot':[[5,5],[35,5],[14,12],[25,20]],
 'service-tunnels':[[5,5],[34,5],[5,19],[28,12]],
 'frozen-canals':[[9,4],[33,4],[24,11],[33,18]],
 'winter-hedge-maze':[[4,4],[35,4],[10,9],[28,15],[5,13]],
 'orbital-labs':[[5,5],[35,5],[15,12],[20,11],[34,18]],
};
for(const map of pathMaps)if(finalProbes[map.id])map.probes=finalProbes[map.id];
pathMaps.find(m=>m.id==='frozen-canals').barriers=[[15,15],[25,8]];
pathMaps.find(m=>m.id==='winter-hedge-maze').barriers=[[15,12],[24,7]];
pathMaps.find(m=>m.id==='orbital-labs').barriers=[[25,10],[12,15]];
