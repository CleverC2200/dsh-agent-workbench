import { reportDate, reportObjectKey, type DailyReport, type ReportRisk } from "./daily-report";

export const FEEDBACK_TYPES = ["原因说明", "处理计划", "执行进展", "例外说明", "关闭说明"] as const;
export const KNOWN_REASONS = ["待确认", "活动备货", "产能前置", "客户拉货延迟", "已纳入大日期专项", "其他"] as const;
export type FeedbackType = typeof FEEDBACK_TYPES[number];
export type FeedbackTarget = { id:string; label:string; type:"report"|"module"|"risk"; base:string; material:string; quantity:number|null };
export type DailyFeedback = {
  id:string; target:FeedbackTarget; type:FeedbackType; content:string; role:string;
  expectedDate:string; validUntil:string; carryForward:boolean; knownReason:typeof KNOWN_REASONS[number];
  createdAt:string; author:string;
};
export type FeedbackView = DailyFeedback & {state:"有效"|"待复核"|"已关闭"|"风险未列示"; explanation:string};
export type FeedbackBundle = {available:boolean; entries:DailyFeedback[]; warning?:string};
export function feedbackTargets(report:DailyReport):FeedbackTarget[] {
  return [
    {id:"report",label:`${report.bases.join(" / ")} · 日报总体说明`,type:"report",base:"",material:"",quantity:null},
    ...report.modules.map(m=>({id:`module:${m.id}`,label:m.title,type:"module" as const,base:"",material:"",quantity:null})),
    ...[...new Map([...report.risks,...report.modules.flatMap(m=>m.groups.flatMap(g=>g.risks))].map(r=>[r.id,r])).values()]
      .map(r=>({id:r.id,label:`${r.object} · ${r.kind}`,type:"risk" as const,base:r.base,material:r.material,quantity:r.quantity})),
  ];
}
export function feedbackViews(report:DailyReport, entries:DailyFeedback[]):FeedbackView[] {
  const risks=new Map([...report.risks,...report.modules.flatMap(m=>m.groups.flatMap(g=>g.risks))].map(r=>[r.id,r]));
  const visible=new Set(report.visibleObjectKeys);
  return entries.filter(f=>f.target.type!=="risk" || visible.has(reportObjectKey(f.target)))
    .filter(f=>f.carryForward || reportDate(f.createdAt)===report.date)
    .sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(f=>{
      if(f.type==="关闭说明")return {...f,state:"已关闭",explanation:"业务已确认关闭；若数据风险仍存在，继续展示并请复核。"};
      if(f.validUntil<report.date)return {...f,state:"待复核",explanation:"反馈已过有效期，请核对并重新补充。"};
      if((f.type==="处理计划"||f.type==="执行进展")&&f.expectedDate&&f.expectedDate<report.date)
        return {...f,state:"待复核",explanation:"预计完成日期已过，尚需补充进展或关闭说明。"};
      const current=risks.get(f.target.id);
      if(f.target.type==="risk" && !current)return {...f,state:"风险未列示",explanation:"当前重点清单未列示；可能已解除、排序变化或数据缺失，请复核后关闭。"};
      if(current && f.target.quantity!==null && current.quantity>f.target.quantity)
        return {...f,state:"待复核",explanation:"当前风险量较反馈时增加，需重新核实原因与处理计划。"};
      return {...f,state:"有效",explanation:"在有效期内，可作为业务反馈依据。"};
    });
}
export function applyReportFeedback(report:DailyReport, entries:DailyFeedback[]):DailyReport {
  const views=feedbackViews(report,entries);
  const update=(risk:ReportRisk):ReportRisk=>{
    const linked=views.filter(f=>f.target.id===risk.id);
    if(!linked.length)return risk;
    const newest=linked[0];
    if(newest.state==="已关闭")return {...risk,feedbackStatus:"已关闭，风险仍在待复核"};
    if(newest.state!=="有效")return {...risk,feedbackStatus:"待复核"};
    const reason=linked.find(f=>f.state==="有效" && (f.type==="原因说明"||f.type==="例外说明"));
    const plan=linked.find(f=>f.state==="有效" && (f.type==="处理计划"||f.type==="执行进展"));
    const downgrade=reason && ["活动备货","产能前置"].includes(reason.knownReason) && risk.module==="movement";
    const special=reason?.knownReason==="已纳入大日期专项"&&risk.kind==="60天以上库存";
    return {...risk,feedbackStatus:plan?"处理中":"已反馈",cause:reason?`业务反馈：${reason.content}`:risk.cause,
      level:special?"专项跟进":downgrade?"关注（有有效反馈）":risk.level,priority:special?3:downgrade?4:risk.priority,
      action:special?"业务已确认纳入大日期专项，跟踪既有消化计划与执行进度；不重复作为新增专项上报。":downgrade?"跟踪活动出货或备货计划兑现；风险仍保留，若数量增加需复核。":risk.action};
  };
  const yesterday=reportDate(new Date(Date.parse(`${report.date}T12:00:00+08:00`)-86400000).toISOString());
  const ageIds=new Set(report.modules.find(m=>m.id==="age")?.groups.flatMap(g=>g.risks.map(r=>r.id))??[]);
  const ageFeedback=views.filter(v=>v.target.id==="module:age"||ageIds.has(v.target.id));
  const prior=ageFeedback.filter(v=>reportDate(v.createdAt)===yesterday&&["处理计划","执行进展","关闭说明"].includes(v.type));
  const latest=[...new Map([...ageFeedback].reverse().map(v=>[v.target.id,v])).values()];
  const review=latest.filter(v=>v.state==="待复核").length;
  const yesterdayText=`昨日处理：${prior.length?`记录${prior.filter(v=>v.type==="处理计划").length}条计划、${prior.filter(v=>v.type==="执行进展").length}条进展、${prior.filter(v=>v.type==="关闭说明").length}条关闭说明，具体结果见反馈与跟进。`:"暂无已读取的处理反馈，无法确认消化进度。"}${review?`有${review}项计划到期或风险变化需复核进度。`:""}`;
  return {...report,risks:report.risks.map(update).sort((a,b)=>a.priority-b.priority||b.quantity-a.quantity),
    modules:report.modules.map(m=>({...m,yesterday:m.id==="age"?yesterdayText:m.yesterday,groups:m.groups.map(g=>({...g,risks:g.risks.map(update).sort((a,b)=>a.priority-b.priority||b.quantity-a.quantity)}))}))};
}
function text(value:unknown,max:number) {return typeof value==="string"?value.trim().slice(0,max):"";}
const validDate=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
/** Target and author always come from server-owned report/session, never client labels. */
export function validateFeedback(raw:unknown,report:DailyReport,author:string,createdAt:string):Omit<DailyFeedback,"id"> {
  if(!raw || typeof raw!=="object" || Array.isArray(raw))throw new Error("反馈格式无效。");
  if(report.empty)throw new Error("暂无可生成的日报，请数据恢复后再补充反馈。");
  const v=raw as Record<string,unknown>;
  if(v.confirmed!==true)throw new Error("请核对反馈对象和内容后确认保存。");
  const target=feedbackTargets(report).find(t=>t.id===v.targetId);
  if(!target)throw new Error("反馈对象已不可见或已变化，请重新生成日报后选择。");
  if(target.type==="risk" && v.quantityAtReview!==target.quantity)throw new Error("风险数据已变化，请重新生成日报并核对后保存。");
  const content=text(v.content,2001),type=FEEDBACK_TYPES.find(t=>t===v.type),validUntil=text(v.validUntil,10),expectedDate=text(v.expectedDate,10);
  const today=reportDate(createdAt);
  if(!content || content.length>2000 || !type)throw new Error("请选择反馈类型并填写1–2000字反馈内容。");
  if(!validDate(validUntil)||validUntil<today)throw new Error("有效期必须为今天或之后的有效日期。");
  if(expectedDate && (!validDate(expectedDate)||expectedDate<today))throw new Error("预计完成日期必须为今天或之后的有效日期。");
  if(typeof v.carryForward!=="boolean")throw new Error("请确认是否带入次日报告。");
  return {target,type,content,role:text(v.role,100),expectedDate,validUntil,carryForward:v.carryForward,
    knownReason:KNOWN_REASONS.find(r=>r===v.knownReason)??"待确认",createdAt,author};
}
