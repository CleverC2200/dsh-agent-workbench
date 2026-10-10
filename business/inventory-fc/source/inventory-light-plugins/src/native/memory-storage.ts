import { createPageViewState } from '../../../../../shared/view-state.js';
// The current BrowserRepository remains the typed owner; Workbench retains only its declared UI records.
const values = new Map<string, string>();
const view = createPageViewState('inventory-fc');
const kinds = {
  filters: 'filters',
  drafts: 'order-draft',
  plans: 'plan-draft',
  cycles: 'cycle-preview',
  preferences: 'preferences',
  cycleEdits: 'cycle-edit',
} as const;
const supported = (key: string, kind: string) =>
  key.startsWith('branch-inventory:v1:' + kind + ':') ||
  key.startsWith('branch-inventory:v2:' + kind + ':');
function publish() {
  const snapshot: Record<string, unknown> = {};
  for (const [field, kind] of Object.entries(kinds))
    snapshot[field] = [...values]
      .filter(([key]) => supported(key, kind))
      .map(([key, value]) => {
        const parsed = JSON.parse(value);
        return {
          key,
          value:
            field === 'plans'
              ? { fileName: parsed.fileName, rows: parsed.rows, importedAt: parsed.importedAt }
              : parsed,
        };
      });
  view.update(snapshot);
}
view.subscribe((snapshot: Record<string, unknown>) => {
  const before = JSON.stringify(
    [...values].filter(([key]) => Object.values(kinds).some((kind) => supported(key, kind))),
  );
  for (const key of values.keys())
    if (Object.values(kinds).some((kind) => supported(key, kind))) values.delete(key);
  for (const field of Object.keys(kinds))
    for (const entry of (snapshot[field] ?? []) as {
      key: string;
      value: unknown;
    }[])
      values.set(entry.key, JSON.stringify(entry.value));
  const after = JSON.stringify(
    [...values].filter(([key]) => Object.values(kinds).some((kind) => supported(key, kind))),
  );
  if (before !== after) window.dispatchEvent(new Event('workbench-fc-view-restored'));
});
export const memoryStorage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => {
    values.set(key, String(value));
    if (Object.values(kinds).some((kind) => supported(key, kind))) publish();
  },
  removeItem: (key: string) => {
    values.delete(key);
    if (Object.values(kinds).some((kind) => supported(key, kind))) publish();
  },
  clear: () => values.clear(),
};
window.addEventListener('gea-identity-changed', () => values.clear());
