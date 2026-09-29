/** IDs are identifiers only, not authorization. Live membership comes from PG. */
export type DemoWarehouseId = "changsha" | "zhengzhou" | "east-china";
export type WarehouseId = DemoWarehouseId | `pickup-${string}`;
export type WarehouseOption = { id: WarehouseId; name: string };

/** Inverse of the catalog's stable pickup-code identity mapping. */
export function warehousePickupCode(id: WarehouseId): string {
  return ({ changsha: "06", zhengzhou: "34", "east-china": "28" } as Record<string, string>)[id] ?? id.replace(/^pickup-/, "");
}

export function isDemoWarehouseId(value: string): value is DemoWarehouseId {
  return value === "changsha" || value === "zhengzhou" || value === "east-china";
}

export function isWarehouseId(value: string): value is WarehouseId {
  return isDemoWarehouseId(value) || /^pickup-[A-Z0-9]{1,16}$/.test(value);
}

export function warehouseIdFromPickupCode(code: string): WarehouseId {
  if (!/^[A-Z0-9]{1,16}$/.test(code)) throw new Error("非法提货点编码");
  // Preserve existing conversations and drafts; the visible name comes from PG.
  if (code === "06") return "changsha";
  if (code === "34") return "zhengzhou";
  if (code === "28") return "east-china";
  return `pickup-${code}`;
}
