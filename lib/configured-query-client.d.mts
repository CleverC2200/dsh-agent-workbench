export class QueryContractError extends Error {
  code: string;
  [key: string]: unknown;
}
export function makeRequest(
  config: any,
  id: string,
  values: Record<string, unknown>,
):
  | { cube: Record<string, unknown> }
  | {
      sql: string;
      parameters: Record<string, unknown>;
      includeTotal: false;
    };
export function createQueryClient(
  config: any,
  execute: (request: any, options: any) => Promise<any>,
): {
  read(id: string, values: Record<string, unknown>, options?: any): Promise<any>;
  readAll(id: string, values: Record<string, unknown>, options: any): Promise<any>;
};
export function requireColumns(result: any, columns: string[]): void;
export function inventoryOverview(result: any): any;

export function unpackAtomicPage(
  result: any,
  page: number,
  size: number,
): { rows: any[]; total: number };
