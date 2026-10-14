// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
/** Validate a directed graph of prerequisites. Edges point from a prerequisite to its dependent. */
export function validateChallengeDependencies(challenges, knownIds = challenges.map((c) => c.id)) {
  const known = new Set(knownIds);
  const graph = new Map(challenges.map((c) => [c.id, c.dependsOn || []]));
  for (const c of challenges) {
    const prerequisites = c.dependsOn || [];
    if (new Set(prerequisites).size !== prerequisites.length)
      throw Error(`Challenge ${c.id} has duplicate prerequisites.`);
    if (new Set(prerequisites.map(entitySourceReference)).size !== prerequisites.length)
      throw Error(`Node ${c.id} requires more than one output from the same entity.`);
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
export const entityOutputReference = (id, nodeId) => `${entityReference(id)}:${nodeId}`;
export const entitySourceReference = id => id.startsWith("npe:") ? id.split(":").slice(0, 2).join(":") : id;
export function progressionNodes(challenges, entities = []) {
  return [...challenges, ...entities.flatMap(e => [
    { ...e, id: entityReference(e.id) },
    ...e.nodes.filter(node => !node.choices.length).map(node => ({ id: entityOutputReference(e.id, node.id), dependsOn: [entityReference(e.id)] })),
  ])];
}
export function validateProgressionDependencies(challenges, entities = []) {
  validateChallengeDependencies(progressionNodes(challenges, entities));
}
export function entityUnlocked(entity, milestones) {
  return challengeUnlocked({ ...entity, id: entityReference(entity.id) }, milestones);
}
