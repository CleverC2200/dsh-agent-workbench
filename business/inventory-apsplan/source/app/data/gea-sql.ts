/** The host owns identity, Agent delegation and resource/row/column permissions. */
export type SqlTransport = (method: string, parameters: unknown, options?: {signal?:AbortSignal}) => Promise<any>;
export class GeaQueryError extends Error {
  constructor(public code: string, message: string, public stage?: string) { super(message); }
}
export async function readGovernedSql(transport: SqlTransport, sql: string, parameters: Record<string, unknown>, options: {signal?:AbortSignal} = {}) {
 const rows: Array<Record<string, unknown>>=[];
 let total: number | undefined, columns: string | undefined;
 async function page(pageNo:number){
  options.signal?.throwIfAborted();
  const result = await transport('sql', {sql, parameters, resultShape: 'rows', pageSize: 200, pageNo},options);
  options.signal?.throwIfAborted();
  const failure = result?.failure ?? result?.error;
  if (result?.success === false || failure) throw new GeaQueryError(failure?.reasonCode ?? failure?.code ?? result?.errorCode ?? 'GEA_QUERY_FAILED', failure?.message ?? result?.message ?? 'GEA 受控查询失败', failure?.stage);
  if (!result || !Array.isArray(result.rows)) throw new GeaQueryError('GEA_RESULT_INVALID', 'GEA 查询未返回有效结果');
  if (result.rejectedColumns?.length) throw new GeaQueryError('GEA_RETURN_COLUMNS_REJECTED', '部分指标字段没有返回权限');
  const nextTotal=result.total == null ? undefined : Number(result.total);
  if(nextTotal!==undefined&&(!Number.isSafeInteger(nextTotal)||nextTotal<0||nextTotal>12000))throw new GeaQueryError('GEA_RESULT_INCOMPLETE','结果超过完整读取范围，请缩小筛选范围');
  const nextColumns=JSON.stringify(result.returnedColumns??null);
  if(pageNo===1){total=nextTotal;columns=nextColumns}
  else if(nextTotal!==total||columns!==nextColumns)throw new GeaQueryError('GEA_PAGINATION_CHANGED','分页期间数据总数或返回权限发生变化，请刷新');
  if(result.pageNo!==undefined&&Number(result.pageNo)!==pageNo)throw new GeaQueryError('GEA_RESULT_INCOMPLETE','返回页码不匹配');
  if(total!==undefined&&result.rows.length!==Math.min(200,total-(pageNo-1)*200))throw new GeaQueryError('GEA_RESULT_INCOMPLETE','分页结果缺失，未计算部分合计');
  if(total!==undefined&&pageNo*200>=total&&result.hasMore===true)throw new GeaQueryError('GEA_RESULT_INCOMPLETE','分页总数不一致');
  if(total===undefined&&(result.hasMore===true||result.rows.length===200))throw new GeaQueryError('GEA_RESULT_INCOMPLETE','分页缺少可靠总数');
  return result.rows as Array<Record<string,unknown>>;
 }
 rows.push(...await page(1));
 if(total===undefined||rows.length===total)return rows;
 const count=Math.ceil(total/200);
 for(let first=2;first<=count;first+=3){
  // Settle this bounded batch before publishing or launching another one.
  // Results remain ordered by page even if responses arrive out of order.
  const batch=await Promise.allSettled(Array.from({length:Math.min(3,count-first+1)},(_,i)=>page(first+i)));
  const failed=batch.find(result=>result.status==='rejected');
  if(failed?.status==='rejected')throw failed.reason;
  for(const result of batch)if(result.status==='fulfilled')rows.push(...result.value);
 }
 return rows;
}
