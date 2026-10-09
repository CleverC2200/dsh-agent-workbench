import type {MetricData} from 'dsh-agent-manage/aps-compute/metrics';
import {period} from './gea-workspace';
/** Fixed mock facts from the original literal adapter regression. No business transport. */
export async function readMockWorkspace(input:{date:string;granularity:string;signal?:AbortSignal;comparison?:boolean}) {
 input.signal?.throwIfAborted();
 const [start,end]=period(input.date,input.granularity);
 const data:MetricData & {realData:false;simulated:true;readAt:string;limitations:string[]}={start,end,granularity:input.granularity,realData:false,simulated:true,readAt:'2026-08-30T00:00:00.000Z',
 sections:[
 {id:'stock',status:'ready',rows:[{base:'华东',category:'饼类',inventory:20000,demand:2000},{base:'华南',category:'饼类',inventory:10000,demand:1000}]},
 {id:'orders',status:'ready',rows:[{base:'华东',category:'饼类',demand:100,shortage:10,invalid:0},{base:'华南',category:'饼类',demand:900,shortage:0,invalid:0}]},
 {id:'finance',status:'ready',rows:[{month:end.slice(0,7).replace('-',''),region:'华东',actual:110,invalid:0},{month:end.slice(0,7).replace('-',''),region:'华南',actual:50,invalid:0}]},
 {id:'sales-budget',status:'ready',rows:[{month:end.slice(0,7).replace('-',''),region:'华东',budget:100,invalid:0},{month:end.slice(0,7).replace('-',''),region:'华南',budget:100,invalid:0}]},
 {id:'demand-accuracy',status:'empty',rows:[]},{id:'sales-accuracy',status:'empty',rows:[]},{id:'shippable',status:'empty',rows:[]}
 ],limitations:['固定模拟输入，不是真实经营数据。','生产实绩、预测、日发货与对比期未提供，不补零。','没有真实SQL、模型任务或业务回写。']};
 await Promise.resolve();input.signal?.throwIfAborted();
 return input.comparison?{previous:null,annual:null}:data;
}
