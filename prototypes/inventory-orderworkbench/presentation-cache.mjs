import { workbenchPresentation, workbenchEvidence } from './live-presentation.mjs';

/** A renewed page lease may keep the same Core Session; retain only completed, clean reports. */
export function createWorkbenchPeriodCacheLifecycle(reports, { maxAge, reusable, now = Date.now }) {
  let sessionId;
  const discard = (key, entry) => {
    entry.readController?.abort();
    entry.controller.abort();
    entry.persistence.cancel();
    reports.delete(key);
  };
  const clear = () => {
    for (const [key, entry] of reports) discard(key, entry);
    sessionId = undefined;
  };
  return {
    suspend() {
      for (const [key, entry] of reports) {
        entry.readController?.abort();
        if (entry.controller.signal.aborted || !entry.loaded || !entry.finished || entry.dirty ||
            entry.persistence.pending() || !reusable(entry.facts) || now() - entry.finished >= maxAge)
          discard(key, entry);
      }
    },
    resume(nextSessionId) {
      if (typeof nextSessionId !== 'string' || !nextSessionId) { clear(); return false; }
      if (sessionId && sessionId !== nextSessionId) clear();
      sessionId = nextSessionId;
      return true;
    },
    clear,
  };
}

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
