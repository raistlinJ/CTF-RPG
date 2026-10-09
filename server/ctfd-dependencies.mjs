// CTFd exports store challenge requirements as JSON objects or serialized JSON.
export function ctfdSourceId(value) {
  if (!['number','string'].includes(typeof value) || (typeof value === 'string' && !/^\d+$/.test(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < 1)
    throw Error('CTFd IDs must be positive integers.');
  return String(Number(value));
}
const populated = (value) => Array.isArray(value) ? value.length > 0 : value && typeof value === 'object' ? Object.keys(value).length > 0 : !!value;
export function ctfdPrerequisites(value, label = 'Challenge') {
  if (value === null || value === undefined || value === '') return { prerequisites: [], unsupported: [], anonymize: null };
  let requirements;
  try { requirements = typeof value === 'string' ? JSON.parse(value) : value; }
  catch { throw Error(`${label}: malformed CTFd requirements JSON.`); }
  if (requirements === null) return { prerequisites: [], unsupported: [], anonymize: null };
  if (!requirements || typeof requirements !== 'object') throw Error(`${label}: malformed CTFd requirements.`);
  const list = Array.isArray(requirements) ? requirements : requirements.prerequisites ?? [];
  if (!Array.isArray(list)) throw Error(`${label}: prerequisites must be a list of challenge IDs.`);
  let prerequisites;
  try { prerequisites = [...new Set(list.map(ctfdSourceId))]; }
  catch { throw Error(`${label}: prerequisites must contain positive integer challenge IDs.`); }
  return {
    prerequisites,
    unsupported: Array.isArray(requirements) ? [] : Object.keys(requirements).filter((key) => !['prerequisites','anonymize'].includes(key) && populated(requirements[key])),
    anonymize: Array.isArray(requirements) ? null : requirements.anonymize,
  };
}
export function planCtfdDependencies(challenges, prefix) {
  const source = new Map(challenges.map((c) => [ctfdSourceId(c.id),c]));
  if (source.size !== challenges.length) throw Error('Duplicate CTFd challenge IDs.');
  const dependencies = new Map(), indegree = new Map(), dependents = new Map();
  for (const [id,challenge] of source) {
    const requirements = ctfdPrerequisites(challenge.requirements,String(challenge.name || id));
    if (requirements.prerequisites.includes(id)) throw Error(`${challenge.name || id}: a challenge cannot depend on itself.`);
    const known = requirements.prerequisites.filter((parent) => source.has(parent));
    dependencies.set(id, {
      ...requirements,
      missing: requirements.prerequisites.filter((parent) => !source.has(parent)),
      known,
      dependsOn: known.map((parent) => prefix + parent),
    });
    indegree.set(id,known.length);
    for (const parent of known) {
      if (!dependents.has(parent)) dependents.set(parent,[]);
      dependents.get(parent).push(id);
    }
  }
  // Iterative traversal supports large exports and prerequisites listed later in the ZIP.
  const ready = [...source.keys()].filter((id) => indegree.get(id) === 0), ordered = [];
  for (let i = 0; i < ready.length; i++) {
    const id = ready[i]; ordered.push(source.get(id));
    for (const child of dependents.get(id) || []) {
      const remaining = indegree.get(child) - 1; indegree.set(child,remaining);
      if (!remaining) ready.push(child);
    }
  }
  if (ordered.length !== source.size) throw Error('CTFd prerequisites contain a dependency loop. Fix the loop before importing.');
  return { source, dependencies, ordered };
}
