export type WorkbenchSqlRow = Record<string, string | number | null | undefined>;
export type WorkbenchSqlQuery = {
 name:string;
 sql:string;
 maxRows:number;
 parameters?:Record<string,unknown>;
};
