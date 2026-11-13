const drafts = new Map<string, string>();
export const browserStorage = {
  getItem: (key: string) => drafts.get(key) ?? null,
  setItem: (key: string, value: string) => {
    drafts.set(key, value);
  },
  removeItem: (key: string) => {
    drafts.delete(key);
  },
};
