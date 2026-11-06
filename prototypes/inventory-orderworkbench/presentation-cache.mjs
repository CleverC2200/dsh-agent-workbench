import { workbenchPresentation, workbenchEvidence } from './live-presentation.mjs';

/** Cache facts, never edits or revision owners; every new Session must recheck its server scope. */
export function createWorkbenchScopedFactsCache({ maxAge, reusable, now = Date.now }) {
  const entries = new Map();
  return {
    hasPeriod(start, end) {
      for (const [key, entry] of entries) {
        if (now() - entry.at >= maxAge) entries.delete(key);
        else if (entry.facts.start === start && entry.facts.end === end) return true;
      }
      return false;
    },
    set(scope, facts) {
      if (typeof scope?.key !== 'string' || !scope.key || !reusable(facts)) return;
      const key = JSON.stringify([scope.key, facts.start, facts.end]);
      const previous = entries.get(key);
      const at = previous && now() - previous.at < maxAge ? previous.at : now();
      entries.delete(key);
      entries.set(key, { scope: scope.key, facts, at });
      while (entries.size > 6) entries.delete(entries.keys().next().value);
    },
    get(scope) {
      if (typeof scope?.key !== 'string' || !scope.key) return [];
      const result = [];
      for (const [key, entry] of entries) {
        if (now() - entry.at >= maxAge) entries.delete(key);
        else if (entry.scope === scope.key) result.push(entry.facts);
      }
      return result;
    },
    clear() { entries.clear(); },
  };
}

/** Retain clean, identity-bound results, including successful sections of interrupted reads. */
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
        if (entry.controller.signal.aborted || !entry.loaded || entry.dirty ||
            entry.persistence.pending() || !reusable(entry.facts) ||
            now() - (entry.finished ?? Date.parse(entry.facts?.readAt)) >= maxAge ||
            !Number.isFinite(entry.finished ?? Date.parse(entry.facts?.readAt)))
          discard(key, entry);
        else if (!entry.finished) entry.started = false;
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
