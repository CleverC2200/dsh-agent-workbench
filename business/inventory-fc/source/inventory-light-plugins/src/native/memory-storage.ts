// Isolated HTML cannot access host storage. Drafts deliberately live only until page close.
const values = new Map<string, string>();
export const memoryStorage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, String(value)),
  removeItem: (key: string) => values.delete(key),
  clear: () => values.clear(),
};
window.addEventListener("gea-identity-changed", () => values.clear());
