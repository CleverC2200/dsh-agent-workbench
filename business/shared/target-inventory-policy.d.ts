export function normalizeTargetInventoryVersion(value: any): string;
export function selectDefaultPublishedTargetInventory(
  rows: Array<Record<string, string | number | null | undefined>>,
  now?: Date,
  policy?: {
    timeZone: string;
    nextMonthSwitchDay: number;
    versionPriority: string[];
  },
): {
  requestedTargetMonth: string;
  targetMonth: string;
  inventoryVersion: any;
  normalizedVersion: string;
  versionPriority: string[];
  published: boolean;
  fallbackUsed: boolean;
  switchedToNextMonth: boolean;
};
export function targetVersionCandidates(versions: string[]): string[];
export function selectWholeBaseTargetVersion<T extends Record<string, unknown>>(rows: T[]): T[];
