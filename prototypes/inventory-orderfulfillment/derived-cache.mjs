export function createFulfillmentDerivedCache({ maxAge = Infinity, now = Date.now } = {}) {
  const snapshots = new WeakMap();
  return (facts, supplement, key, calculate) => {
    let snapshot = snapshots.get(facts);
    if (!snapshot || snapshot.supplement !== supplement) {
      snapshot = { supplement, values: new Map() };
      snapshots.set(facts, snapshot);
    }
    const saved = snapshot.values.get(key);
    if (!saved || now() - saved.at >= maxAge)
      snapshot.values.set(key, { value: calculate(), at: now() });
    return snapshot.values.get(key).value;
  };
}
