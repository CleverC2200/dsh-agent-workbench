import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

export function deliveryOperationsPlugin() {
  return {
    name: 'delivery-operations-document',
    setup(api) {
      api.onLoad({ filter: /[/\\]delivery-operations\.html$/ }, async ({ path }) => {
        const original = await readFile(path, 'utf8');
        const scripts = [...original.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
        const application = scripts.at(-1);
        const dataStart = application[1].indexOf('const D = ');
        const dataEnd = application[1].indexOf('\n', dataStart);
        const sourceData = JSON.parse(
          application[1]
            .slice(dataStart + 10, dataEnd)
            .trim()
            .replace(/;$/, ''),
        );
        const shape = Object.fromEntries(
          Object.entries(sourceData).map(([key, value]) => [
            key,
            Array.isArray(value) ? [] : value && typeof value === 'object' ? {} : null,
          ]),
        );
        Object.assign(shape, {
          meta: { period: '', generated: '' },
          rate90above: {},
          shortKPI: { all: {}, byBase: {} },
          rateDist: Object.fromEntries(Object.keys(sourceData.rateDist).map((key) => [key, {}])),
          rateDistLabels: sourceData.rateDistLabels,
          rateKeys: sourceData.rateKeys,
        });
        const templates = Object.fromEntries(
          [
            'baseProgress',
            'areaProgress',
            'sku',
            'warehouse',
            'orderDetail',
            'unopenPickup',
            'unopenOrg',
            'unopenTime',
            'unopenOrgItem',
            'unopenCustReason',
            'unopenPickupReason',
          ].map((key) => [key, sourceData[key][0]]),
        );
        const scrub = (value) =>
          typeof value === 'number'
            ? null
            : Array.isArray(value)
              ? value.map(scrub)
              : value && typeof value === 'object'
                ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, scrub(item)]))
                : '';
        let render = application[1].slice(dataEnd).replace(/boot\(\);\s*$/, '');
        render = render.replace(
          'n=Number(n)||0;',
          'if(n==null||n===""||!Number.isFinite(Number(n)))return "—";n=Number(n);',
        );
        render = render.replace(
          /const pctNum =[^\n]+/,
          'const pctNum = n => n==null||n===""||!Number.isFinite(Number(n))?"—":(Number(n)*100).toFixed(1);',
        );
        render = render.replace(
          /const fv =[^\n]+/,
          'const fv = n => n==null||n===""||!Number.isFinite(Number(n))?"—":(Number(n)/10000).toLocaleString("zh-CN",{maximumFractionDigits:8});',
        );
        render = render.replace(
          /const num =[^\n]+/,
          'const num = n => n==null||n===""||!Number.isFinite(Number(n))?"—":Number(n).toLocaleString("zh-CN",{maximumFractionDigits:0});',
        );
        render = render.replace(
          /const pct =[^\n]+/,
          'const pct = n => pctNum(n)==="—"?"—":pctNum(n)+"%";',
        );
        render = render.replace(
          /const pp =[^\n]+/,
          'const pp = n => pctNum(n)==="—"?"—":pctNum(n)+"pp";',
        );
        render = render.replace(
          /const sum =[^\n]+/,
          'const sum = (arr,k) => {const values=arr.map(x=>typeof k==="function"?k(x):k==null?x:x?.[k]);return values.length&&values.every(v=>v!=null&&v!==""&&Number.isFinite(Number(v)))?values.reduce((s,v)=>s+Number(v),0):NaN;};',
        );
        render = render.replace(
          "let v=c.fmt?c.fmt(x[c.k],x):(x[c.k]==null?'':x[c.k]);",
          'let v=c.fmt?c.fmt(x[c.k],x):(x[c.k]==null?"—":x[c.k]);',
        );
        render = render.replace(
          'tot:RATE_DEF.reduce((s,rr)=>s+((D.baseRate[x.base]||{})[rr.k]||0),0)',
          'tot:RATE_DEF.every(rr=>Number.isFinite(D.baseRate[x.base]?.[rr.k]))?RATE_DEF.reduce((s,rr)=>s+D.baseRate[x.base][rr.k],0):NaN',
        );
        render = render.replace(
          'const q=z.r[r.k]||0;return +(z.tot?q/z.tot*100:0).toFixed(1);',
          'const q=z.r[r.k];return Number.isFinite(q)&&z.tot>0?+(q/z.tot*100).toFixed(1):NaN;',
        );
        render = render.replace(
          'const keys=Object.keys(distMap).sort',
          'const keys=Object.keys(distMap).filter(k=>RATE_DEF.every(r=>Number.isFinite(distMap[k]?.[r.k]))).sort',
        );
        render = render.replace('distMap[k][r.k]||0', 'distMap[k][r.k]');
        render = render.replace(
          'const top=[...D.unopenOrg].sort',
          'const top=D.unopenOrg.filter(x=>Number.isFinite(x.total.qty)).sort',
        );
        render = render.replace(
          'const top=[...D.unopenPickup].sort',
          "const top=D.unopenPickup.filter(x=>Number.isFinite(x.total.qty)&&['dealer','direct','transfer','dc'].every(k=>Number.isFinite(x[k].qty))).sort",
        );
        render = render.replace(
          'const agg=items.map(it=>({item:it,qty:Math.round(D.unopenOrgItem.reduce((s,x)=>s+(x[it]?x[it].qty:0),0)),',
          'const agg=items.map(it=>({item:it,qty:Math.round(D.itemUnopenCoverage?.[it]?.qty.covered>0?D.itemUnopenCoverage[it].qty.quantity:NaN),',
        );
        render = render.replace(
          'unp:Math.round(D.unopenOrgItem.reduce((s,x)=>s+(x[it]?x[it].unprepared:0),0))',
          'unp:Math.round(D.itemUnopenCoverage?.[it]?.unprepared.covered>0?D.itemUnopenCoverage[it].unprepared.quantity:NaN)',
        );
        render = render.replace(
          'x.plan?+(x.salesShip/x.plan*100).toFixed(1):0',
          'Number.isFinite(x.plan)&&x.plan>0&&Number.isFinite(x.salesShip)?+(x.salesShip/x.plan*100).toFixed(1):NaN',
        );
        render = render.replace(
          'const el=$(id);if(!el)return;',
          "const el=$(id);if(!el)return;const hasValues=(opt.series||[]).some(s=>(s.data||[]).some(p=>Number.isFinite(p&&typeof p==='object'?p.value:p)));if(!D.liveCharts?.includes(id)||!hasValues){if(CH[id]){CH[id].dispose();delete CH[id];}el.textContent='—';return;}if(['c_base_rate','c_rate_dist','c_wh_stack'].includes(id))el.title='仅显示完整可判定分组或已知独立序列，其他分组缺值不补零';if(CH[id]&&CH[id].getDom()!==el){CH[id].dispose();delete CH[id];}opt.tooltip={...opt.tooltip,renderMode:'richText'};",
        );
        render = render.replace(
          "$('mCheck').textContent=bad?('存在 '+bad+' 项差异'):'7/7 项合计对平 ✓';",
          "$('mCheck').textContent=D.readStatus||'等待当前用户授权数据';",
        );
        render = render.replace(
          "opt.tooltip={...opt.tooltip,renderMode:'richText'};",
          "if(['c_un_pk','c_un_org','c_un_rsn2','c_un_cust'].includes(id))el.title='仅显示可判定分组或独立序列；缺失值留空，不补零；TOP排名仅在完整可判定分组内比较';if(id==='c_un_item')el.title='品项数量有效明细小计，与品项汇总相同；数量缺失、品项不明的明细未计入，不代表全量占比';opt.tooltip={...opt.tooltip,renderMode:'richText'};",
        );
        render = render.replace('const orderShould=0.7667;', 'const orderShould=NaN;');
        render = render.replace(
          'const o=Object.assign({key,planDms:',
          'const o=Object.assign({key,orderSources:rows.flatMap(row=>row.orderSources||[]),planDms:',
        );
        render = render.replace(
          /markLine:\{silent:true,symbol:'none',data:\[\{yAxis:73\.3,[^\n]+/,
          'markLine:undefined}',
        );
        render = render.replace(
          /function rateCols\(getRate\)\{[\s\S]*?\n\}/,
          `function rateCols(getRate){return RATE_DEF.map(r=>({k:r.k,label:r.n+'(万)',fmt:(v,x)=>{const values=getRate(x)||{},q=values[r.k];if(!Number.isFinite(q))return '—';if(q===0)return '0';const total=RATE_DEF.reduce((sum,field)=>sum+values[field.k],0);const cls=r.k==='rateBelow70'?'neg':r.k==='rate95'?'pos':'';return '<span class="'+cls+'">'+fv(q)+'</span>'+(Number.isFinite(total)&&total>0?' <span style="color:#94a3b8;font-size:10px">'+(q/total*100).toFixed(0)+'%</span>':'');},raw:(v,x)=>Number.isFinite(getRate(x)?.[r.k])?getRate(x)[r.k]:''}));}`,
        );
        render = render.replace(
          'function itemVal(metric,idx){const r=D.dailyItem.find(x=>x.metric===metric);return r?(r.vals[idx]||0):0;}',
          'function itemVal(metric,idx){const r=D.dailyItem.find(x=>x.metric===metric);return r?r.vals[idx]:NaN;}',
        );
        const client = await build({
          entryPoints: [
            fileURLToPath(new URL('./operations-original-adapter.js', import.meta.url)),
          ],
          bundle: true,
          write: false,
          format: 'iife',
          platform: 'browser',
          target: 'es2022',
        });
        const bootstrap =
          'let D=' +
          JSON.stringify(shape) +
          ';const ORIGINAL_TEMPLATES=' +
          JSON.stringify(scrub(templates)) +
          ';';
        const html =
          original
            .slice(0, application.index)
            .replace(
              '</head>',
              '<style id="delivery-operations-table-fix">.tbl-scroll{isolation:isolate} .tbl-scroll table{border-collapse:separate;border-spacing:0} .tbl-scroll thead th{position:sticky;top:0;z-index:3;background:#f8fafc} .tbl-scroll tbody td:first-child{position:sticky;left:0;z-index:1;background:#f8fafc} .tbl-scroll thead th:first-child{left:0;z-index:4}</style></head>',
            )
            .replace(
              '</head>',
              '<style id="delivery-operations-layout-fix">#kpis > .kpi.wide { grid-column: 1 / -1; } #skpis { grid-template-columns: repeat(4, minmax(0, 1fr)) !important; } #skpis .kpi { min-width: 0; padding: 16px 18px; } #skpis .lbl { min-height: 34px; align-items: flex-start; } #skpis .val { white-space: nowrap; line-height: 1.25; margin: 10px 0 8px; } #skpis .foot { display: block; min-height: 34px; line-height: 1.55; } #f_shortage label { min-width: 0; } #f_shortage select { width: 160px; min-width: 0; max-width: 100%; } #f_shortage #sf_base { width: 200px; } @media (max-width: 1100px) { #skpis { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; } } @media (max-width: 600px) { #kpis, #skpis { grid-template-columns: minmax(0, 1fr) !important; } #f_shortage label { flex: 1 1 100%; justify-content: space-between; } #f_shortage select, #f_shortage #sf_base, #f_shortage input { width: 70% !important; } }</style></head>',
            ) +
          '<script>' +
          bootstrap +
          render +
          client.outputFiles[0].text.replace(/<\/script/gi, '<\\/script') +
          '</script>' +
          original.slice(application.index + application[0].length);
        return {
          contents: 'export default ' + JSON.stringify(gzipSync(html).toString('base64')) + ';',
          loader: 'js',
        };
      });
    },
  };
}
