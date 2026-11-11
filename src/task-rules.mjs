// Task rules are auditable execution inputs, not registrations in the metric library.
export function permitsNullHealthy(description='') {
  return String(description).split(/[，,。；;\n]/).some(clause =>
    /(?:空值|NULL|null).{0,12}(?:算|视为|按|判为|作为).{0,4}(?:正常|健康)/.test(clause) &&
    !/(?:不|不能|不得|不要|不可).{0,4}(?:算|视为|按|判为|作为)/.test(clause));
}
export function validateTaskRule(row,task) {
 const r=row.rule;
 if(r?.sourceType!=='task')return false;
 if(!r.taskQuote || !String(task.description||'').includes(r.taskQuote))throw Error('任务规则缺少原文依据');
 r.source='任务自定义：'+r.taskQuote;r.id='task:'+task.id;r.version='任务执行快照';
 let healthy;
 if(row.value===null){
  if(!permitsNullHealthy(task.description)||r.nullPolicy!=='healthy'||row.dataStatus!=='queried-null')throw Error('仅明确指定空值正常且查询成功返回空值时可判定正常');
  if(row.status!=='健康')throw Error('空值应按任务规则判为健康');
  row.analysis=[row.analysis,'空值按任务规则视为正常（非实测正常值）'].filter(Boolean).join('；');
  return true;
 }
 if(!Number.isFinite(row.value))throw Error('指标值无效，缺失字段不等于查询空值');
 if(r.kind==='range'){
  if(!Number.isFinite(r.min)||!Number.isFinite(r.max)||r.min>r.max)throw Error('任务正常区间无效');
  healthy=row.value>=r.min&&row.value<=r.max;
 }else{
  if(!Number.isFinite(r.healthy)||!['gt','gte','lt','lte'].includes(r.healthyOperator))throw Error('任务阈值或比较符无效');
  healthy=({gt:row.value>r.healthy,gte:row.value>=r.healthy,lt:row.value<r.healthy,lte:row.value<=r.healthy})[r.healthyOperator];
 }
 // No severe threshold was provided: never invent a severe grade.
 let status=healthy?'健康':'预警';
 if(r.severe!=null){
  if(!Number.isFinite(r.severe)||!['higher','lower'].includes(r.direction)||r.kind==='range')throw Error('任务严重等级规则不完整');
  if(!healthy&&(r.direction==='higher'?row.value<r.severe:row.value>r.severe))status='严重';
 }
 if(row.status!==status)throw Error('AI风险状态与任务规则不一致');
 return true;
}
export function displayRule(r,unit=''){
 if(r.kind==='range')return `正常区间 ${r.min}—${r.max}${unit}；区间外预警`;
 return `健康 ${({gt:'>',gte:'≥',lt:'<',lte:'≤'})[r.healthyOperator]} ${r.healthy}${unit}`+(r.severe==null?'；未设置严重阈值':`；严重${r.direction==='higher'?'<':'>'}${r.severe}${unit}`);
}
export const displayValue=(value,unit='')=>value===null?'空值（按任务规则正常）':`${value}${unit}`;
