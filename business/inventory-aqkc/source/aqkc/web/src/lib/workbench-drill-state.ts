export type BaseCategoryTable = {
  columns: { key: string; label: string }[];
  rows: Record<string, string | number>[];
  notice?: string;
};

type BaseCategoryDetailInput<T extends BaseCategoryTable> = {
  base: string;
  loading: boolean;
  error: string | null;
  table: T | null;
};

export function baseCategoryDetailState<T extends BaseCategoryTable>(
  input: BaseCategoryDetailInput<T>,
):
  | { kind: "loading" | "error" | "empty"; message: string }
  | { kind: "ready"; table: T } {
  if (input.loading) {
    return { kind: "loading", message: `正在加载${input.base}基地品类数据…` };
  }
  if (input.error) {
    return { kind: "error", message: `品类数据加载失败：${input.error}` };
  }
  if (!input.table?.rows.length) {
    return {
      kind: "empty",
      message: input.table?.notice || `${input.base}基地暂无可展示的真实品类数据。`,
    };
  }
  return { kind: "ready", table: input.table };
}

type CategoryBaseDetailInput<T extends BaseCategoryTable> = {
  category: string;
  loading: boolean;
  error: string | null;
  table: T | null;
};

export function categoryBaseDetailState<T extends BaseCategoryTable>(
  input: CategoryBaseDetailInput<T>,
):
  | { kind: "loading" | "error" | "empty"; message: string }
  | { kind: "ready"; table: T } {
  if (input.loading) {
    return { kind: "loading", message: `正在加载${input.category}各基地库存数据…` };
  }
  if (input.error) {
    return { kind: "error", message: `基地库存数据加载失败：${input.error}` };
  }
  if (!input.table?.rows.length) {
    return {
      kind: "empty",
      message: input.table?.notice || `${input.category}暂无可展示的真实基地库存数据。`,
    };
  }
  return { kind: "ready", table: input.table };
}
