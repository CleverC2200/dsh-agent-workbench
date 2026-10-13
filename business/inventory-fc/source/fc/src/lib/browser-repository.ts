import type { WarehouseId } from './domain.ts';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type DraftScope = {
  userId: string;
  conversationId: string;
  warehouseId: WarehouseId;
  month?: string;
};

export type OrderDraft = {
  quantities: Record<string, number>;
  reasons: Record<string, string>;
  dirty: boolean;
};

export type PlanImportDraft = {
  fileName: string;
  rows: Array<Record<string, string | number>>;
  importedAt: string;
  applied?: boolean;
};

export type LayoutPreferences = {
  aiOpen: boolean;
  frozenColumns: string[];
  columnOrder: string[];
};
/** Unsent controls and locally composed changes; these are never server cycle-setting results. */
export type CycleEdit = {
  level: 'warehouse' | 'category' | 'material-group' | 'sku';
  object: string;
  days: string;
  from: string;
  to: string;
  overrides: (
    | {
        kind: 'set';
        level: CycleEdit['level'];
        objectId: string;
        cycleDays: number;
        effectiveFrom?: string;
        effectiveTo?: string;
      }
    | { kind: 'remove'; level: CycleEdit['level']; objectId: string }
  )[];
};

export type BusinessAuditEntry = {
  id: string;
  type:
    | 'cycle-change'
    | 'plan-import'
    | 'quantity-change'
    | 'draft-save'
    | 'submission-confirm'
    | 'defer';
  occurredAt: string;
  operator: string;
  detail: Record<string, string | number | boolean>;
};

const PREFIX = 'branch-inventory:v1';

function safeParse<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function scopedKey(kind: string, scope: DraftScope): string {
  if (kind === 'order-draft' && scope.month)
    return `branch-inventory:v2:${kind}:${encodeURIComponent(scope.userId)}:${scope.warehouseId}:${encodeURIComponent(scope.month)}`;
  return `${PREFIX}:${kind}:${encodeURIComponent(scope.userId)}:${encodeURIComponent(scope.conversationId)}:${scope.warehouseId}`;
}

export class BrowserRepository {
  private readonly storage: StorageLike;

  constructor(storage: StorageLike) {
    this.storage = storage;
  }

  loadDraft(scope: DraftScope): OrderDraft | null {
    return safeParse<OrderDraft>(this.storage.getItem(scopedKey('order-draft', scope)));
  }

  saveDraft(scope: DraftScope, draft: OrderDraft): void {
    this.storage.setItem(scopedKey('order-draft', scope), JSON.stringify(draft));
  }

  clearDraft(scope: DraftScope): void {
    this.storage.removeItem(scopedKey('order-draft', scope));
  }

  loadPlanDraft(scope: DraftScope): PlanImportDraft | null {
    return safeParse<PlanImportDraft>(this.storage.getItem(scopedKey('plan-draft', scope)));
  }

  savePlanDraft(scope: DraftScope, draft: PlanImportDraft): void {
    this.storage.setItem(scopedKey('plan-draft', scope), JSON.stringify(draft));
  }

  loadCyclePreview(scope: DraftScope): Record<string, string | boolean> | null {
    return safeParse<Record<string, string | boolean>>(
      this.storage.getItem(scopedKey('cycle-preview', scope)),
    );
  }

  saveCyclePreview(scope: DraftScope, rules: Record<string, string | boolean>): void {
    this.storage.setItem(scopedKey('cycle-preview', scope), JSON.stringify(rules));
  }
  loadCycleEdit(scope: DraftScope): CycleEdit | null {
    return safeParse<CycleEdit>(this.storage.getItem(scopedKey('cycle-edit', scope)));
  }
  saveCycleEdit(scope: DraftScope, edit: CycleEdit): void {
    this.storage.setItem(scopedKey('cycle-edit', scope), JSON.stringify(edit));
  }

  loadFilters(scope: DraftScope): Record<string, string | boolean | string[]> {
    return (
      safeParse<Record<string, string | boolean | string[]>>(
        this.storage.getItem(scopedKey('filters', scope)),
      ) ?? {}
    );
  }

  saveFilters(scope: DraftScope, filters: Record<string, string | boolean | string[]>): void {
    this.storage.setItem(scopedKey('filters', scope), JSON.stringify(filters));
  }

  loadPreferences(userId: string): LayoutPreferences | null {
    return safeParse<LayoutPreferences>(
      this.storage.getItem(`${PREFIX}:preferences:${encodeURIComponent(userId)}`),
    );
  }

  savePreferences(userId: string, preferences: LayoutPreferences): void {
    this.storage.setItem(
      `${PREFIX}:preferences:${encodeURIComponent(userId)}`,
      JSON.stringify(preferences),
    );
  }

  loadAudit(scope: DraftScope): BusinessAuditEntry[] {
    return (
      safeParse<BusinessAuditEntry[]>(this.storage.getItem(scopedKey('business-audit', scope))) ??
      []
    );
  }

  appendAudit(scope: DraftScope, entry: BusinessAuditEntry): void {
    const current = this.loadAudit(scope);
    if (current.some((item) => item.id === entry.id)) return;
    this.storage.setItem(scopedKey('business-audit', scope), JSON.stringify([...current, entry]));
  }
}

export function createBrowserRepository(): BrowserRepository | null {
  if (typeof window === 'undefined') return null;
  return new BrowserRepository(window.localStorage);
}
