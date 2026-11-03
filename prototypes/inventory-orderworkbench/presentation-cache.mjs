import { workbenchPresentation, workbenchEvidence } from './live-presentation.mjs';

export function createWorkbenchPresentationCache() {
  const snapshots = new WeakMap();
  return (facts, options = {}) => {
    let views = snapshots.get(facts);
    if (!views) snapshots.set(facts, (views = new Map()));
    const key = JSON.stringify(options);
    if (!views.has(key)) views.set(key, workbenchPresentation(facts, options));
    return views.get(key);
  };
}

export function createWorkbenchEvidenceCache() {
  const snapshots = new WeakMap();
  return (facts) => {
    if (!facts) return null;
    if (!snapshots.has(facts)) snapshots.set(facts, workbenchEvidence(facts));
    return snapshots.get(facts);
  };
}
