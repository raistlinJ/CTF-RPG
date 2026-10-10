// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
/** Validate a directed graph of prerequisites. Edges point from a prerequisite to its dependent. */
export function validateChallengeDependencies(challenges, knownIds = challenges.map((c) => c.id)) {
  const known = new Set(knownIds);
  const graph = new Map(challenges.map((c) => [c.id, c.dependsOn || []]));
  for (const c of challenges) {
    const prerequisites = c.dependsOn || [];
    if (new Set(prerequisites).size !== prerequisites.length)
      throw Error(`Challenge ${c.id} has duplicate prerequisites.`);
    for (const prerequisite of prerequisites) {
      if (prerequisite === c.id) throw Error(`Challenge ${c.id} cannot depend on itself.`);
      if (!known.has(prerequisite)) throw Error(`Node ${c.id} depends on unknown prerequisite ${prerequisite}.`);
    }
  }
  const completed = new Set(), visiting = new Set(), path = [];
  function visit(id) {
    if (completed.has(id)) return;
    if (visiting.has(id)) throw Error(`Dependency loop: ${[...path.slice(path.indexOf(id)), id].join(" → ")}.`);
    visiting.add(id); path.push(id);
    for (const prerequisite of graph.get(id) || []) visit(prerequisite);
    path.pop(); visiting.delete(id); completed.add(id);
  }
  for (const c of challenges) visit(c.id);
}
export function challengeUnlocked(challenge, solved) {
  return solved.has(challenge.id) || (challenge.dependsOn || []).every((id) => solved.has(id));
}

export const entityReference = id => `npe:${id}`;
export function progressionNodes(challenges, entities = []) {
  return [...challenges, ...entities.map(e => ({ ...e, id: entityReference(e.id) }))];
}
export function validateProgressionDependencies(challenges, entities = []) {
  validateChallengeDependencies(progressionNodes(challenges, entities));
}
export function entityUnlocked(entity, milestones) {
  return challengeUnlocked({ ...entity, id: entityReference(entity.id) }, milestones);
}
