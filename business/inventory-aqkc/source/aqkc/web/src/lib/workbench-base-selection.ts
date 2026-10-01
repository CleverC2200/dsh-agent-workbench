/** Display scope comes from the server's current dashboard, never a UI role. */
export const ALL_VISIBLE_BASES = "__all_visible_bases__";

export function workbenchBasePaths(rows: ReadonlyArray<Record<string, unknown>>): string[] {
  return [...new Set(rows.flatMap((row) => {
    const base = row.level;
    return typeof base === "string" && base.trim() && base !== "全国"
      ? [`${base.trim().replace(/基地$/u, "")}基地`] : [];
  }))];
}

export function selectedWorkbenchPaths(available: string[], selection: string[] | null): string[] {
  return selection === null ? available : available.filter((path) => selection.includes(path));
}

export function toggleWorkbenchPath(available: string[], selected: string[], path: string): string[] {
  const current = selectedWorkbenchPaths(available, selected);
  if (path === ALL_VISIBLE_BASES) return current.length === available.length ? [] : [...available];
  if (!available.includes(path)) return current;
  return current.includes(path) ? current.filter((item) => item !== path) : [...current, path];
}
