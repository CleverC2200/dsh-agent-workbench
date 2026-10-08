import {useEffect, useRef} from "react";
import {action, publish} from "../channel.js";
import {updateContext, removeContextPart, pageContext} from "./context";

/** Qll's current view fields; GEA validates the resulting query's authorization. */
export function usePageFilter(current: any, apply: (args: any) => void) {
  const ref=useRef({current,apply});
  ref.current={current,apply};
  useEffect(()=>{updateContext("pageFilters",current);},[JSON.stringify(current)]);
  useEffect(()=>{
    return action("filter","筛选全链页；先读 context.parts.pageFilters，仅传 tab、scope、month、search 中需要改变的字段。search 为完整 SKU 编码。不会修改业务数据。",async(input:any,options:{signal?:AbortSignal}={})=>{
      options.signal?.throwIfAborted();
      if(!input || typeof input!=="object" || Array.isArray(input))throw Error("筛选参数必须为对象");
      const {current:c,apply}=ref.current;
      if(Object.keys(input).some(key=>!c.allowedFields.includes(key)))throw Error("不支持的筛选字段");
      if(input.tab!==undefined && !c.tabs.includes(input.tab))throw Error("页签无效");
      if(input.scope!==undefined && input.scope!=="company")throw Error("查询范围无效");
      if(input.month!==undefined && (typeof input.month!=="string" || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(input.month)))throw Error("月份无效");
      if(input.search!==undefined && (typeof input.search!=="string" || input.search.length>100))throw Error("SKU 编码无效");
      const values={...input,...(input.search!==undefined?{search:input.search.trim()}:{})};
      const changed=Object.fromEntries(Object.entries(values).filter(([key,value])=>value!==c[key]));
      if(!Object.keys(changed).length)return {unchanged:true};
      if(Object.keys(changed).some(key=>key!=="tab")){
        for(const key of ["fullChainWorkspace","structureView","detail","selectedStock","trendView"])removeContextPart(key);
        updateContext("queryState",{state:"loading",requested:changed});
        await publish(pageContext());
      }
      options.signal?.throwIfAborted();
      apply(changed);
      return {querying:Object.keys(changed).some(key=>key!=="tab"),requested:changed,notice:"读取改动后上下文确认结果"};
    });
  },[]);
}
