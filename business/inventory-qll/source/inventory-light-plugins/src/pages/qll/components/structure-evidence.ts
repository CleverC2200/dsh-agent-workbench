import {createHash} from "../../../browser-crypto";
import {completeTotal,summarizeStructure} from "dsh-agent-manage/inventory-compute/full-chain-category-structure";
import type {StructureRow,FullChainWorkspace} from "dsh-agent-manage/inventory-compute/full-chain-types";

export const scopeDescription=(scope:string)=>scope==='company'
 ? '公司范围：基地＋分仓可用，不含客户渠道'
 : '全渠道观察：客户单列，不计入公司合计';

export function referenceText(text:string){
 if(text.length<=200)return text;
 const cut=/[\uD800-\uDBFF]/.test(text[198])?198:199;
 return text.slice(0,cut)+'…';
}

/** External IDs obey the existing page contract; business/tree keys stay intact. */
export function structureReferences(workspaceId:string,visible:StructureRow[],selected:StructureRow|null,maxRows=299){
 const ordered=[...(selected?[selected]:[]),...visible.filter(r=>r.sku!=='全部SKU'),...visible.filter(r=>r.sku==='全部SKU')];
 const unique=[...new Map(ordered.map(row=>[row.key,row])).values()];
 const rows=unique.slice(0,maxRows); // Reserve the remaining slots for page controls and trend references.
 return {rows,coverage:{visibleRows:unique.length,referencedRows:rows.length,omittedRows:unique.length-rows.length},elements:rows.map(row=>({
  id:'chain:row:'+createHash('sha256').update(JSON.stringify([workspaceId,row.key])).digest('hex'),
  role:'row' as const,
  label:referenceText(row.objectName+' · '+row.category+' · '+row.sku),
  value:referenceText('库存：'+quantity(row.currentQty)+' 件；可用：'+quantity(row.availableQty)+'；目标：'+quantity(row.targetQty)+'；数据日期：'+row.sourceDate),
 }))};
}
const quantity=(value:number|null|undefined)=>value==null?'-':value.toLocaleString('zh-CN',{maximumFractionDigits:0});

/** Filtered, already-calculated aggregates are separate from the paged SKU detail. */
export function structureViewEvidence(workspace:FullChainWorkspace,rows:StructureRow[],filters:{category:string;org:string},status:string,mode:string){
 return {workspaceId:workspace.workspaceId,scope:workspace.scope,scopeDescription:scopeDescription(workspace.scope),filters:{...workspace.filters,...filters,status},mode,
  coverage:'当前过滤后的品类×组织确定性汇总；不由当前SKU分页重新求和',rowCount:rows.length,
  companyPhysicalQty:completeTotal(rows.filter(r=>r.layer!=='customer').map(r=>r.currentQty)),
  companyPhysicalBasis:'表格公司实物库存：基地实物＋分仓实物，不含客户',
  companyInventoryQty:completeTotal(rows.filter(r=>r.layer!=='customer').map(r=>r.layer==='branch'?r.availableQty:r.currentQty)),
  companyInventoryBasis:'公司范围库存：基地库存＋分仓可用，不含客户',
  layers:(['base','branch','customer'] as const).flatMap(layer=>{
   const values=rows.filter(r=>r.layer===layer);
   return values.length?[summarizeStructure(values,layer,layer)]:[];
  }),rows};
}
