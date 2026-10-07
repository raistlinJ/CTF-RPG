// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
export function musicTracks(config) {
  return config.playlist?.length ? config.playlist : config.midi ? [{name: config.midi.split('/').pop(), midi: config.midi}] : [];
}
export function shuffledTracks(tracks, previous, random = Math.random) {
  const queue = [...tracks];
  for (let i=queue.length-1;i>0;i--) {const j=Math.floor(random()*(i+1));[queue[i],queue[j]]=[queue[j],queue[i]];}
  if (queue.length>1 && queue[0].midi===previous) {
    const other=queue.findIndex(t=>t.midi!==previous);
    if (other>0) [queue[0],queue[other]]=[queue[other],queue[0]];
  }
  return queue;
}
