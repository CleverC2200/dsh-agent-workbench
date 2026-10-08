import { executeAllGeaSqlPages } from "../../../../../shared/sql-reader";
import { bindGovernedSql } from "../../../../../shared/governed-parameters";

/** A captured operation signal owns every query in its source pipeline. */
export function scopedDatabase(signal?: AbortSignal) {
  return {
    async query(sql: string, values: unknown[] = []) {
      const bound = bindGovernedSql(sql, values);
      return { rows: await executeAllGeaSqlPages(bound.sql, { parameters: bound.parameters, signal }) };
    },
  };
}
export async function queryStock(query: any, signal?: AbortSignal) {
  const rows = await executeAllGeaSqlPages(query.sql, { parameters: query.parameters ?? {}, signal });
  if (rows.length > query.maxRows) throw Error("QUERY_RESULT_EXCEEDS_LIMIT");
  return rows;
}
export const queryBusinessDatabase = (db: any, sql: string, values: unknown[]) => db.query(sql, values);
export const usesGeaSql = () => true;
export function getDatabase() { throw Error("PERSONAL_SCOPED_DATABASE_REQUIRED"); }
export const getBusinessDatabase = getDatabase;
export function readPlanningState() { throw Error("PERSONAL_PLANNING_WRITE_UNAVAILABLE"); }
