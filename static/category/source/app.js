import { AuthorQuestions, useAuthorQuote } from '../../../business/shared/author-questions.js';
import { createPageViewState, usePageViewField } from '../../../business/shared/view-state.js';
import { publish, reportElements, currentSessionId } from '../../../business/shared/channel.js';
const categoryView = createPageViewState('plan-region-category');
function O1(e, t) {
  return t == null || e.target == null
    ? { label: '\u76EE\u6807\u672A\u62A5\u5907', tone: 'warn' }
    : (e.dir === 'up' ? t >= e.target : t <= e.target)
      ? { label: '\u8FBE\u6807', tone: 'ok' }
      : (e.dir === 'up' ? (e.target - t) / e.target : (t - e.target) / e.target) <= 0.02
        ? { label: '\u4E34\u754C', tone: 'warn' }
        : { label: '\u672A\u8FBE\u6807', tone: 'risk' };
}
function d8(e, t) {
  if (t == null || e.target == null || e.target === 0) return null;
  const n = e.dir === 'up' ? t / e.target : e.target / t;
  return Math.max(0, Math.min(100, Math.round(n * 1e3) / 10));
}
// prettier-ignore
const Yt = [{ key: "tangyuan", name: "\u6C64\u5706", ownerBase: "\u90D1\u5DDE\u3001\u9042\u5E73", planTons: 2480, shipTons: 2318, produceTons: 2352, baseStockTons: 964, hubStockTons: 512, dealerStockTons: 510, dailyShip: 82.6, rccpRate: 98, gapTons: 0, dealerShort: 3, dealerMinDays: 5.8, overDaysSkus: 0, overstockTons: 22, unmetOrders: 6, aiBaselineTons: 2410, reportedTons: 2480, kpi: { order: 92.4, forecast: 78.4, turnover: 11.4, chainTurnover: 26.4, freshness: 96.1 } }, { key: "zongzi", name: "\u7CBD\u5B50", ownerBase: "\u9042\u5E73", planTons: 1120, shipTons: 1036, produceTons: 1006, baseStockTons: 268, hubStockTons: 128, dealerStockTons: 90, dailyShip: 34.5, rccpRate: 86, gapTons: 124, dealerShort: 0, dealerMinDays: 11.4, overDaysSkus: 0, overstockTons: 6, unmetOrders: 14, aiBaselineTons: 1088, reportedTons: 1120, kpi: { order: 84.2, forecast: 73.6, turnover: 13.2, chainTurnover: 31.8, freshness: 94.2 } }, { key: "shuijiao", name: "\u6C34\u997A", ownerBase: "\u90D1\u5DDE\u3001\u9042\u5E73", planTons: 5640, shipTons: 5412, produceTons: 5566, baseStockTons: 1686, hubStockTons: 986, dealerStockTons: 448, dailyShip: 180.4, rccpRate: 99, gapTons: 0, dealerShort: 0, dealerMinDays: 9.2, overDaysSkus: 0, overstockTons: 38, unmetOrders: 22, aiBaselineTons: 5120, reportedTons: 6052, kpi: { order: 93.1, forecast: 79.1, turnover: 10.8, chainTurnover: 24.7, freshness: 97.3 } }, { key: "mianmo", name: "\u9762\u70B9", ownerBase: "\u90D1\u5DDE\u3001\u6E56\u5DDE", planTons: 1860, shipTons: 1744, produceTons: 1710, baseStockTons: 742, hubStockTons: 386, dealerStockTons: 284, dailyShip: 58.1, rccpRate: 100, gapTons: 0, dealerShort: 0, dealerMinDays: 13.6, overDaysSkus: 3, overstockTons: 48, unmetOrders: 18, aiBaselineTons: 1802, reportedTons: 1860, kpi: { order: 89.4, forecast: 76.9, turnover: 12.9, chainTurnover: 29.2, freshness: 93.6 } }, { key: "tiaolirou", name: "\u8C03\u7406\u8089", ownerBase: "\u6FEE\u9633", planTons: 940, shipTons: 872, produceTons: 838, baseStockTons: 402, hubStockTons: 148, dealerStockTons: 70, dailyShip: 29.1, rccpRate: 94, gapTons: 32, dealerShort: 0, dealerMinDays: 10.8, overDaysSkus: 0, overstockTons: 18, unmetOrders: 9, aiBaselineTons: 918, reportedTons: 940, kpi: { order: 87.1, forecast: 74.8, turnover: 12.6, chainTurnover: 27.6, freshness: 95 } }], Pn = (e) => Math.round(e * 10) / 10;
function ph(e) {
  const t = e ? Yt.filter((f) => f.key === e) : Yt,
    n = (f) => t.reduce((d, v) => d + v[f], 0),
    r = n('planTons'),
    a = n('shipTons'),
    i = n('produceTons'),
    l = n('baseStockTons') + n('hubStockTons') + n('dealerStockTons'),
    o = n('baseStockTons'),
    u = Pn(n('dailyShip')),
    s = r ? Pn(t.reduce((f, d) => f + d.rccpRate * d.planTons, 0) / r) : 0;
  return {
    rows: t,
    categoryCount: t.length,
    planTons: r,
    shipTons: a,
    produceTons: i,
    achieveRate: r ? Pn((a / r) * 100) : 0,
    dealRate: a ? Pn((i / a) * 100) : 0,
    chainStock: l,
    baseStock: o,
    dailyShip: u,
    chainDays: u ? Pn(l / u) : 0,
    baseDays: u ? Pn(o / u) : 0,
    rccpRate: s,
    rccpShortRate: Pn(100 - s),
    gapTons: n('gapTons'),
    overstockTons: n('overstockTons'),
    unmetOrders: n('unmetOrders'),
    dealerShort: n('dealerShort'),
    overDaysSkus: n('overDaysSkus'),
    deviation: Pn(t.reduce((f, d) => f + (d.reportedTons - d.aiBaselineTons), 0)),
  };
}
function v8(e) {
  return e.aiBaselineTons ? Pn(((e.reportedTons - e.aiBaselineTons) / e.aiBaselineTons) * 100) : 0;
}
function ef(e) {
  const t = e ? Yt.filter((o) => o.key === e) : Yt,
    n = (o, u) => {
      const s = t.reduce((f, d) => f + d[u], 0);
      return s ? Pn(t.reduce((f, d) => f + d.kpi[o] * d[u], 0) / s) : null;
    },
    r = t.reduce((o, u) => o + (u.baseStockTons + u.hubStockTons + u.dealerStockTons), 0),
    a = t.reduce((o, u) => o + u.baseStockTons, 0),
    i = {
      order: n('order', 'planTons'),
      forecast: n('forecast', 'planTons'),
      turnover: n('turnover', 'baseStockTons'),
      chainTurnover: r
        ? Pn(
            t.reduce(
              (o, u) =>
                o + u.kpi.chainTurnover * (u.baseStockTons + u.hubStockTons + u.dealerStockTons),
              0,
            ) / r,
          )
        : null,
      freshness: a ? Pn(t.reduce((o, u) => o + u.kpi.freshness * u.baseStockTons, 0) / a) : null,
    },
    l = {};
  return (
    Dr.forEach((o) => {
      const u = rt[o],
        s = i[o];
      l[o] = {
        key: o,
        def: u,
        value: s,
        status: O1(u, s),
        attainment: d8(u, s),
        rows: t.map((f) => ({ key: f.key, name: f.name, value: f.kpi[o] })),
      };
    }),
    l
  );
}
function _p8(e) {
  return (e ? Yt.filter((n) => n.key === e) : Yt).map((n) => ({
    key: n.key,
    name: n.name,
    base: n.baseStockTons,
    hub: n.hubStockTons,
    dealer: n.dealerStockTons,
    total: n.baseStockTons + n.hubStockTons + n.dealerStockTons,
    days: Pn((n.baseStockTons + n.hubStockTons + n.dealerStockTons) / n.dailyShip),
    dealerDays: n.dealerMinDays,
    overstock: n.overstockTons,
    freshness: n.kpi.freshness,
  }));
}
function _m8(e) {
  return (e ? Yt.filter((n) => n.key === e) : Yt).map((n) => ({
    key: n.key,
    name: n.name,
    base: n.ownerBase,
    plan: n.planTons,
    rccp: n.rccpRate,
    gap: n.gapTons,
    baseline: n.aiBaselineTons,
    reported: n.reportedTons,
    dev: v8(n),
  }));
}
// prettier-ignore
const fp = [{ id: "ev-zongzi-cap", level: "p1", type: "risk", category: "zongzi", kpi: "order", time: "09-21 08:20", status: "open", owner: "\u54C1\u7C7B\u8BA1\u5212\u5458 \xB7 \u57FA\u5730\u8BA1\u5212\u5458", overdue: false, title: "\u7CBD\u5B50\u4EA7\u80FD\u7F3A\u53E3\u5C06\u62C9\u4F4E\u54C1\u7C7B\u8BA2\u5355\u6EE1\u8DB3\u7387", desc: "\u9042\u5E73\u96A7\u9053\u8D1F\u8377\u8D85\u4E0A\u9650\uFF0C10 \u6708\u9700\u6C42\u8BA1\u5212 1,120 \u5428\u4E2D\u6709 124 \u5428\u65E0\u6CD5\u6392\u4EA7\uFF1B\u6309\u7F3A\u8D27\u53E3\u5F84\u5C06\u76F4\u63A5\u8BA1\u5165\u672A\u6EE1\u8DB3\u8BA2\u5355\u3002", trigger: "RCCP \u53EF\u6EE1\u8DB3\u91CF < \u9700\u6C42\u8BA1\u5212\u91CF\uFF0C\u7F3A\u53E3 \u2265 \u54C1\u7C7B\u6708\u5EA6\u9700\u6C42 5%\uFF08124 / 1,120 = 11.1%\uFF09\uFF1B\u8BE5\u54C1\u7C7B\u8BA2\u5355\u6EE1\u8DB3\u7387 84.2% \u5DF2\u660E\u663E\u4F4E\u4E8E 91% \u76EE\u6807\u7EBF\u3002", evidence: [["\u6307\u6807\u73B0\u72B6", "\u7CBD\u5B50\u539F\u59CB\u8BA2\u5355\u6EE1\u8DB3\u7387 84.2%\uFF0C\u76EE\u6807 91%\uFF1B\u672C\u6708\u7D2F\u8BA1\u672A\u6EE1\u8DB3\u8BA2\u5355 14 \u5F20"], ["\u9700\u6C42\u57FA\u7EBF", "10 \u6708\u7CBD\u5B50\u9700\u6C42\u8BA1\u5212 1,120 \u5428\uFF08\u6765\u6E90\uFF1A\u8425\u9500\u4E2D\u5FC3\u6708\u6EDA\u52A8\u8BA1\u5212\uFF0C\u7248\u672C V3\uFF09"], ["\u4EA7\u80FD\u6838\u7B97", "\u9042\u5E73\u96A7\u9053\u6807\u51C6\u751F\u4EA7\u65E5\u8D1F\u8377 42 \u5428/\u65E5\uFF0C\u9700\u751F\u4EA7\u65E5 26.7 \u5929\uFF0C\u8D85\u51FA\u5F53\u6708\u53EF\u7528 22 \u5929"], ["\u53EF\u7528\u4F59\u91CF", "\u90D1\u5DDE\u540C\u7C7B\u96A7\u9053\u4F59\u91CF 168 \u5428\uFF0C\u6E56\u5DDE\u4F59\u91CF 40 \u5428"]], next: "\u5728 10 \u6708\u6708\u521D\u8BC4\u4F30\u542F\u52A8\u524D\u5F62\u6210\u8DE8\u57FA\u5730\u4EA7\u80FD\u8C03\u5242\u65B9\u6848\uFF0C\u907F\u514D\u7F3A\u53E3\u8F6C\u5316\u4E3A\u7F3A\u8D27\u4E0E\u8BA2\u5355\u672A\u6EE1\u8DB3\u3002" }, { id: "ev-tangyuan-dealer", level: "p1", type: "risk", category: "tangyuan", kpi: "order", time: "09-21 07:40", status: "open", owner: "\u5BA2\u6237\u7ECF\u7406 \xB7 \u54C1\u7C7B\u8BA1\u5212\u5458", overdue: false, title: "\u6C64\u5706\u7ECF\u9500\u5546\u7AEF\u65AD\u8D27\u8BA2\u5355\u5DF2\u53D1\u751F", desc: "\u534E\u4E1C 3 \u5BB6\u7ECF\u9500\u5546\u5168\u94FE\u53EF\u552E 5.8 \u5929\uFF0C\u5176\u4E2D 1 \u5BB6\u5DF2\u51FA\u73B0\u65AD\u8D27\u8BA2\u5355\uFF0C\u5C06\u76F4\u63A5\u62C9\u4F4E\u539F\u59CB\u8BA2\u5355\u6EE1\u8DB3\u7387\u3002", trigger: "\u5168\u94FE\u53E3\u5F84\uFF08\u57FA\u5730\u4ED3 + \u5206\u4ED3 + \u7ECF\u9500\u5546\u7AEF\uFF09\u5355\u4E2A\u5BA2\u6237\u53EF\u552E\u5929\u6570 < 7 \u5929\uFF1B\u540C\u65F6\u51FA\u73B0\u5B9E\u9645\u53D1\u8D27\u91CF < \u539F\u59CB\u8BA2\u5355\u91CF\u7684\u8BB0\u5F55\u3002", evidence: [["\u6307\u6807\u73B0\u72B6", "\u6C64\u5706\u539F\u59CB\u8BA2\u5355\u6EE1\u8DB3\u7387 92.4%\uFF0C\u76EE\u6807 91%\uFF1B\u5DF2\u51FA\u73B0 6 \u5F20\u672A\u6EE1\u8DB3\u8BA2\u5355"], ["\u77ED\u7F3A\u5BA2\u6237", "\u90D1\u5DDE\u534E\u4E30\u5546\u8D38 4.2 \u5929\u3001\u6D1B\u9633\u6052\u8FBE\u98DF\u54C1 5.6 \u5929\u3001\u65B0\u4E61\u4F73\u79BE\u5546\u8D38 6.4 \u5929"], ["\u5728\u9014\u60C5\u51B5", "3 \u5BB6\u5408\u8BA1\u5728\u9014 186 \u5428\uFF0C\u5176\u4E2D 42 \u5428\u9884\u8BA1\u5230\u8D27\u65F6\u95F4\u5F85\u9500\u552E\u786E\u8BA4"], ["\u53E3\u5F84\u63D0\u793A", "\u8C03\u6574\u53D1\u8D27\u91CF\u6216\u4E92\u6362\u5355\u54C1\u53D1\u8D27\u91CF\u5747\u89C6\u4E3A\u672A\u6EE1\u8DB3\u9700\u6C42\uFF0C\u4E0D\u80FD\u901A\u8FC7\u8C03\u8D26\u89C4\u907F"]], next: "\u5148\u6838\u5B9E\u5728\u9014\u6709\u6548\u6027\uFF0C\u518D\u6309\u53EF\u552E\u5929\u6570\u5347\u5E8F\u786E\u5B9A\u53D1\u8D27\u987A\u5E8F\u4E0E\u5206\u4ED3\u8C03\u51FA\u91CF\u3002" }, { id: "ev-shuijiao-dev", level: "p2", type: "co", category: "shuijiao", kpi: "forecast", time: "09-20 17:10", status: "open", owner: "\u7701\u533A\u7ECF\u7406", overdue: true, title: "\u6C34\u997A\u9700\u6C42\u4E0A\u62A5\u504F\u79BB AI \u57FA\u7EBF 18.2%", desc: "\u534E\u4E1C\u5927\u533A 10 \u6708\u6C34\u997A\u4E0A\u62A5 6,052 \u5428\u3001AI \u57FA\u7EBF 5,120 \u5428\uFF0C\u504F\u5DEE 932 \u5428\u4E14\u672A\u9644\u6D3B\u52A8\u8BC1\u636E\uFF0C\u6270\u52A8\u8BA1\u5212\u51C6\u786E\u7387\u7684\u504F\u5DEE\u91CF\u3002", trigger: "|\u4E0A\u62A5 \u2212 AI \u57FA\u7EBF| \xF7 AI \u57FA\u7EBF > 15%\uFF0C\u4E14\u4E0A\u62A5\u8BB0\u5F55\u65E0\u6D3B\u52A8\u8BC1\u636E\u4E0E\u65F6\u95F4\u7A97\uFF1B\u504F\u5DEE\u91CF\u6309 MAX(\u4E0B\u5355\u91CF, \u53D1\u8D27\u91CF) \u2212 \u8BA1\u5212\u91CF \u8BA1\u5165\u51C6\u786E\u7387\u5206\u5B50\u3002", evidence: [["\u6307\u6807\u73B0\u72B6", "\u9700\u6C42\u8BA1\u5212\u51C6\u786E\u7387 77.8%\uFF0C\u76EE\u6807 78%\uFF0C\u5904\u4E8E\u4E34\u754C\uFF1B\u672C\u6708\u6700\u5927\u5355\u4E00\u504F\u5DEE\u6765\u6E90\u5373\u6B64\u533A\u57DF"], ["\u57FA\u7EBF vs \u4E0A\u62A5", "AI \u57FA\u7EBF 5,120 \u5428\uFF08\u6A21\u578B\u7248\u672C D-2026.09\uFF09\uFF0F\u9500\u552E\u4E0A\u62A5 6,052 \u5428\uFF08\u539F\u56E0\u7801\uFF1A\u5E02\u573A\u56DE\u6696\uFF0C\u65E0\u660E\u7EC6\uFF09"], ["\u504F\u5DEE\u5F71\u54CD", "\u504F\u5DEE 932 \u5428\u7EA6\u5F53\u62AC\u9AD8 \u03A3|\u5355\u54C1\u504F\u5DEE\u91CF|\uFF0C\u76F4\u63A5\u538B\u7F29\u51C6\u786E\u7387"], ["\u5E93\u5B58\u8FDE\u5E26", "\u82E5\u6309\u4E0A\u62A5\u503C\u8BC4\u4F30\uFF0C\u6C34\u997A\u5E93\u5B58\u5468\u8F6C\u5C06\u7531 10.8 \u5929\u5347\u81F3 12.4 \u5929\uFF0C\u903C\u8FD1 11 \u5929\u76EE\u6807\u7EBF"]], next: "\u9000\u56DE\u534E\u4E1C\u5927\u533A\u8865\u5145\u5BA2\u6237\u7EA7\u4F9D\u636E\u4E0E\u65F6\u95F4\u7A97\uFF0C\u8865\u9F50\u540E\u8FDB\u5165\u57CE\u5E02\u2014\u7701\u533A\u2014\u5927\u533A\u5206\u7EA7\u786E\u8BA4\u3002" }, { id: "ev-mianmo-calendar", level: "p2", type: "plan", category: "mianmo", kpi: "forecast", time: "09-21 06:30", status: "open", owner: "\u54C1\u7C7B\u8BA1\u5212\u5458", overdue: false, title: "\u9762\u70B9\u6708\u521D\u8BC4\u4F30\u6570\u636E\u51C6\u5907\u672A\u542F\u52A8", desc: "\u90D1\u5DDE\u3001\u9042\u5E73\u9762\u70B9 9 \u6708 26 \u65E5\u6708\u521D\u8BC4\u4F30\u5C1A\u6709 5 \u5929\uFF0C\u671F\u521D\u5E93\u5B58\u63A8\u7B97\u4E0E\u8BC4\u4F30\u6570\u636E\u5305\u5747\u672A\u63D0\u4EA4\uFF0C\u5C06\u987A\u5EF6 RCCP \u4E0E\u4E0B\u6708\u8BA1\u5212\u53E3\u5F84\u3002", trigger: "\u8BA1\u5212\u65E5\u5386 T\u22125 \u63D0\u9192\uFF1A\u6708\u521D\u8BC4\u4F30\u6570\u636E\u51C6\u5907\uFF08\u6392\u4EA7\u3001\u53D1\u8D27\u3001\u5728\u9014\u3001\u8FDB\u9500\u5B58\u3001\u5E74\u5EA6\u8BC4\u4F30\u8868\uFF09\u672A\u5B8C\u6210\u3002", evidence: [["\u8282\u70B9", "\u90D1\u5DDE / \u9042\u5E73\u9762\u70B9\u6708\u521D\u8BC4\u4F30 09-26\uFF1B\u6E56\u5DDE / \u5E7F\u5DDE / \u56DB\u5DDD 09-25"], ["\u7F3A\u5931\u9879", "10 \u6708\u671F\u521D\u5E93\u5B58\u63A8\u7B97\u3001\u8C03\u62E8\u5728\u9014\u660E\u7EC6\u3001\u5E74\u5EA6\u81EA\u4EA7/\u8C03\u62E8/\u5916\u534F\u89C4\u5212\u786E\u8BA4"], ["\u6307\u6807\u8FDE\u5E26", "\u8BC4\u4F30\u987A\u5EF6\u5C06\u63A8\u8FDF 10 \u6708\u8BA1\u5212\u51BB\u7ED3\uFF0C\u76F4\u63A5\u5F71\u54CD\u4E0B\u6708\u9700\u6C42\u8BA1\u5212\u51C6\u786E\u7387\u4E0E\u5E93\u5B58\u5468\u8F6C"], ["\u5386\u53F2\u7528\u65F6", "\u6570\u636E\u51C6\u5907\u7EA6 2 \u5C0F\u65F6\uFF0C\u671F\u521D\u5E93\u5B58\u63A8\u7B97\u7EA6 1 \u5C0F\u65F6\uFF0C\u7F16\u5236\u4E0E\u786E\u8BA4\u7EA6 2 \u5C0F\u65F6"]], next: "\u6309\u54C1\u7C7B\u7275\u5934\u542F\u52A8\u9762\u70B9\u8BC4\u4F30\u6570\u636E\u51C6\u5907\uFF0C\u6307\u5B9A\u57FA\u5730\u8BA1\u5212\u5458\u4E0E\u6570\u636E Owner\uFF0C\u9501\u5B9A 09-24 \u524D\u8865\u9F50\u3002" }, { id: "ev-mianmo-stock", level: "p1", type: "risk", category: "mianmo", kpi: "freshness", time: "09-21 07:10", status: "open", owner: "\u54C1\u7C7B\u8BA1\u5212\u5458 \xB7 \u57FA\u5730\u8BA1\u5212\u5458", overdue: false, title: "\u9762\u70B9\u4EA7\u54C1\u65B0\u9C9C\u5EA6\u4F4E\u4E8E\u76EE\u6807 1.9 \u4E2A\u767E\u5206\u70B9", desc: "\u6708\u672B\u8D85\u671F\uFF08\u8D85 60 \u5929\uFF09\u4EA7\u54C1 48 \u5428\uFF0C\u5360\u9762\u70B9\u5DE5\u5382\u4ED3\u5E93\u5B58 6.4%\uFF0C\u4EA7\u54C1\u65B0\u9C9C\u5EA6 93.6% \u4F4E\u4E8E 95.5% \u76EE\u6807\u7EBF\u3002", trigger: "\u5DE5\u5382\u4ED3\u4EA7\u54C1\u65B0\u9C9C\u5EA6 = 1 \u2212 \u5DE5\u5382\u6708\u672B\u8D85\u671F\u4EA7\u54C1\u91CF \xF7 \u603B\u5E93\u5B58\u91CF\uFF1B\u8D85\u671F\u53E3\u5F84\u4E3A\u8D85 60 \u5929\uFF08BP\u3001\u7535\u5546\u3001DC \u4E13\u4F9B\u6309 90 \u5929\uFF09\u3002", evidence: [["\u6307\u6807\u73B0\u72B6", "\u9762\u70B9\u4EA7\u54C1\u65B0\u9C9C\u5EA6 93.6%\uFF0C\u76EE\u6807 95.5%\uFF0C\u7F3A\u53E3 1.9 \u4E2A\u767E\u5206\u70B9"], ["\u8D85\u671F\u6784\u6210", "\u8471\u6CB9\u82B1\u5377 800g\u3001\u624B\u6293\u997C 1kg \u7B49 3 \u4E2A SKU \u5408\u8BA1\u8D85\u671F 48 \u5428"], ["\u5E93\u5B58\u7ED3\u6784", "\u9762\u70B9\u5DE5\u5382\u4ED3\u5E93\u5B58 742 \u5428\uFF0C\u5168\u94FE 1,412 \u5428\uFF1B\u8D85\u671F\u96C6\u4E2D\u5728\u5DE5\u5382\u4ED3\uFF0C\u9700\u4E0E\u5168\u94FE\u53EF\u552E\u5929\u6570\u504F\u9AD8\u533A\u5206"], ["\u53E3\u5F84\u63D0\u793A", "\u8D85\u671F\u6309 60 \u5929\u5224\u5B9A\uFF0C\u4E0E\u300C\u5168\u94FE\u53EF\u552E 45 \u5929\u504F\u9AD8\u63D0\u9192\u300D\u4E0D\u662F\u540C\u4E00\u53E3\u5F84\uFF0C\u4E0D\u53EF\u4E92\u63A8"]], next: "\u6838\u5BF9\u6279\u6B21\u4E0E\u52A8\u9500\uFF0C\u6309\u8D85\u671F\u53E3\u5F84\u5236\u5B9A\u53BB\u5316\u4E0E\u6392\u4EA7\u6536\u53E3\u65B9\u6848\uFF1B\u5E93\u5B58\u504F\u9AD8\u4E0D\u7B49\u4E8E\u4E34\u671F\uFF0C\u4E0D\u4F5C\u964D\u4EF7\u52A8\u4F5C\u3002" }, { id: "ev-chain-target", level: "p3", type: "data", category: null, kpi: "turnover", time: "09-20 22:05", status: "open", owner: "\u6570\u636E Owner \xB7 \u54C1\u7C7B\u8BA1\u5212\u5458", overdue: true, title: "\u5168\u94FE\u5468\u8F6C\u5929\u6570\u76EE\u6807\u503C\u672A\u62A5\u5907\uFF0C\u8282\u70B9\u7ED3\u679C\u65E0\u6CD5\u51FA\u5177", desc: "\u5168\u94FE\u6210\u54C1\u5E93\u5B58\u5468\u8F6C\u5929\u6570\uFF08\u542B\u7ECF\u9500\u5546\uFF09\u76EE\u6807\u503C\u4ECD\u4E3A\u201C\u6309\u5355\u72EC\u5907\u6848\u6267\u884C\u201D\uFF0C\u6838\u7B97\u903B\u8F91\u9A8C\u7B97\u4E2D\uFF0C7\u201410 \u6708\u8282\u70B9\u7ED3\u679C\u65E0\u6CD5\u51FA\u5177\u3002", trigger: "\u7ECF\u7406\u7EA7 KPI \u914D\u7F6E\u7F3A\u5931\uFF1A\u6307\u6807\u5DF2\u751F\u6548\u4F46\u76EE\u6807\u503C\u672A\u62A5\u5907\uFF0C\u5C5E\u6570\u636E\u8D28\u91CF / \u914D\u7F6E\u5B8C\u6574\u6027\u4E8B\u4EF6\u3002", evidence: [["\u6307\u6807\u73B0\u72B6", `\u5168\u94FE\u5468\u8F6C ${ef().chainTurnover.value} \u5929\uFF0C\u76EE\u6807\u503C\u672A\u5907\u6848\uFF0C\u65E0\u6CD5\u5224\u5B9A\u662F\u5426\u8FBE\u6210`], ["\u540C\u671F\u5BF9\u7167", "F25 \u53C2\u7167\uFF1A\u516C\u53F8\u5468\u8F6C 13.94 \u5929\u3001\u7ECF\u9500\u5546\u5468\u8F6C 25.91 \u5929\u3001\u5168\u94FE 27.78 \u5929\uFF0C\u8F83\u540C\u671F\u589E\u52A0 2.183 \u5929"], ["\u53E3\u5F84\u8BF4\u660E", "\u5168\u94FE\u8986\u76D6\u5168\u56FD\u603B\u4ED3 + \u5206\u4ED3 + \u7ECF\u9500\u5546\u4ED3\uFF0C\u4E0E\u5DE5\u5382\u4ED3\u53E3\u5F84\uFF08\u76EE\u6807 11 \u5929\uFF09\u4E0D\u662F\u540C\u4E00\u6307\u6807"], ["\u5F71\u54CD", "\u8BE5\u6307\u6807\u662F\u7ECF\u7406\u7EA7\u6700\u5927\u8003\u6838\u9879\u4E4B\u4E00\uFF0C\u76EE\u6807\u672A\u5907\u6848\u5C06\u4F7F\u4E00\u8282\u70B9\u7ED3\u7B97\u7F3A\u5C11\u8BE5\u9879\u7ED3\u679C"]], next: "\u5B8C\u6210\u5168\u94FE\u5468\u8F6C\u6838\u7B97\u903B\u8F91\u9A8C\u7B97\u5E76\u62A5\u5907\u76EE\u6807\u503C\uFF0C\u907F\u514D\u4E00\u8282\u70B9\u7ED3\u7B97\u7F3A\u9879\uFF1B\u672C\u539F\u578B\u4E0D\u4EE3\u4E3A\u8BBE\u5B9A\u76EE\u6807\u3002" }, { id: "ev-tiaolirou-data", level: "p3", type: "data", category: "tiaolirou", kpi: "turnover", time: "09-20 22:05", status: "open", owner: "\u6570\u636E Owner \xB7 \u7269\u63A7", overdue: false, title: "\u8C03\u7406\u8089\u671F\u521D\u5E93\u5B58\u63A8\u7B97\u4E0D\u5E73 32 \u5428", desc: "\u8C03\u62E8\u5728\u9014\u4E0E\u8FDB\u9500\u5B58\u6570\u636E\u5DEE\u5F02 32 \u5428\uFF08\u5360\u54C1\u7C7B\u5E93\u5B58 5.2%\uFF09\uFF0C\u5F71\u54CD\u5468\u8F6C\u5929\u6570\u5206\u5B50\u4E0E\u671F\u521D\u5E93\u5B58\u53E3\u5F84\u53EF\u4FE1\u5EA6\u3002", trigger: "\u5E93\u5B58\u91CD\u6784\u4E0D\u5E73\u7387 > 5%\uFF0C\u672A\u8FBE\u573A\u666F\u6700\u4F4E\u6570\u636E\u8D28\u91CF\u95E8\u69DB\uFF1B\u5468\u8F6C\u5929\u6570\u4EE5\u6708\u672B\u5E93\u5B58\u4E3A\u5206\u5B50\uFF0C\u53E3\u5F84\u4E0D\u5E73\u5C06\u76F4\u63A5\u6C61\u67D3\u7ED3\u679C\u3002", evidence: [["\u63A8\u7B97\u53E3\u5F84", "\u73B0\u5E93\u5B58 + \u8C03\u62E8\u5165\u5E93\uFF08\u542B\u5728\u9014\uFF09+ \u672C\u6708\u5269\u4F59\u6392\u4EA7 \u2212\uFF08\u9884\u8BA1\u6574\u6708\u53D1\u8FD0 \u2212 \u5DF2\u53D1\u8D27\uFF09\u2212 \u8C03\u62E8\u51FA\u5E93"], ["\u5DEE\u5F02", "\u6FEE\u9633\u8C03\u62E8\u5728\u9014 32 \u5428\u5728 TMS \u4E0E SAP \u8BB0\u5F55\u4E2D\u72B6\u6001\u4E0D\u4E00\u81F4\uFF08\u5DF2\u53D1\u8FD0 vs \u5728\u9014\u672A\u786E\u8BA4\uFF09"], ["\u6307\u6807\u8FDE\u5E26", "\u8C03\u7406\u8089\u5E93\u5B58\u5468\u8F6C 12.6 \u5929\uFF0C\u76EE\u6807 11 \u5929\uFF1B32 \u5428\u8BEF\u5DEE\u7EA6\u5F53\u5F71\u54CD 0.9 \u5929"], ["\u6570\u636E\u95E8\u69DB", "\u4E0D\u5E73\u7387\u672A\u8FBE 2% \u95E8\u69DB\uFF0C\u4E8B\u4EF6\u4E0D\u8FDB\u5165\u65B9\u6848\u751F\u6210\u73AF\u8282"]], next: "\u7531\u6570\u636E Owner \u5F52\u56E0\u5728\u9014\u72B6\u6001\u5DEE\u5F02\uFF1B\u6570\u636E\u672A\u5E73\u524D\uFF0C\u8C03\u7406\u8089\u5468\u8F6C\u4E0E RCCP \u7ED3\u8BBA\u6807\u6CE8\u4E3A\u201C\u5F85\u6838\u9A8C\u201D\u3002" }], h8 = [{ id: "sg-capacity", category: "zongzi", eventIds: ["ev-zongzi-cap"], grade: "A3", confidence: "\u9AD8", kpiKey: "order", title: "\u53D1\u8D77\u7CBD\u5B50\u8DE8\u57FA\u5730\u4EA7\u80FD\u8C03\u5242\uFF08\u9042\u5E73 \u2192 \u90D1\u5DDE\uFF09124 \u5428", target: "\u7CBD\u5B50 \xB7 \u9042\u5E73\u57FA\u5730 \u2192 \u90D1\u5DDE\u57FA\u5730 \xB7 10 \u6708\u6708\u521D\u7248", reason: "\u9042\u5E73\u96A7\u9053\u8D1F\u8377\u8D85\u4E0A\u9650\uFF0C\u90D1\u5DDE\u540C\u7C7B\u96A7\u9053\u4F59\u91CF 168 \u5428\u53EF\u8986\u76D6 124 \u5428\u7F3A\u53E3\uFF1B\u7F3A\u53E3\u4E0D\u6D88\u89E3\u5C06\u76F4\u63A5\u8F6C\u5316\u4E3A\u7F3A\u8D27\uFF0C\u62C9\u4F4E\u8BA2\u5355\u6EE1\u8DB3\u7387\u3002", impact: "\u7F3A\u53E3\u95ED\u5408\u540E\u7CBD\u5B50 RCCP \u6EE1\u8DB3\u7387\u7531 86% \u56DE\u5230 100%\uFF0C\u9884\u8BA1\u53EF\u628A\u8BE5\u54C1\u7C7B\u8BA2\u5355\u6EE1\u8DB3\u7387\u62C9\u56DE\u76EE\u6807\u7EBF\u9644\u8FD1\uFF1B\u540C\u65F6\u589E\u52A0\u57FA\u5730\u95F4\u8C03\u62E8\u8FD0\u8F93\u8D39\u7528\u3002", uncertainty: "\u90D1\u5DDE\u4F59\u91CF\u57FA\u4E8E 9 \u6708\u4F59\u91CF\u7EBF\u6027\u5916\u63A8\uFF0C10 \u6708\u82E5\u6C34\u997A\u9700\u6C42\u4E0A\u6D6E\uFF0C\u4F59\u91CF\u53EF\u80FD\u88AB\u5360\u7528\uFF1B\u8C03\u62E8\u8D39\u7528\u4F1A\u63A8\u9AD8\u4F9B\u5E94\u94FE\u6210\u672C\u3002", action: "\u6388\u6743\u540E\u5411\u53CC\u65B9\u57FA\u5730\u4E0B\u53D1\u8C03\u5242\u4EFB\u52A1\uFF0C\u9042\u5E73\u786E\u8BA4\u51FA\u5E93\u7A97\u53E3\uFF0C\u90D1\u5DDE\u786E\u8BA4\u6362\u7EBF\u65F6\u95F4\u3002", cta: "\u53D1\u8D77\u8C03\u5242\u4EFB\u52A1" }, { id: "sg-replenish", category: "tangyuan", eventIds: ["ev-tangyuan-dealer"], grade: "A2", confidence: "\u9AD8", kpiKey: "order", title: "\u5C06\u534E\u4E1C 3 \u5BB6\u7ECF\u9500\u5546\u7EB3\u5165\u6C64\u5706\u8865\u8D27\u4F18\u5148\u961F\u5217", target: "\u6C64\u5706 \xB7 \u534E\u4E1C \xB7 \u90D1\u5DDE\u534E\u4E30 / \u6D1B\u9633\u6052\u8FBE / \u65B0\u4E61\u4F73\u79BE", reason: "3 \u5BB6\u5BA2\u6237\u5168\u94FE\u53EF\u552E 4.2\u20146.4 \u5929\u4E14\u5DF2\u51FA\u73B0\u672A\u6EE1\u8DB3\u8BA2\u5355\uFF1B\u5206\u4ED3\u53EF\u7528 512 \u5428\u8DB3\u4EE5\u652F\u6491\u672C\u8F6E\u8865\u8D27\uFF0C\u53EF\u963B\u6B62\u6EE1\u8DB3\u7387\u7EE7\u7EED\u4E0B\u6ED1\u3002", impact: "\u4F18\u5148\u961F\u5217\u53EF\u4F7F 3 \u5BB6\u5BA2\u6237\u53EF\u552E\u5929\u6570\u56DE\u5230 10\u201412 \u5929\uFF0C\u51CF\u5C11\u672A\u6EE1\u8DB3\u8BA2\u5355\uFF1B\u5206\u4ED3\u5BF9\u534E\u4E1C\u53EF\u7528\u91CF\u4E0B\u964D 186 \u5428\u3002", uncertainty: "\u5728\u9014 42 \u5428\u5230\u8D27\u65F6\u95F4\u672A\u786E\u8BA4\uFF0C\u82E5\u5EF6\u540E\uFF0C\u4F18\u5148\u961F\u5217\u9700\u91CD\u65B0\u6392\u5E8F\u3002", action: "\u5148\u6838\u5B9E\u5728\u9014\u6709\u6548\u6027\uFF0C\u518D\u6309\u53EF\u552E\u5929\u6570\u5347\u5E8F\u786E\u5B9A\u53D1\u8D27\u987A\u5E8F\u4E0E\u5206\u4ED3\u8C03\u51FA\u91CF\u3002", cta: "\u751F\u6210\u8865\u8D27\u4F18\u5148\u961F\u5217" }, { id: "sg-evidence", category: "shuijiao", eventIds: ["ev-shuijiao-dev"], grade: "A1", confidence: "\u4E2D", kpiKey: "forecast", title: "\u9000\u56DE\u534E\u4E1C\u5927\u533A\u8865\u5145\u6C34\u997A\u4E0A\u62A5\u4F9D\u636E", target: "\u6C34\u997A \xB7 \u534E\u4E1C\u5927\u533A \xB7 10 \u6708\u9700\u6C42\u4E0A\u62A5", reason: "\u4E0A\u62A5\u8F83 AI \u57FA\u7EBF\u504F\u9AD8 18.2%\uFF0C\u8D85\u51FA 15% \u9608\u503C\u4E14\u65E0\u6D3B\u52A8\u8BC1\u636E\uFF1B\u504F\u5DEE\u91CF\u6309\u53E3\u5F84\u76F4\u63A5\u8BA1\u5165\u8BA1\u5212\u51C6\u786E\u7387\uFF0C\u662F\u672C\u6708\u51C6\u786E\u7387\u5904\u4E8E\u4E34\u754C\u7684\u4E3B\u8981\u6765\u6E90\u3002", impact: "\u8865\u9F50\u4F9D\u636E\u540E\u65B9\u53EF\u8FDB\u5165\u5206\u7EA7\u786E\u8BA4\uFF1B\u82E5\u4F9D\u636E\u4E0D\u6210\u7ACB\u3001\u8BA1\u5212\u91CF\u56DE\u5F52\u57FA\u7EBF\uFF0C\u8BE5\u54C1\u7C7B\u8BA1\u5212\u51C6\u786E\u7387\u53EF\u56DE\u5230\u76EE\u6807\u7EBF\u4EE5\u4E0A\u3002", uncertainty: "\u5E02\u573A\u56DE\u6696\u5224\u65AD\u53EF\u80FD\u771F\u5B9E\u5B58\u5728\u4F46\u7F3A\u5C11\u5BA2\u6237\u7EA7\u8BC1\u636E\uFF0C\u672C\u539F\u578B\u4E0D\u505A\u5224\u65AD\uFF0C\u53EA\u8981\u6C42\u8865\u8BC1\u3002", action: "\u751F\u6210\u9000\u56DE\u5355\uFF08\u539F\u56E0\u7801\u5FC5\u586B\uFF09\uFF0C\u9000\u56DE\u7701\u533A\u7ECF\u7406\u8865\u5BA2\u6237\u7EA7\u4F9D\u636E\u4E0E\u65F6\u95F4\u7A97\u3002", cta: "\u751F\u6210\u9000\u56DE\u5355" }, { id: "sg-calendar", category: "mianmo", eventIds: ["ev-mianmo-calendar"], grade: "A2", confidence: "\u9AD8", kpiKey: "forecast", title: "\u542F\u52A8\u9762\u70B9 10 \u6708\u6708\u521D\u8BC4\u4F30\u6570\u636E\u51C6\u5907", target: "\u9762\u70B9 \xB7 \u90D1\u5DDE\u57FA\u5730 / \u9042\u5E73\u57FA\u5730 \xB7 10 \u6708\u6708\u521D\u7248", reason: "\u6708\u521D\u8BC4\u4F30\u8282\u70B9 09-26 \u8DDD\u4ECA 5 \u5929\uFF0C\u6570\u636E\u5305\u672A\u63D0\u4EA4\uFF1B\u8BC4\u4F30\u987A\u5EF6\u4F1A\u628A\u8BA1\u5212\u51BB\u7ED3\u63A8\u5230\u6708\u672B\uFF0C\u76F4\u63A5\u635F\u4F24\u4E0B\u6708\u8BA1\u5212\u51C6\u786E\u7387\u4E0E\u5468\u8F6C\u53E3\u5F84\u3002", impact: "\u6309 09-24 \u524D\u8865\u9F50\u53EF\u4FDD\u4F4F 10 \u6708\u6392\u4EA7\u51BB\u7ED3\u7A97\u53E3\uFF1B\u987A\u5EF6\u5C06\u538B\u7F29\u5468\u6B21\u6392\u4EA7\u5F39\u6027\u5E76\u62AC\u9AD8\u671F\u672B\u5E93\u5B58\u3002", uncertainty: "\u5E74\u5EA6\u81EA\u4EA7/\u8C03\u62E8/\u5916\u534F\u89C4\u5212\u786E\u8BA4\u4F9D\u8D56\u4E8B\u4E1A\u90E8\u53CD\u9988\uFF0C\u53CD\u9988\u65F6\u95F4\u4E0D\u5728\u54C1\u7C7B\u8BA1\u5212\u63A7\u5236\u8303\u56F4\u5185\u3002", action: "\u751F\u6210\u8BC4\u4F30\u51C6\u5907\u4EFB\u52A1\u5305\uFF0C\u6307\u6D3E\u57FA\u5730\u8BA1\u5212\u5458\u4E0E\u6570\u636E Owner\uFF0C\u9501\u5B9A\u8865\u9F50\u65F6\u70B9\u3002", cta: "\u751F\u6210\u51C6\u5907\u4EFB\u52A1\u5305" }, { id: "sg-freshness", category: "mianmo", eventIds: ["ev-mianmo-stock"], grade: "A2", confidence: "\u9AD8", kpiKey: "freshness", title: "\u9762\u70B9\u8D85\u671F\u4EA7\u54C1 48 \u5428\u53BB\u5316\u4E0E\u6392\u4EA7\u6536\u53E3", target: "\u9762\u70B9 \xB7 \u90D1\u5DDE / \u6E56\u5DDE\u57FA\u5730 \xB7 \u8D85\u671F 3 \u4E2A SKU", reason: "\u9762\u70B9\u65B0\u9C9C\u5EA6 93.6%\uFF0C\u4F4E\u4E8E 95.5% \u76EE\u6807\u7EBF 1.9 \u4E2A\u767E\u5206\u70B9\uFF0C\u662F\u5168\u90E8\u54C1\u7C7B\u4E2D\u552F\u4E00\u660E\u663E\u4F4E\u4E8E\u76EE\u6807\u7684\uFF1B\u8D85\u671F\u96C6\u4E2D\u5728 3 \u4E2A SKU\u3002", impact: "\u5C06 48 \u5428\u8D85\u671F\u4EA7\u54C1\u53BB\u5316\u5E76\u6536\u53E3\u5BF9\u5E94 SKU \u6392\u4EA7\uFF0C\u53EF\u4F7F\u9762\u70B9\u65B0\u9C9C\u5EA6\u56DE\u5230 95.5% \u76EE\u6807\u7EBF\uFF1B\u53BB\u5316\u672C\u8EAB\u4F1A\u4EA7\u751F\u5927\u65E5\u671F\u5E93\u5B58\u5904\u7406\u8D39\u7528\u3002", uncertainty: "\u7F3A\u6279\u6B21\u7EA7\u660E\u7EC6\u4E0E\u5BA2\u6237\u8981\u8D27\u5B89\u6392\uFF0C\u53BB\u5316\u8282\u594F\u9700\u4E0E\u9500\u552E\u786E\u8BA4\uFF0C\u4E0D\u80FD\u4EC5\u9760\u964D\u4EF7\u3002", action: "\u6309 60 \u5929\u8D85\u671F\u53E3\u5F84\u62C9\u51FA\u6279\u6B21\u6E05\u5355\uFF0C\u8054\u52A8\u9500\u552E\u786E\u5B9A\u53BB\u5316\u7A97\u53E3\uFF0C\u540C\u6B65\u4E0B\u8C03\u5BF9\u5E94 SKU \u6392\u4EA7\u3002", cta: "\u751F\u6210\u53BB\u5316\u65B9\u6848" }, { id: "sg-chain-target", category: null, eventIds: ["ev-chain-target"], grade: "A4", confidence: "\u4E2D", kpiKey: "turnover", title: "\u63D0\u8BF7\u5168\u94FE\u5468\u8F6C\u5929\u6570\u76EE\u6807\u503C\u62A5\u5907", target: "\u5168\u94FE\u6210\u54C1\u5E93\u5B58\u5468\u8F6C\u5929\u6570\uFF08\u542B\u7ECF\u9500\u5546\uFF09\xB7 \u76EE\u6807\u503C\u914D\u7F6E", reason: "\u8BE5\u6307\u6807\u662F\u7ECF\u7406\u7EA7\u4E3B\u8981\u8003\u6838\u9879\u4E4B\u4E00\uFF0C\u4F46\u76EE\u6807\u503C\u4ECD\u4E3A\u201C\u6309\u5355\u72EC\u5907\u6848\u6267\u884C\u201D\uFF0C\u5BFC\u81F4\u4E00\u8282\u70B9\u7ED3\u7B97\u7F3A\u9879\u3001\u65E0\u6CD5\u5224\u5B9A\u662F\u5426\u8FBE\u6210\u3002", impact: "\u76EE\u6807\u503C\u62A5\u5907\u540E\u65B9\u53EF\u5224\u5B9A\u8FBE\u6210\u60C5\u51B5\uFF1B\u76EE\u6807\u5B9A\u5F97\u504F\u4F4E\u4F1A\u4F7F\u6307\u6807\u957F\u671F\u4E0D\u8FBE\u6807\uFF0C\u5B9A\u5F97\u504F\u9AD8\u5219\u5931\u53BB\u7275\u5F15\u4F5C\u7528\u3002", uncertainty: "\u6838\u7B97\u903B\u8F91\u4ECD\u5728\u9A8C\u7B97\uFF1B\u672C\u539F\u578B\u65E0\u7ECF\u9500\u5546\u5E93\u5B58\u5168\u91CF\u6570\u636E\uFF0C\u4E0D\u80FD\u4EE3\u4E3A\u8BBE\u5B9A\u76EE\u6807\u503C\u3002", action: "\u6574\u7406\u6838\u7B97\u903B\u8F91\u9A8C\u7B97\u8BF4\u660E\u4E0E\u5386\u53F2\u5BF9\u7167\uFF08F25 \u5168\u94FE 27.78 \u5929\uFF09\u63D0\u4EA4\u4E1A\u52A1\u89C4\u5219 Owner \u62A5\u5907\uFF0C\u4E0D\u7531 Agent \u8BBE\u5B9A\u76EE\u6807\u3002", cta: "\u751F\u6210\u62A5\u5907\u6750\u6599" }], g8 = [{ id: "tk-1", title: "\u6838\u5B9E\u9042\u5E73\u7CBD\u5B50\u96A7\u9053\u8D1F\u8377\u8BC4\u4F30\u53E3\u5F84", category: "zongzi", eventId: "ev-zongzi-cap", owner: "\u57FA\u5730\u8BA1\u5212\u5458", due: "2026-09-22", status: "running", origin: "\u9884\u8B66 \xB7 \u8BA2\u5355\u6EE1\u8DB3\u7387", logs: [["09-21 08:26", "\u5DF2\u521B\u5EFA\u6838\u5B9E\u4EFB\u52A1\uFF0C\u6307\u6D3E\u9042\u5E73\u57FA\u5730\u8BA1\u5212\u5458"], ["09-21 09:12", "\u57FA\u5730\u5F00\u59CB\u6838\u5BF9\u96A7\u9053\u6807\u51C6\u751F\u4EA7\u65E5\u8D1F\u8377\u4E0E\u53EF\u7528\u5929\u6570"]] }, { id: "tk-2", title: "\u534E\u4E1C 3 \u5BB6\u7ECF\u9500\u5546\u6C64\u5706\u5728\u9014\u6709\u6548\u6027\u6838\u9A8C", category: "tangyuan", eventId: "ev-tangyuan-dealer", owner: "\u5BA2\u6237\u7ECF\u7406", due: "2026-09-22", status: "running", origin: "\u9884\u8B66 \xB7 \u8BA2\u5355\u6EE1\u8DB3\u7387", logs: [["09-21 08:02", "\u4EFB\u52A1\u521B\u5EFA\uFF0C\u542B 42 \u5428\u5F85\u5230\u8D27\u786E\u8BA4\u9879"], ["09-21 08:48", "\u5BA2\u6237\u7ECF\u7406\u53CD\u9988\u534E\u4E30\u9884\u8BA1\u5230\u8D27 09-23"]] }, { id: "tk-3", title: "\u9000\u56DE\u534E\u4E1C\u6C34\u997A\u9700\u6C42\u4E0A\u62A5\u5E76\u8865\u5BA2\u6237\u7EA7\u4F9D\u636E", category: "shuijiao", eventId: "ev-shuijiao-dev", owner: "\u7701\u533A\u7ECF\u7406", due: "2026-09-23", status: "review", origin: "\u9884\u8B66 \xB7 \u9700\u6C42\u8BA1\u5212\u51C6\u786E\u7387", logs: [["09-20 17:20", "\u9000\u56DE\u5355\u5DF2\u751F\u6210\uFF0C\u539F\u56E0\u7801\uFF1A\u8BC1\u636E\u4E0D\u8DB3"], ["09-21 09:05", "\u7701\u533A\u7ECF\u7406\u5F00\u59CB\u8865\u5145\u5BA2\u6237\u7EA7\u660E\u7EC6"]] }, { id: "tk-4", title: "\u542F\u52A8\u90D1\u5DDE / \u9042\u5E73\u9762\u70B9\u6708\u521D\u8BC4\u4F30\u6570\u636E\u51C6\u5907", category: "mianmo", eventId: "ev-mianmo-calendar", owner: "\u54C1\u7C7B\u8BA1\u5212\u5458", due: "2026-09-24", status: "pending", origin: "\u9884\u8B66 \xB7 \u8BA1\u5212\u8282\u70B9\u4E34\u671F", logs: [["09-21 06:35", "\u4EFB\u52A1\u5305\u5DF2\u751F\u6210\uFF0C\u7B49\u5F85\u6307\u6D3E\u6570\u636E Owner"]] }, { id: "tk-5", title: "\u9762\u70B9\u8D85\u671F\u6279\u6B21\u6E05\u5355\u4E0E\u53BB\u5316\u7A97\u53E3\u786E\u8BA4", category: "mianmo", eventId: "ev-mianmo-stock", owner: "\u54C1\u7C7B\u8BA1\u5212\u5458", due: "2026-09-25", status: "running", origin: "\u9884\u8B66 \xB7 \u4EA7\u54C1\u65B0\u9C9C\u5EA6", logs: [["09-21 07:15", "\u5DF2\u6309 60 \u5929\u53E3\u5F84\u62C9\u53D6\u8D85\u671F\u6279\u6B21\u6E05\u5355"], ["09-21 09:40", "\u4E0E\u9500\u552E\u786E\u8BA4\u53BB\u5316\u7A97\u53E3\uFF0C\u7B49\u5F85\u53CD\u9988"]] }, { id: "tk-6", title: "\u8C03\u7406\u8089\u8C03\u62E8\u5728\u9014\u4E0E\u8FDB\u9500\u5B58\u5DEE\u5F02\u5F52\u56E0", category: "tiaolirou", eventId: "ev-tiaolirou-data", owner: "\u6570\u636E Owner", due: "2026-09-23", status: "running", origin: "\u9884\u8B66 \xB7 \u6570\u636E\u8D28\u91CF", logs: [["09-20 22:20", "\u5DEE\u5F02\u5355\u5DF2\u63D0\u4EA4\u6570\u636E Owner"], ["09-21 08:30", "TMS \u4E0E SAP \u5728\u9014\u72B6\u6001\u6BD4\u5BF9\u8FDB\u884C\u4E2D"]] }, { id: "tk-7", title: "\u5168\u94FE\u5468\u8F6C\u6838\u7B97\u903B\u8F91\u9A8C\u7B97\u8BF4\u660E\u6574\u7406", category: null, eventId: "ev-chain-target", owner: "\u54C1\u7C7B\u8BA1\u5212\u5458", due: "2026-09-30", status: "pending", origin: "\u9884\u8B66 \xB7 \u76EE\u6807\u503C\u672A\u62A5\u5907", logs: [["09-21 06:10", "\u4EFB\u52A1\u521B\u5EFA\uFF0C\u542B F25 \u5386\u53F2\u5BF9\u7167\u53D6\u6570"]] }, { id: "tk-9", title: "\u9762\u70B9\u76EE\u6807\u5E93\u5B58\u53C2\u6570\u8C03\u6574\u8BC4\u5BA1\u6750\u6599\u6574\u7406", category: "mianmo", eventId: null, owner: "\u54C1\u7C7B\u8BA1\u5212\u5458", due: "2026-09-30", status: "done", origin: "\u5EFA\u8BAE \xB7 \u89C4\u5219\u8BC4\u5BA1", logs: [["09-19 15:40", "\u6750\u6599\u521D\u7A3F\u5B8C\u6210"], ["09-20 11:00", "\u5DF2\u63D0\u4EA4\u4E1A\u52A1\u89C4\u5219 Owner\uFF0C\u7B49\u5F85\u6392\u671F\u8BC4\u5BA1"]] }], E1 = { pending: "\u5F85\u8DDF\u8FDB", running: "\u8FDB\u884C\u4E2D", review: "\u5F85\u590D\u6838", done: "\u5DF2\u5B8C\u6210" }, S1 = { p1: "\u4F18\u5148", p2: "\u5173\u6CE8", p3: "\u63D0\u793A", watch: "\u7559\u610F" }, dp = { A1: "Agent \u8D77\u8349", A2: "\u8BA1\u5212\u5458\u786E\u8BA4", A3: "\u9700\u6388\u6743", A4: "\u987B\u4E1A\u52A1 Owner \u51B3\u7B56" }, mh = (e, t) => !t || e.category === t || e.category === null;
function vp(e) {
  return fp.filter((t) => mh(t, e));
}
function y8(e) {
  return h8.filter((t) => mh(t, e));
}
function x8(e) {
  return g8.filter((t) => mh(t, e));
}

// prettier-ignore
const Mx = [{ id: "qa-kpi", label: "\u67E5\u770B\u54C1\u7C7B\u8BA1\u5212\u5728\u7BA1\u7684\u6307\u6807", prompt: "\u67E5\u770B\u54C1\u7C7B\u8BA1\u5212\u5728\u7BA1\u54EA\u4E9B\u6307\u6807" }, { id: "qa-order", label: "\u8BA2\u5355\u6EE1\u8DB3\u7387\u7684\u7F3A\u53E3\u5728\u54EA", prompt: "\u8BA2\u5355\u6EE1\u8DB3\u7387\u7684\u7F3A\u53E3\u5728\u54EA\u91CC" }, { id: "qa-acc", label: "\u8BA1\u5212\u51C6\u786E\u7387\u4E3A\u4EC0\u4E48\u6CA1\u8FBE\u6807", prompt: "\u9700\u6C42\u8BA1\u5212\u51C6\u786E\u7387\u4E3A\u4EC0\u4E48\u6CA1\u8FBE\u6807" }, { id: "qa-turn", label: "\u5468\u8F6C\u5929\u6570\u4E0E\u65B0\u9C9C\u5EA6", prompt: "\u5E93\u5B58\u5468\u8F6C\u5929\u6570\u4E0E\u4EA7\u54C1\u65B0\u9C9C\u5EA6\u600E\u4E48\u6837" }], C8 = ["\u7CBD\u5B50\u7F3A\u53E3\u5BF9\u8BA2\u5355\u6EE1\u8DB3\u7387\u5F71\u54CD\u591A\u5927\uFF1F", "\u5E93\u5B58\u5468\u8F6C\u5DEE 0.7 \u5929\u5361\u5728\u54EA\uFF1F", "\u4EA7\u54C1\u65B0\u9C9C\u5EA6\u4F4E\u4E8E\u76EE\u6807\u600E\u4E48\u529E\uFF1F", "\u5168\u94FE\u5468\u8F6C\u76EE\u6807\u4E3A\u4EC0\u4E48\u6CA1\u5907\u6848\uFF1F"], w8 = "\u672C\u539F\u578B\u4E3A\u4EA4\u4E92\u6F14\u793A\uFF1A\u6307\u6807\u53E3\u5F84\u4E0E\u76EE\u6807\u503C\u53D6\u81EA\u5185\u90E8\u6587\u4EF6\uFF0C\u6570\u503C\u4E3A\u672C\u5730\u6A21\u62DF\u5FEB\u7167\uFF1B\u4E0D\u8FDE\u63A5 SAP / DMS / BI / APS / OMS\uFF0C\u4E5F\u4E0D\u4F1A\u4E0B\u8FBE\u4EFB\u4F55\u6B63\u5F0F\u4E1A\u52A1\u52A8\u4F5C\u3002", qr = Bl.TabPane, b8 = { p1: "red", p2: "orangered", p3: "gold", watch: "gray" }, _8 = { pending: "gray", running: "arcoblue", review: "orange", done: "green" }, Ls = (e) => {
  const t = Yt.find((n) => n.key === e);
  return t ? t.name : "\u5168\u54C1\u7C7B";
};
// Retain the fixed source declarations validated against SOURCE.json.
void w8;
function O8(e) {
  return w.jsx(bt, { color: b8[e], size: 'small', bordered: true, children: S1[e] });
}
function E8(e) {
  return w.jsx(bt, { color: _8[e], size: 'small', bordered: true, children: E1[e] });
}
function S8({ item: e, onOpen: t }) {
  const { def: n, value: r, status: a, attainment: i } = e;
  return w.jsxs(et, {
    className: `kpi-card tone-${a.tone}`,
    type: 'text',
    onClick: () => t(e.key),
    'aria-label': `${n.name}\uFF1A${r}${n.unit}\uFF0C\u76EE\u6807 ${n.target != null ? n.target + n.unit : '\u672A\u62A5\u5907'}\uFF0C${a.label}\uFF0C\u67E5\u770B\u53E3\u5F84\u4E0E\u660E\u7EC6`,
    children: [
      w.jsxs('span', {
        className: 'kpi-top',
        children: [
          w.jsx('span', { className: 'kpi-name', children: n.name }),
          w.jsx('span', { className: `kpi-state is-${a.tone}`, children: a.label }),
        ],
      }),
      w.jsxs('span', {
        className: 'kpi-value',
        children: [r, w.jsx('small', { children: n.unit })],
      }),
      w.jsx('span', {
        className: 'kpi-sub',
        children:
          n.target != null
            ? `\u76EE\u6807 ${n.target}${n.unit}`
            : n.targetNote || '\u76EE\u6807\u503C\u672A\u62A5\u5907',
      }),
      w.jsx('span', {
        className: `kpi-bar is-${a.tone}`,
        children: w.jsx('i', { style: { width: `${i ?? 0}%` } }),
      }),
      w.jsx('span', {
        className: 'kpi-note',
        children:
          i == null
            ? n.note || n.freq
            : `\u8DDD\u76EE\u6807\u8FBE\u6210\u5EA6 ${i}% \xB7 ${n.freq}`,
      }),
    ],
  });
}
function P8({ cells: e, onJump: t }) {
  return w.jsx('div', {
    className: 'status-strip',
    role: 'group',
    'aria-label': '\u5DE5\u4F5C\u53F0\u72B6\u6001',
    children: e.map((n) =>
      w.jsxs(
        et,
        {
          type: 'text',
          className: `status-cell${n.alert ? ' is-alert' : ''}`,
          onClick: () => t(n.key),
          'aria-label': `${n.label}\uFF1A${n.value}${n.unit}\uFF0C${n.hint}`,
          children: [
            w.jsx('span', { className: 'sc-mark', style: { background: n.color } }),
            w.jsxs('span', {
              className: 'sc-body',
              children: [
                w.jsxs('span', {
                  className: 'sc-head',
                  children: [
                    w.jsx('span', { className: 'sc-label', children: n.label }),
                    w.jsxs('span', {
                      className: 'sc-value',
                      children: [n.value, w.jsx('small', { children: n.unit })],
                    }),
                  ],
                }),
                w.jsx('span', { className: 'sc-hint', children: n.hint }),
              ],
            }),
          ],
        },
        n.key,
      ),
    ),
  });
}
function N8({
  category: e,
  setCategory: t,
  view: n,
  setView: r,
  adopted: a,
  extraTasks: i = [],
  onDrill: l,
  onEventDetail: o,
  onEventAsk: u,
  onSugDetail: s,
  onSugAdopt: f,
  onTaskOpen: d,
  onInsightAsk: v,
  questionTools,
}) {
  const p = ph(e),
    m = ef(e),
    C = vp(e),
    O = y8(e),
    g = [...x8(e), ...i.filter((S) => !e || S.category === e || S.category === null)],
    h = y.useRef(null),
    x = y.useRef(null),
    b = y.useRef(null),
    [E, _] = usePageViewField(y, categoryView, 'eventStatus', 'all'),
    P = C.filter((S) => S.status === 'open'),
    N = O.filter((S) => !a.includes(S.id)),
    k = g.filter((S) => S.status === 'running' || S.status === 'review'),
    $ = P.filter((S) => S.overdue),
    I = e ? Ls(e) : '\u5168\u90E8\u54C1\u7C7B',
    W = (S) => {
      if (S === 'decide')
        return x.current && x.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (S === 'running')
        return (
          _('running'),
          b.current && b.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
        );
      if (S === 'overdue')
        return (
          r('overdue'),
          h.current && h.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
        );
    },
    L = Dr.filter((S) => m[S].value != null && m[S].def.target != null),
    z = L.filter((S) => m[S].status.tone === 'ok'),
    H = L.filter((S) => m[S].status.tone !== 'ok'),
    R = H.length
      ? `${I} ${Dr.length} \u9879\u76D1\u63A7\u53E3\u5F84\u4E2D\uFF1A${z.length} \u9879\u8FBE\u5230\u76EE\u6807\uFF0C${H.length} \u9879\u672A\u8FBE\u6216\u4E34\u754C\uFF08${H.map((S) => rt[S].short).join('\u3001')}\uFF09\u3002\u7F3A\u53E3\u96C6\u4E2D\u5728\u4EA7\u80FD\u4E0E\u8BA1\u5212\u51C6\u786E\u6027\u3002`
      : `${I} \u53EF\u5224\u5B9A\u6307\u6807\u5747\u5DF2\u8FBE\u5230\u76EE\u6807\u503C\uFF0C\u91CD\u70B9\u8F6C\u5411\u7EF4\u6301\u65B0\u9C9C\u5EA6\u4E0E\u5E93\u5B58\u7ED3\u6784\u3002`,
    M = [
      {
        name: '\u539F\u59CB\u8BA2\u5355\u6EE1\u8DB3\u7387',
        state: `${m.order.value}%`,
        tone: m.order.status.tone,
        driver: `\u7CBD\u5B50 ${Yt[1].kpi.order}%\uFF08\u4F4E\u4E8E\u76EE\u6807\uFF09/ \u6C64\u5706\u5DF2\u51FA\u73B0 ${Yt[0].unmetOrders} \u5F20\u672A\u6EE1\u8DB3\u8BA2\u5355`,
        judge:
          '\u4EA7\u80FD\u578B\u7F3A\u53E3\uFF0C\u8865\u8D27\u65E0\u6CD5\u4FEE\u590D\uFF0C\u9700\u8DE8\u57FA\u5730\u8C03\u5242',
      },
      {
        name: '\u9700\u6C42\u8BA1\u5212\u51C6\u786E\u7387',
        state: `${m.forecast.value}%`,
        tone: m.forecast.status.tone,
        driver:
          '\u534E\u4E1C\u6C34\u997A\u4E0A\u62A5\u504F\u79BB\u57FA\u7EBF +18.2%\uFF08\u7F3A\u8BC1\u636E\uFF09\uFF1B\u9762\u70B9\u6708\u521D\u8BC4\u4F30\u672A\u542F\u52A8',
        judge:
          '\u504F\u5DEE\u96C6\u4E2D\u5728\u5355\u4E00\u533A\u57DF\uFF0C\u9000\u56DE\u62A5\u6587\u5373\u53EF\u56DE\u6536\u5927\u90E8\u5206\u7F3A\u53E3',
      },
      {
        name: '\u5E93\u5B58\u5468\u8F6C\u5929\u6570\uFF08\u5DE5\u5382\u4ED3\uFF09',
        state: `${m.turnover.value} \u5929`,
        tone: m.turnover.status.tone,
        driver: `\u9762\u70B9 ${Yt[3].kpi.turnover} \u5929\u3001\u7CBD\u5B50 ${Yt[1].kpi.turnover} \u5929\u504F\u9AD8\uFF1B\u4EA7\u9500\u7387 ${p.dealRate}% \u7565\u5927\u4E8E\u9500`,
        judge:
          '\u8D85\u671F\u4E0E\u6392\u4EA7\u6536\u53E3\u662F\u4E3B\u8981\u6293\u624B\uFF0C\u62A5\u5907\u5907\u8D27\u53EF\u5265\u79BB',
      },
      {
        name: '\u5168\u94FE\u6210\u54C1\u5E93\u5B58\u5468\u8F6C\u5929\u6570',
        state: `${m.chainTurnover.value} \u5929`,
        tone: 'warn',
        driver:
          '\u76EE\u6807\u503C\u672A\u62A5\u5907\uFF1BF25 \u5168\u94FE 27.78 \u5929\uFF0C\u8F83\u540C\u671F\u589E\u52A0 2.183 \u5929',
        driver2: '',
        judge:
          '\u8986\u76D6\u603B\u4ED3 + \u5206\u4ED3 + \u7ECF\u9500\u5546\u4ED3\uFF0C\u4E0E\u5DE5\u5382\u4ED3\u53E3\u5F84\u4E0D\u53EF\u4E92\u63A8',
      },
      {
        name: '\u4EA7\u54C1\u65B0\u9C9C\u5EA6',
        state: `${m.freshness.value}%`,
        tone: m.freshness.status.tone,
        driver: `\u9762\u70B9 ${Yt[3].kpi.freshness}%\uFF08\u4F4E\u4E8E\u76EE\u6807 1.9pp\uFF09\uFF1B\u8D85\u671F ${p.overstockTons} \u5428`,
        judge:
          '\u6309 60 \u5929\u8D85\u671F\u53E3\u5F84\u6CBB\u7406\u5355\u4E00\u54C1\u7C7B\u5373\u53EF\u56DE\u5230\u76EE\u6807\u7EBF',
      },
    ],
    j = _1.filter((S) => S.dday >= 0).sort((S, F) => S.dday - F.dday)[0],
    A = [
      {
        key: 'decide',
        label: '\u5F85\u51B3\u7B56',
        value: N.length,
        unit: '\u9879',
        color: 'var(--brand)',
        hint: '\u5F85\u4EBA\u5DE5\u786E\u8BA4\u7684\u5EFA\u8BAE \xB7 \u9700\u6388\u6743\u4E8B\u9879',
      },
      {
        key: 'running',
        label: 'Agent \u5904\u7406\u4E2D',
        value: k.length,
        unit: '\u9879',
        color: 'var(--info-text)',
        hint: '\u6B63\u5728\u51C6\u5907\u4E8B\u5B9E\u4E0E\u65B9\u6848',
      },
      {
        key: 'overdue',
        label: '\u8D85\u65F6\u5347\u7EA7',
        value: $.length,
        unit: '\u9879',
        color: 'var(--risk-text)',
        hint: $.length
          ? `\u8D85\u65F6\u9650\u672A\u95ED\u73AF\uFF1A${$.map((S) => Ls(S.category)).join('\u3001')}`
          : '\u65E0\u8D85\u65F6\u9879',
        alert: $.length > 0,
      },
      {
        key: 'calendar',
        label: '\u8BA1\u5212\u65E5\u5386',
        value: j ? `T\u2212${j.dday}` : '\u2014',
        unit: '',
        color: '#d99a00',
        hint: j ? `${j.name} \xB7 ${j.date}` : '\u6682\u65E0\u4E34\u8FD1\u8282\u70B9',
      },
    ],
    T = C.filter((S) => {
      const F = O.some((U) => U.eventIds.includes(S.id) && !a.includes(U.id)),
        Q = g.some((U) => U.eventId === S.id && U.status !== 'done');
      switch (n) {
        case 'p1':
          return S.level === 'p1';
        case 'verify':
          return S.type === 'data' || S.type === 'co';
        case 'overdue':
          return S.overdue;
        case 'decide':
          return F;
        case 'running':
          return Q;
        default:
          return true;
      }
    })
      .map((S) => ({ key: S.id, event: S, score: { p1: 0, p2: 1, p3: 2, watch: 3 }[S.level] }))
      .sort((S, F) => S.score - F.score),
    V = (S) =>
      w.jsx(C1, {
        className: 'data-table',
        size: 'small',
        border: false,
        rowKey: 'id',
        pagination: false,
        data: S,
        noDataElement: w.jsx(qs, {
          description: '\u5F53\u524D\u7B5B\u9009\u4E0B\u6682\u65E0\u4EFB\u52A1',
        }),
        columns: [
          {
            title: '\u4EFB\u52A1 / \u5173\u8054\u4E8B\u4EF6',
            dataIndex: 'title',
            width: 268,
            render: (F, Q) =>
              w.jsxs('div', {
                children: [
                  w.jsx('div', {
                    style: { fontWeight: 700, color: 'var(--text-strong)', fontSize: 11 },
                    children: F,
                  }),
                  w.jsx('div', {
                    style: { fontSize: 9, color: 'var(--text-faint)', marginTop: 2 },
                    children: Q.origin,
                  }),
                ],
              }),
          },
          {
            title: '\u5173\u8054\u54C1\u7C7B',
            dataIndex: 'category',
            width: 84,
            render: (F) => w.jsx(bt, { size: 'small', bordered: true, children: Ls(F) }),
          },
          { title: '\u8D23\u4EFB\u89D2\u8272', dataIndex: 'owner', width: 108 },
          {
            title: '\u65F6\u9650',
            dataIndex: 'due',
            width: 88,
            render: (F) => F.replace('2026-', '').replace('-', '.'),
          },
          { title: '\u72B6\u6001', dataIndex: 'status', width: 88, render: (F) => E8(F) },
          {
            title: '\u64CD\u4F5C',
            dataIndex: 'op',
            width: 66,
            render: (F, Q) =>
              w.jsx(et, {
                type: 'text',
                size: 'mini',
                style: { color: 'var(--brand)', padding: 0 },
                onClick: () => d(Q),
                children: '\u67E5\u770B',
              }),
          },
        ],
      });
  const [connectionRevision, reconnect] = y.useState(0),
    [syncError, setSyncError] = y.useState('');
  y.useEffect(() => {
    const changed = () => reconnect((value) => value + 1);
    window.addEventListener('gea-session-changed', changed);
    window.addEventListener('gea-identity-changed', changed);
    return () => {
      window.removeEventListener('gea-session-changed', changed);
      window.removeEventListener('gea-identity-changed', changed);
    };
  }, []);
  y.useEffect(() => {
    let stop = reportElements('category', []);
    if (!currentSessionId()) return stop;
    const controller = new AbortController();
    const events = T.map((row) => row.event);
    const tasks =
      E === 'running'
        ? k
        : E === 'todo'
          ? g.filter((row) => row.status !== 'done')
          : E === 'done'
            ? g.filter((row) => row.status === 'done')
            : g;
    const parts = {
      category: e,
      categoryLabel: I,
      view: n,
      taskStatus: E,
      snapshot: qu,
      summary: p,
      kpis: m,
      events,
      suggestions: O.map((row) => ({ ...row, adopted: a.includes(row.id) })),
      tasks,
    };
    setSyncError('');
    publish(
      {
        mock: true,
        pageId: 'plan-region-category',
        instance: 'default',
        parts,
        boundary: '本地模拟快照与临时任务，不代表真实业务、模型结果或系统回执。',
      },
      { signal: controller.signal },
    )
      .then(() => {
        if (controller.signal.aborted) return;
        stop();
        stop = reportElements('category', [
          { id: 'category:scope', role: 'field', label: '当前品类（模拟）', value: I },
          ...Dr.map((key) => ({
            id: 'kpi:' + key,
            role: 'field',
            label: '模拟指标 ' + rt[key].name,
            value: `${m[key].value}${rt[key].unit} · 目标 ${rt[key].target ?? '未报备'} · ${m[key].status.label}`,
          })),
          ...events.map((row) => ({
            id: 'event:' + row.id,
            role: 'row',
            label: row.title,
            value: `${S1[row.level]} · ${T8(row.type)} · ${row.time}${row.overdue ? ' · 超时' : ''}`,
          })),
          ...O.map((row) => ({
            id: 'suggestion:' + row.id,
            role: 'row',
            label: row.title,
            value: `${row.target} · ${row.grade} · 置信度 ${row.confidence} · ${a.includes(row.id) ? '已进入任务跟踪' : '待人工确认'}`,
          })),
          ...tasks.map((row) => ({
            id: 'task:' + row.id,
            role: 'row',
            label: row.title,
            value: `${row.owner} · ${row.due} · ${E1[row.status]} · ${row.origin}`,
          })),
          {
            id: 'prototype:boundary',
            role: 'field',
            label: '数据边界',
            value: '本地模拟快照与临时任务；没有真实业务回执。',
          },
        ]);
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setSyncError('页面快照发布失败，请重新连接。' + error.message);
      });
    return () => {
      controller.abort();
      stop();
    };
  }, [e, n, E, a, i, connectionRevision]);
  return w.jsxs('div', {
    className: 'work',
    children: [
      syncError &&
        w.jsx('p', { className: 'category-sync-status', role: 'status', children: syncError }),
      w.jsxs('div', {
        className: 'boundary',
        children: [
          w.jsx('b', { children: '\u6F14\u793A\u8FB9\u754C' }),
          w.jsxs('span', {
            children: [
              '\u6307\u6807\u53E3\u5F84\u4E0E\u76EE\u6807\u503C\u53C2\u8003\u5185\u90E8\u6587\u4EF6\uFF08F26 \u8D22\u5E74\u54C1\u7C7B\u8BA1\u5212\u7EC4\uFF09\uFF0C\u6570\u503C\u4E3A\u672C\u5730\u6A21\u62DF\u5FEB\u7167\uFF08',
              qu,
              '\uFF09\uFF1B \u4E0D\u8FDE\u63A5 SAP / DMS / BI / APS / OMS\uFF0C\u4E0D\u4EE3\u8868\u771F\u5B9E\u4E1A\u52A1\u7ED3\u679C\u3002',
            ],
          }),
        ],
      }),
      w.jsx('div', {
        className: 'work-head',
        children: w.jsxs('div', {
          className: 'work-head-row',
          children: [
            w.jsxs('div', {
              style: { minWidth: 0 },
              children: [
                w.jsx('h2', { children: '\u54C1\u7C7B\u8BA1\u5212\u7BA1\u7406\u5DE5\u4F5C\u53F0' }),
                w.jsx('p', {
                  className: 'sub',
                  children:
                    '\u56F4\u7ED5\u54C1\u7C7B\u8BA1\u5212\u5728\u7BA1\u7684\u4E94\u4EF6\u4E8B\u2014\u2014\u8BA2\u5355\u6EE1\u8DB3\u7387\u3001\u9700\u6C42\u8BA1\u5212\u51C6\u786E\u7387\u3001\u5E93\u5B58\u5468\u8F6C\u3001\u5168\u94FE\u5468\u8F6C\u4E0E\u4EA7\u54C1\u65B0\u9C9C\u5EA6\uFF1BAI \u8D1F\u8D23\u9884\u8B66\u4E0E\u5EFA\u8BAE\uFF0C\u4EBA\u6765\u51B3\u7B56\u4E0E\u6388\u6743\u3002',
                }),
              ],
            }),
            w.jsx('div', {
              className: 'work-head-actions',
              children: w.jsxs('span', {
                className: 'scope-picker',
                children: [
                  w.jsx('span', { className: 'sp-label', children: '\u54C1\u7C7B' }),
                  w.jsxs(ha, {
                    size: 'small',
                    value: e || 'all',
                    style: { width: 116 },
                    onChange: (S) => t(S === 'all' ? null : S),
                    children: [
                      w.jsx(ha.Option, { value: 'all', children: '\u5168\u90E8\u54C1\u7C7B' }),
                      Yt.map((S) => w.jsx(ha.Option, { value: S.key, children: S.name }, S.key)),
                    ],
                  }),
                ],
              }),
            }),
          ],
        }),
      }),
      w.jsxs('div', {
        className: 'work-body',
        children: [
          questionTools,
          w.jsx('div', { className: 'block', children: w.jsx(P8, { cells: A, onJump: W }) }),
          w.jsxs('div', {
            className: 'block',
            children: [
              w.jsxs('div', {
                className: 'block-head',
                children: [
                  w.jsx('h3', { children: '\u54C1\u7C7B\u8BA1\u5212\u6307\u6807\u76D1\u63A7' }),
                  w.jsxs('span', {
                    className: 'hint',
                    children: [
                      b1,
                      ' \xB7 \u5168\u94FE\u53E3\u5F84\uFF08\u57FA\u5730\u4ED3 + \u5206\u4ED3 + \u7ECF\u9500\u5546\u7AEF\uFF09\xB7 \u70B9\u51FB\u4EFB\u610F\u6307\u6807\u67E5\u770B\u53E3\u5F84\u4E0E\u660E\u7EC6',
                    ],
                  }),
                ],
              }),
              w.jsx('div', {
                className: 'kpi-grid',
                children: Dr.map((S) => w.jsx(S8, { item: m[S], onOpen: l }, S)),
              }),
            ],
          }),
          w.jsx('div', {
            className: 'block',
            children: w.jsxs('div', {
              className: 'panel insight',
              children: [
                w.jsxs('div', {
                  className: 'panel-head',
                  children: [
                    w.jsx('span', {
                      style: {
                        width: 18,
                        height: 18,
                        borderRadius: 6,
                        background: 'var(--brand-soft)',
                        color: 'var(--brand)',
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: 11,
                      },
                      children: '\u2726',
                    }),
                    w.jsx('h3', {
                      children: 'AI \u6D1E\u5BDF \xB7 \u6307\u6807\u7F3A\u53E3\u5F52\u56E0',
                    }),
                    w.jsx('span', {
                      className: 'hint',
                      style: { fontSize: 9, color: 'var(--text-faint)' },
                      children:
                        '\u7ED3\u679C\u6307\u6807 \u2190 \u9A71\u52A8\u6307\u6807\uFF0C\u89C4\u5219\u62FC\u88C5\uFF0C\u975E\u6A21\u578B\u751F\u6210',
                    }),
                    w.jsx('span', { className: 'spacer' }),
                    w.jsxs('span', {
                      className: 'hint',
                      style: { fontSize: 9, color: 'var(--text-faint)' },
                      children: ['\u5FEB\u7167 ', qu],
                    }),
                  ],
                }),
                w.jsxs('div', {
                  className: 'panel-body',
                  children: [
                    w.jsx('div', { className: 'insight-lead', children: R }),
                    w.jsxs('table', {
                      className: 'mini-table',
                      style: { marginTop: 10 },
                      children: [
                        w.jsx('thead', {
                          children: w.jsxs('tr', {
                            children: [
                              w.jsx('th', { children: '\u76D1\u63A7\u6307\u6807' }),
                              w.jsx('th', { children: '\u5F53\u524D\u503C / \u72B6\u6001' }),
                              w.jsx('th', {
                                children: '\u4E3B\u8981\u9A71\u52A8\u4E0E\u4E8B\u5B9E',
                              }),
                              w.jsx('th', { children: '\u5224\u65AD' }),
                            ],
                          }),
                        }),
                        w.jsx('tbody', {
                          children: M.map((S) =>
                            w.jsxs(
                              'tr',
                              {
                                children: [
                                  w.jsx('td', { children: S.name }),
                                  w.jsxs('td', {
                                    style: { whiteSpace: 'nowrap' },
                                    children: [
                                      w.jsx('span', { className: `dot-state is-${S.tone}` }),
                                      S.state,
                                    ],
                                  }),
                                  w.jsx('td', { children: S.driver }),
                                  w.jsx('td', {
                                    style: { color: 'var(--text-muted)' },
                                    children: S.judge,
                                  }),
                                ],
                              },
                              S.name,
                            ),
                          ),
                        }),
                      ],
                    }),
                    w.jsxs('div', {
                      className: 'chip-row',
                      children: [
                        w.jsxs('span', {
                          className: 'chip is-brand',
                          children: [p.categoryCount, ' \u4E2A\u54C1\u7C7B'],
                        }),
                        w.jsxs('span', {
                          className: 'chip',
                          children: ['\u5168\u94FE\u5E93\u5B58 ', p.chainStock, ' \u5428'],
                        }),
                        w.jsxs('span', {
                          className: 'chip',
                          children: ['\u5168\u94FE\u53EF\u552E ', p.chainDays, ' \u5929'],
                        }),
                        w.jsxs('span', {
                          className: 'chip',
                          children: ['RCCP \u7F3A\u53E3 ', p.gapTons, ' \u5428'],
                        }),
                        w.jsxs('span', {
                          className: 'chip',
                          children: ['\u8D85\u671F ', p.overstockTons, ' \u5428'],
                        }),
                        w.jsxs('span', {
                          className: 'chip',
                          children: ['\u672A\u6EE1\u8DB3\u8BA2\u5355 ', p.unmetOrders, ' \u5F20'],
                        }),
                      ],
                    }),
                    w.jsxs('div', {
                      className: 'insight-foot',
                      children: [
                        w.jsx(et, {
                          type: 'primary',
                          size: 'small',
                          onClick: v,
                          children: '\u5728\u4F1A\u8BDD\u4E2D\u6DF1\u5165\u5206\u6790',
                        }),
                        w.jsx(et, {
                          size: 'small',
                          onClick: () => l('evidence'),
                          children: '\u53E3\u5F84\u4E0E\u5206\u6790\u4F9D\u636E',
                        }),
                        w.jsx('span', {
                          className: 'hint',
                          style: { fontSize: 9, color: 'var(--text-faint)' },
                          children:
                            '\u6D1E\u5BDF\u7531\u672C\u5730\u89C4\u5219\u57FA\u4E8E\u5F53\u524D\u5FEB\u7167\u62FC\u88C5\uFF0C\u4E0D\u542B\u9884\u6D4B\u7ED3\u679C',
                        }),
                      ],
                    }),
                  ],
                }),
              ],
            }),
          }),
          w.jsxs('div', {
            className: 'block panel-two',
            children: [
              w.jsxs('div', {
                className: 'panel',
                ref: h,
                children: [
                  w.jsxs('div', {
                    className: 'panel-head',
                    children: [
                      w.jsx('h3', { children: '\u4E8B\u4EF6\u9884\u8B66' }),
                      w.jsxs(bt, {
                        color: 'red',
                        size: 'small',
                        bordered: true,
                        children: [P.length, ' \u5F85\u5904\u7406'],
                      }),
                      $.length > 0
                        ? w.jsxs(bt, {
                            color: 'orangered',
                            size: 'small',
                            bordered: true,
                            children: [$.length, ' \u8D85\u65F6'],
                          })
                        : null,
                      w.jsx('span', { className: 'spacer' }),
                      w.jsx('span', {
                        className: 'hint',
                        style: { fontSize: 9, color: 'var(--text-faint)' },
                        children: '\u6309\u76D1\u63A7\u6307\u6807\u5F52\u53E3',
                      }),
                    ],
                  }),
                  w.jsxs('div', {
                    className: 'panel-body',
                    style: { padding: '4px 0 0' },
                    children: [
                      w.jsx('div', {
                        style: { padding: '8px 14px 10px' },
                        children: w.jsxs(Bl, {
                          size: 'small',
                          type: 'line',
                          activeTab: ['all', 'p1', 'verify', 'overdue'].includes(n) ? n : 'all',
                          onChange: r,
                          children: [
                            w.jsx(qr, { title: `\u5168\u90E8\u4E8B\u4EF6 ${C.length}` }, 'all'),
                            w.jsx(
                              qr,
                              { title: `\u4F18\u5148 ${C.filter((S) => S.level === 'p1').length}` },
                              'p1',
                            ),
                            w.jsx(
                              qr,
                              {
                                title: `\u5F85\u6838\u9A8C ${C.filter((S) => S.type === 'data' || S.type === 'co').length}`,
                              },
                              'verify',
                            ),
                            w.jsx(qr, { title: `\u8D85\u65F6 ${$.length}` }, 'overdue'),
                          ],
                        }),
                      }),
                      w.jsxs('div', {
                        className: 'event-list',
                        children: [
                          T.length === 0
                            ? w.jsx('div', {
                                style: { padding: '24px 14px' },
                                children: w.jsx(qs, {
                                  description:
                                    '\u5F53\u524D\u8303\u56F4\u6CA1\u6709\u5BF9\u5E94\u4E8B\u4EF6\uFF0C\u53EF\u66F4\u6362\u54C1\u7C7B\u8303\u56F4\u6216\u5207\u6362\u6807\u7B7E\u67E5\u770B',
                                }),
                              })
                            : null,
                          T.map(({ event: S }) =>
                            w.jsxs(
                              'div',
                              {
                                className: 'event-item',
                                children: [
                                  w.jsxs('div', {
                                    className: 'event-top',
                                    children: [
                                      O8(S.level),
                                      w.jsx('span', {
                                        className: 'event-title',
                                        children: S.title,
                                      }),
                                      S.overdue
                                        ? w.jsx(bt, {
                                            color: 'orangered',
                                            size: 'small',
                                            bordered: true,
                                            children: '\u8D85\u65F6',
                                          })
                                        : null,
                                      w.jsx('span', { className: 'event-time', children: S.time }),
                                    ],
                                  }),
                                  w.jsx('div', { className: 'event-desc', children: S.desc }),
                                  w.jsxs('div', {
                                    className: 'event-acts',
                                    children: [
                                      w.jsx(et, {
                                        size: 'mini',
                                        onClick: () => o(S),
                                        children: '\u67E5\u770B\u8BE6\u60C5',
                                      }),
                                      w.jsx(et, {
                                        size: 'mini',
                                        type: 'text',
                                        style: { color: 'var(--brand)' },
                                        onClick: () => u(S),
                                        children: '\u4EA4\u7ED9 AI \u5206\u6790',
                                      }),
                                      w.jsxs('span', {
                                        className: 'event-meta',
                                        style: { marginLeft: 'auto' },
                                        children: [
                                          '\u5F71\u54CD\uFF1A',
                                          rt[S.kpi].short,
                                          ' \xB7 ',
                                          Ls(S.category),
                                          ' \xB7 ',
                                          S.owner,
                                        ],
                                      }),
                                    ],
                                  }),
                                ],
                              },
                              S.id,
                            ),
                          ),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
              w.jsxs('div', {
                className: 'panel',
                ref: x,
                children: [
                  w.jsxs('div', {
                    className: 'panel-head',
                    children: [
                      w.jsx('h3', { children: '\u884C\u52A8\u5EFA\u8BAE' }),
                      w.jsxs(bt, {
                        color: 'orangered',
                        size: 'small',
                        bordered: true,
                        children: [N.length, ' \u5F85\u786E\u8BA4'],
                      }),
                      w.jsx('span', { className: 'spacer' }),
                      w.jsx('span', {
                        className: 'hint',
                        style: { fontSize: 9, color: 'var(--text-faint)' },
                        children:
                          '\u6BCF\u6761\u5EFA\u8BAE\u6807\u6CE8\u5F71\u54CD\u7684\u6307\u6807',
                      }),
                    ],
                  }),
                  w.jsxs('div', {
                    children: [
                      O.length === 0
                        ? w.jsx('div', {
                            style: { padding: '24px 14px' },
                            children: w.jsx(qs, {
                              description:
                                '\u5F53\u524D\u8303\u56F4\u6682\u65E0\u884C\u52A8\u5EFA\u8BAE',
                            }),
                          })
                        : null,
                      O.map((S) => {
                        const F = a.includes(S.id);
                        return w.jsxs(
                          'div',
                          {
                            className: 'sug',
                            children: [
                              w.jsx('div', { className: 'sug-title', children: S.title }),
                              w.jsx('div', { className: 'sug-target', children: S.target }),
                              w.jsxs('div', {
                                className: 'sug-reason',
                                children: [
                                  w.jsx('b', { children: '\u5EFA\u8BAE\u539F\u56E0\uFF1A' }),
                                  S.reason,
                                ],
                              }),
                              w.jsxs('div', {
                                className: 'sug-meta',
                                children: [
                                  w.jsx(bt, {
                                    size: 'small',
                                    color: F ? 'green' : 'gray',
                                    bordered: true,
                                    children: F
                                      ? '\u5DF2\u8FDB\u5165\u4EFB\u52A1\u8FFD\u8E2A'
                                      : '\u5F85\u4EBA\u5DE5\u786E\u8BA4',
                                  }),
                                  w.jsxs(bt, {
                                    size: 'small',
                                    color: 'red',
                                    bordered: true,
                                    children: ['\u5F71\u54CD\uFF1A', rt[S.kpiKey].short],
                                  }),
                                  w.jsxs(bt, {
                                    size: 'small',
                                    bordered: true,
                                    children: [S.grade, ' \xB7 ', dp[S.grade]],
                                  }),
                                  w.jsxs(bt, {
                                    size: 'small',
                                    bordered: true,
                                    children: ['\u7F6E\u4FE1\u5EA6 ', S.confidence],
                                  }),
                                ],
                              }),
                              w.jsxs('div', {
                                className: 'sug-acts',
                                children: [
                                  w.jsx(et, {
                                    size: 'mini',
                                    onClick: () => s(S),
                                    children: '\u67E5\u770B\u4F9D\u636E',
                                  }),
                                  w.jsx(et, {
                                    size: 'mini',
                                    type: F ? 'secondary' : 'primary',
                                    onClick: () => f(S),
                                    disabled: F,
                                    children: F ? '\u5DF2\u91C7\u7EB3' : S.cta,
                                  }),
                                ],
                              }),
                            ],
                          },
                          S.id,
                        );
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
          w.jsx('div', {
            className: 'block',
            ref: b,
            children: w.jsxs('div', {
              className: 'panel',
              children: [
                w.jsxs('div', {
                  className: 'panel-head',
                  children: [
                    w.jsx('h3', { children: '\u4EFB\u52A1\u8FFD\u8E2A' }),
                    w.jsxs('span', {
                      className: 'hint',
                      style: { fontSize: 10, color: 'var(--text-faint)' },
                      children: [
                        g.filter((S) => S.status !== 'done').length,
                        ' \u9879\u5F85\u8DDF\u8FDB \xB7 ',
                        k.length,
                        ' \u9879\u5904\u7406\u4E2D \xB7 ',
                        g.filter((S) => S.status === 'done').length,
                        ' \u9879\u5DF2\u5B8C\u6210',
                      ],
                    }),
                    w.jsx('span', { className: 'spacer' }),
                    w.jsx('span', {
                      className: 'hint',
                      style: { fontSize: 9, color: 'var(--text-faint)' },
                      children: '\u4EBA\u673A\u534F\u540C \xB7 \u8FC7\u7A0B\u53EF\u8FFD\u8E2A',
                    }),
                  ],
                }),
                w.jsx('div', {
                  className: 'panel-body',
                  style: { padding: '10px 14px 4px' },
                  children: w.jsxs(Bl, {
                    size: 'small',
                    type: 'line',
                    activeTab: E,
                    onChange: _,
                    children: [
                      w.jsx(qr, { title: `\u5168\u90E8 ${g.length}`, children: V(g) }, 'all'),
                      w.jsx(
                        qr,
                        { title: `\u5904\u7406\u4E2D ${k.length}`, children: V(k) },
                        'running',
                      ),
                      w.jsx(
                        qr,
                        {
                          title: `\u5F85\u8DDF\u8FDB ${g.filter((S) => S.status !== 'done').length}`,
                          children: V(g.filter((S) => S.status !== 'done')),
                        },
                        'todo',
                      ),
                      w.jsx(
                        qr,
                        {
                          title: `\u5DF2\u5B8C\u6210 ${g.filter((S) => S.status === 'done').length}`,
                          children: V(g.filter((S) => S.status === 'done')),
                        },
                        'done',
                      ),
                    ],
                  }),
                }),
              ],
            }),
          }),
          w.jsx('div', {
            style: {
              fontSize: 9,
              color: 'var(--text-faint)',
              lineHeight: 1.7,
              padding: '2px 2px 6px',
            },
            children:
              '\u5EFA\u8BAE\u4E0E\u4EFB\u52A1\u4EC5\u7528\u4E8E\u8BC4\u5BA1\u6F14\u793A\uFF1A\u91C7\u7EB3\u5EFA\u8BAE\u53EA\u4F1A\u5728\u672C\u9875\u751F\u6210\u8DDF\u8E2A\u4EFB\u52A1\uFF0C\u4E0D\u4F1A\u5411\u4EFB\u4F55\u4E1A\u52A1\u7CFB\u7EDF\u4E0B\u8FBE\u52A8\u4F5C\uFF1B\u6B63\u5F0F\u52A8\u4F5C\u9700\u7ECF\u6388\u6743\u5E76\u901A\u8FC7\u52A8\u4F5C\u7F51\u5173\u6267\u884C\u3002',
          }),
        ],
      }),
    ],
  });
}
const _k8 = Gr.TextArea,
  _i = (e) => {
    const t = Yt.find((n) => n.key === e);
    return t ? t.name : '\u5168\u54C1\u7C7B';
  };

function T8(e) {
  return (
    {
      plan: '计划节点',
      risk: '异常风险',
      data: '数据质量',
      co: '协同确认',
      decision: '决策授权',
      exec: '执行履约',
    }[e] || '业务事件'
  );
}
const j8 = () => Dr;

function $8() {
  const [e, t] = usePageViewField(
      y,
      categoryView,
      'category',
      null,
      (value) => value,
      (value) => (value === null || Yt.some((row) => row.key === value) ? value : null),
    ),
    [n, r] = usePageViewField(y, categoryView, 'view', 'all'),
    [a, i] = y.useState([]),
    [l, o] = y.useState([]),
    [v, p] = usePageViewField(y, categoryView, 'draft', ''),
    [m, C] = usePageViewField(
      y,
      categoryView,
      'eventId',
      null,
      (value) => value?.id ?? null,
      (id) => vp(categoryView.get().category ?? null).find((row) => row.id === id) ?? null,
    ),
    [O, g] = usePageViewField(
      y,
      categoryView,
      'suggestionId',
      null,
      (value) => value?.id ?? null,
      (id) => y8(categoryView.get().category ?? null).find((row) => row.id === id) ?? null,
    ),
    [h, x] = usePageViewField(
      y,
      categoryView,
      'drill',
      null,
      (value) => value,
      (value) => (Object.hasOwn(rt, value) ? value : null),
    ),
    [b, E] = usePageViewField(
      y,
      categoryView,
      'taskId',
      null,
      (value) => value?.id ?? null,
      (id) => x8(categoryView.get().category ?? null).find((row) => row.id === id) ?? null,
    ),
    [_, P] = usePageViewField(
      y,
      categoryView,
      'detail',
      null,
      (value) => value?.kind ?? null,
      (value) => (['calendar', 'evidence'].includes(value) ? { kind: value } : null),
    ),
    N = y.useMemo(() => ph(e), [e]),
    k = y.useMemo(() => ef(e), [e]),
    $ = e ? _i(e) : '\u5168\u90E8\u54C1\u7C7B',
    actions = useAuthorQuote(y),
    I = (text, label) => actions.quote(text, label ?? '品类分析问题'),
    W = (event) =>
      I(
        `请分析“${event.title}”，说明它对「${rt[event.kpi].name}」的影响、依据和优先行动。`,
        '事件分析',
      ),
    L = () => {
      I(
        `\u8BF7\u7ED3\u5408${$}\u8303\u56F4\uFF0C\u8BF4\u660E\u5404\u9879\u8003\u6838\u6307\u6807\u7684\u8FBE\u6210\u60C5\u51B5\u3001\u672A\u8FBE\u6807\u9879\u7684\u9A71\u52A8\u539F\u56E0\uFF0C\u4EE5\u53CA\u4F18\u5148\u884C\u52A8\u4E0E\u9700\u8981\u4EBA\u5DE5\u6838\u9A8C\u7684\u4E8B\u9879\u3002`,
      );
    },
    z = (T) => {
      if (a.includes(T.id)) return;
      i((S) => [...S, T.id]);
      const V = '09-21 10:05';
      o((S) => [
        ...S,
        {
          id: `tk-new-${T.id}`,
          title: `${T.cta}\uFF5C${T.title}`,
          category: T.category,
          eventId: T.eventIds[0],
          owner:
            T.grade === 'A3'
              ? '\u5E73\u53F0\u8BA1\u5212\uFF08\u5F85\u6388\u6743\uFF09'
              : T.grade === 'A4'
                ? '\u4E1A\u52A1\u89C4\u5219 Owner'
                : '\u54C1\u7C7B\u8BA1\u5212\u5458',
          due: '2026-09-24',
          status: 'pending',
          origin: `\u884C\u52A8\u5EFA\u8BAE \xB7 ${T.grade} \xB7 \u5F71\u54CD ${rt[T.kpiKey].short}`,
          logs: [
            [
              V,
              `\u7531\u884C\u52A8\u5EFA\u8BAE\u751F\u6210\u4EFB\u52A1\u8349\u7A3F\uFF08\u6F14\u793A\uFF09\uFF1B\u52A8\u4F5C\u5206\u7EA7 ${T.grade} \xB7 ${dp[T.grade]}\uFF1B\u5F71\u54CD\u6307\u6807 ${rt[T.kpiKey].name}`,
            ],
            [
              V,
              '\u7B49\u5F85\u8D23\u4EFB\u4EBA\u63A5\u5355\uFF1B\u6B63\u5F0F\u52A8\u4F5C\u9700\u7ECF\u6388\u6743\u540E\u7531\u52A8\u4F5C\u7F51\u5173\u6267\u884C\uFF08\u672C\u539F\u578B\u4E0D\u4E0B\u8FBE\uFF09',
            ],
          ],
        },
      ]);
      Co.success({
        content: `\u5DF2\u751F\u6210\u8DDF\u8E2A\u4EFB\u52A1\uFF1A${T.cta}\uFF08\u6F14\u793A\uFF0C\u4E0D\u5199\u5165\u4E1A\u52A1\u7CFB\u7EDF\uFF09`,
        duration: 2600,
      });
    },
    H = (T) =>
      T === 'calendar'
        ? P({ kind: 'calendar' })
        : T === 'evidence'
          ? P({ kind: 'evidence' })
          : x(T),
    R = () => {
      if (!h) return null;
      const T = rt[h];
      if (!T) return null;
      const V = k[h];
      return w.jsxs(Tn, {
        visible: true,
        title: `${T.name} \xB7 \u53E3\u5F84\u4E0E\u660E\u7EC6`,
        style: { width: 840 },
        footer: w.jsx(et, { onClick: () => x(null), children: '\u5173\u95ED' }),
        onCancel: () => x(null),
        children: [
          w.jsxs('div', {
            className: 'detail-sec',
            children: [
              w.jsx('h5', { children: '\u6307\u6807\u5B9A\u4E49' }),
              w.jsx('p', { children: T.def }),
              T.detail
                ? w.jsx('p', {
                    style: { marginTop: 6, color: 'var(--text-muted)' },
                    children: T.detail,
                  })
                : null,
            ],
          }),
          w.jsxs('div', {
            className: 'detail-sec',
            children: [
              w.jsx('h5', { children: '\u76D1\u63A7\u914D\u7F6E' }),
              w.jsxs('div', {
                className: 'kv-line',
                children: [
                  w.jsx('b', { children: '\u76D1\u63A7\u9891\u6B21' }),
                  w.jsx('span', { children: T.freq }),
                ],
              }),
              w.jsxs('div', {
                className: 'kv-line',
                children: [
                  w.jsx('b', { children: '\u76D1\u63A7\u8303\u56F4' }),
                  w.jsx('span', { children: T.range }),
                ],
              }),
              w.jsxs('div', {
                className: 'kv-line',
                children: [
                  w.jsx('b', { children: '\u6570\u636E\u6765\u6E90' }),
                  w.jsx('span', { children: T.source }),
                ],
              }),
              w.jsxs('div', {
                className: 'kv-line',
                children: [
                  w.jsx('b', { children: '\u76EE\u6807\u503C' }),
                  w.jsx('span', {
                    children: T.target != null ? `${T.target}${T.unit}` : T.targetNote,
                  }),
                ],
              }),
            ],
          }),
          w.jsxs('div', {
            className: 'detail-sec',
            children: [
              w.jsxs('h5', { children: ['\u5F53\u524D\u60C5\u51B5\uFF08', $, '\uFF09'] }),
              w.jsxs('div', {
                className: 'kpi-drill-head',
                children: [
                  w.jsxs('div', {
                    className: 'kdh-value',
                    children: [V.value, w.jsx('small', { children: T.unit })],
                  }),
                  w.jsx('div', {
                    className: `kdh-state is-${V.status.tone}`,
                    children: V.status.label,
                  }),
                  w.jsx('div', {
                    className: 'kdh-note',
                    children:
                      T.target != null
                        ? `\u76EE\u6807 ${T.target}${T.unit}\uFF0C\u8DDD\u76EE\u6807\u8FBE\u6210\u5EA6 ${V.attainment}%`
                        : T.targetNote ||
                          '\u76EE\u6807\u503C\u672A\u62A5\u5907\uFF0C\u65E0\u6CD5\u5224\u5B9A',
                  }),
                ],
              }),
              w.jsxs('table', {
                className: 'mini-table',
                children: [
                  w.jsx('thead', {
                    children: w.jsxs('tr', {
                      children: [
                        w.jsx('th', { children: '\u54C1\u7C7B' }),
                        w.jsx('th', { className: 'num', children: '\u5B9E\u9645\u503C' }),
                        w.jsx('th', { className: 'num', children: '\u76EE\u6807' }),
                        w.jsx('th', { className: 'num', children: '\u72B6\u6001' }),
                      ],
                    }),
                  }),
                  w.jsx('tbody', {
                    children: V.rows.map((S) => {
                      const F = O1(T, S.value);
                      return w.jsxs(
                        'tr',
                        {
                          children: [
                            w.jsx('td', { children: S.name }),
                            w.jsxs('td', { className: 'num', children: [S.value, T.unit] }),
                            w.jsx('td', {
                              className: 'num',
                              children:
                                T.target != null ? `${T.target}${T.unit}` : '\u672A\u62A5\u5907',
                            }),
                            w.jsxs('td', {
                              className: 'num',
                              children: [
                                w.jsx('span', { className: `dot-state is-${F.tone}` }),
                                F.label,
                              ],
                            }),
                          ],
                        },
                        S.key,
                      );
                    }),
                  }),
                ],
              }),
            ],
          }),
          T.note ? w.jsx('div', { className: 'callout warn', children: T.note }) : null,
          w.jsxs('div', {
            className: 'callout',
            style: { marginTop: 10 },
            children: [
              '\u6307\u6807\u53E3\u5F84\u4E0E\u76EE\u6807\u503C\u53C2\u8003\u5185\u90E8\u6587\u4EF6\uFF08',
              f8,
              '\uFF09\uFF1B\u5F53\u524D\u6570\u503C\u4E3A\u672C\u5730\u6F14\u793A\u6A21\u62DF\u503C\uFF0C\u4E0D\u4EE3\u8868\u771F\u5B9E\u4E1A\u52A1\u7ED3\u679C\u3002',
            ],
          }),
        ],
      });
    },
    M = () => {
      if (!m) return null;
      const T = m,
        V = k[T.kpi];
      return w.jsxs(Tn, {
        visible: true,
        title: T.title,
        style: { width: 740 },
        footer: w.jsxs('div', {
          style: { display: 'flex', gap: 8, justifyContent: 'flex-end' },
          children: [
            w.jsx(et, { onClick: () => C(null), children: '\u5173\u95ED' }),
            w.jsx(et, {
              type: 'primary',
              onClick: () => {
                W(T);
                C(null);
              },
              children: '\u4EA4\u7ED9 AI \u5206\u6790',
            }),
          ],
        }),
        onCancel: () => C(null),
        children: [
          w.jsxs('div', {
            style: { display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' },
            children: [
              w.jsx(bt, {
                color: T.level === 'p1' ? 'red' : T.level === 'p2' ? 'orangered' : 'gold',
                size: 'small',
                bordered: true,
                children: S1[T.level],
              }),
              T.overdue
                ? w.jsx(bt, {
                    color: 'orangered',
                    size: 'small',
                    bordered: true,
                    children: '\u8D85\u65F6',
                  })
                : null,
              w.jsxs(bt, {
                color: 'red',
                size: 'small',
                bordered: true,
                children: ['\u5F71\u54CD\uFF1A', rt[T.kpi].name],
              }),
              w.jsx(bt, { size: 'small', bordered: true, children: _i(T.category) }),
              w.jsx(bt, { size: 'small', bordered: true, children: T.time }),
              w.jsx(bt, { size: 'small', bordered: true, children: T8(T.type) }),
            ],
          }),
          w.jsxs('div', {
            className: 'detail-sec',
            children: [
              w.jsx('h5', { children: '\u4E8B\u4EF6\u63CF\u8FF0' }),
              w.jsx('p', { children: T.desc }),
            ],
          }),
          w.jsxs('div', {
            className: 'detail-sec',
            children: [
              w.jsx('h5', { children: '\u89E6\u53D1\u4F9D\u636E' }),
              w.jsx('div', { className: 'callout', children: T.trigger }),
            ],
          }),
          w.jsxs('div', {
            className: 'detail-sec',
            children: [
              w.jsx('h5', { children: '\u8BC1\u636E\u5FEB\u7167' }),
              T.evidence.map((S, F) =>
                w.jsxs(
                  'div',
                  {
                    className: 'kv-line',
                    children: [w.jsx('b', { children: S[0] }), w.jsx('span', { children: S[1] })],
                  },
                  F,
                ),
              ),
            ],
          }),
          w.jsxs('div', {
            className: 'detail-sec',
            children: [
              w.jsx('h5', { children: '\u884C\u52A8\u65B9\u5411' }),
              w.jsx('p', { children: T.next }),
            ],
          }),
          w.jsxs('div', {
            className: 'detail-sec',
            children: [
              w.jsx('h5', { children: '\u5F52\u53E3\u76D1\u63A7\u6307\u6807' }),
              w.jsxs('div', {
                className: 'kv-line',
                children: [
                  w.jsx('b', { children: '\u6307\u6807' }),
                  w.jsxs('span', {
                    children: [rt[T.kpi].name, '\uFF08', rt[T.kpi].freq, '\u76D1\u63A7\uFF09'],
                  }),
                ],
              }),
              w.jsxs('div', {
                className: 'kv-line',
                children: [
                  w.jsx('b', { children: '\u8D23\u4EFB\u89D2\u8272' }),
                  w.jsx('span', { children: T.owner }),
                ],
              }),
              w.jsxs('div', {
                className: 'kv-line',
                children: [
                  w.jsx('b', { children: '\u5F53\u524D\u60C5\u51B5' }),
                  w.jsx('span', {
                    children:
                      V.value == null
                        ? '\u76EE\u6807\u503C\u672A\u62A5\u5907\uFF0C\u65E0\u6CD5\u5224\u5B9A'
                        : `${V.value}${rt[T.kpi].unit} \xB7 \u76EE\u6807 ${rt[T.kpi].target != null ? `${rt[T.kpi].target}${rt[T.kpi].unit}` : '\u672A\u62A5\u5907'} \xB7 ${V.status.label}`,
                  }),
                ],
              }),
            ],
          }),
          w.jsxs('div', {
            className: 'callout warn',
            children: [
              '\u4E8B\u4EF6\u6765\u81EA\u672C\u5730\u6A21\u62DF\u5FEB\u7167\uFF08',
              qu,
              '\uFF09\uFF0C\u4E0D\u4EE3\u8868\u771F\u5B9E\u4E1A\u52A1\u9884\u8B66\uFF1B\u5173\u95ED\u6761\u4EF6\u4E3A\u201C\u6B63\u5F0F\u56DE\u6267\u9F50\u5168 + \u7ED3\u679C\u590D\u76D8\u5B8C\u6210\u201D\uFF0C\u672C\u539F\u578B\u4E0D\u4EA7\u751F\u56DE\u6267\u3002',
            ],
          }),
        ],
      });
    },
    j = () => {
      if (!O) return null;
      const T = O,
        V = a.includes(T.id);
      return w.jsxs(Tn, {
        visible: true,
        title: '\u884C\u52A8\u5EFA\u8BAE \xB7 \u4F9D\u636E\u4E0E\u5F71\u54CD',
        style: { width: 720 },
        footer: w.jsxs('div', {
          style: { display: 'flex', gap: 8, justifyContent: 'flex-end' },
          children: [
            w.jsx(et, { onClick: () => g(null), children: '\u5173\u95ED' }),
            w.jsx(et, {
              type: V ? 'secondary' : 'primary',
              disabled: V,
              onClick: () => {
                z(T);
                g(null);
              },
              children: V ? '\u5DF2\u91C7\u7EB3' : T.cta,
            }),
          ],
        }),
        onCancel: () => g(null),
        children: [
          w.jsxs('div', {
            className: 'detail-sec',
            children: [
              w.jsx('h5', { children: T.title }),
              w.jsx('p', {
                style: { color: 'var(--text-muted)', fontSize: 10 },
                children: T.target,
              }),
              w.jsx('div', {
                style: { marginTop: 8 },
                children: w.jsxs(bt, {
                  color: 'red',
                  size: 'small',
                  bordered: true,
                  children: ['\u5F71\u54CD\u6307\u6807\uFF1A', rt[T.kpiKey].name],
                }),
              }),
            ],
          }),
          w.jsxs('div', {
            className: 'detail-sec',
            children: [
              w.jsx('h5', { children: '\u5EFA\u8BAE\u539F\u56E0' }),
              w.jsx('div', { className: 'callout', children: T.reason }),
            ],
          }),
          w.jsxs('div', {
            className: 'detail-sec',
            children: [
              w.jsx('h5', { children: '\u9884\u671F\u5F71\u54CD' }),
              w.jsx('p', { children: T.impact }),
            ],
          }),
          w.jsxs('div', {
            className: 'detail-sec',
            children: [
              w.jsx('h5', {
                children: '\u4E0D\u786E\u5B9A\u6027\u4E0E\u5F85\u6838\u9A8C\u5047\u8BBE',
              }),
              w.jsx('div', { className: 'callout warn', children: T.uncertainty }),
            ],
          }),
          w.jsxs('div', {
            className: 'detail-sec',
            children: [
              w.jsx('h5', { children: '\u6267\u884C\u65B9\u5F0F\u4E0E\u6743\u9650' }),
              w.jsx('p', { children: T.action }),
              w.jsxs('div', {
                className: 'kv-line',
                style: { marginTop: 8 },
                children: [
                  w.jsx('b', { children: '\u52A8\u4F5C\u5206\u7EA7' }),
                  w.jsxs('span', {
                    children: [
                      T.grade,
                      ' \xB7 ',
                      dp[T.grade],
                      '\uFF1B\u7F6E\u4FE1\u5EA6 ',
                      T.confidence,
                    ],
                  }),
                ],
              }),
              w.jsxs('div', {
                className: 'kv-line',
                children: [
                  w.jsx('b', { children: '\u5173\u8054\u4E8B\u4EF6' }),
                  w.jsx('span', {
                    children: T.eventIds
                      .map((S) => (vp(null).find((F) => F.id === S) || {}).title)
                      .filter(Boolean)
                      .join('\uFF1B'),
                  }),
                ],
              }),
            ],
          }),
          w.jsx('div', {
            className: 'callout',
            children:
              'Agent \u53EA\u5F62\u6210\u65B9\u6848\uFF1A\u672C\u539F\u578B\u4E2D\u201C\u91C7\u7EB3\u201D\u4EC5\u751F\u6210\u8DDF\u8E2A\u4EFB\u52A1\uFF0C\u4E0D\u4FEE\u6539\u9700\u6C42\u7248\u672C\u3001\u4E0D\u8C03\u6574\u4EA7\u80FD\u3001\u4E0D\u4E0B\u8FBE\u8BA2\u5355\uFF1B\u88AB\u8986\u76D6\u7684 AI \u5EFA\u8BAE\u5FC5\u987B\u586B\u5199\u539F\u56E0\u7801\u3002',
          }),
        ],
      });
    },
    A = () => {
      if (!b) return null;
      const T = b;
      return w.jsxs(f1, {
        visible: true,
        title: '\u4EFB\u52A1\u8BE6\u60C5',
        width: 430,
        footer: w.jsx(et, { onClick: () => E(null), children: '\u5173\u95ED' }),
        onCancel: () => E(null),
        children: [
          w.jsxs('div', {
            className: 'detail-sec',
            children: [
              w.jsx('h5', { style: { fontSize: 13, lineHeight: 1.6 }, children: T.title }),
              w.jsxs('div', {
                style: { display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' },
                children: [
                  w.jsx(bt, {
                    size: 'small',
                    color:
                      T.status === 'done' ? 'green' : T.status === 'running' ? 'arcoblue' : 'gray',
                    bordered: true,
                    children: E1[T.status],
                  }),
                  w.jsx(bt, { size: 'small', bordered: true, children: _i(T.category) }),
                  w.jsx(bt, { size: 'small', bordered: true, children: T.origin }),
                ],
              }),
            ],
          }),
          w.jsx(R_, { style: { margin: '4px 0 14px' } }),
          w.jsxs('div', {
            className: 'kv-line',
            children: [
              w.jsx('b', { children: '\u8D23\u4EFB\u89D2\u8272' }),
              w.jsx('span', { children: T.owner }),
            ],
          }),
          w.jsxs('div', {
            className: 'kv-line',
            children: [
              w.jsx('b', { children: '\u5B8C\u6210\u65F6\u9650' }),
              w.jsx('span', { children: T.due }),
            ],
          }),
          w.jsxs('div', {
            className: 'kv-line',
            children: [
              w.jsx('b', { children: '\u9A8C\u6536\u6807\u51C6' }),
              w.jsx('span', {
                children:
                  '\u53CD\u9988\u7ED3\u8BBA + \u4F9D\u636E\uFF08\u6570\u91CF\u3001\u65F6\u70B9\u3001\u6765\u6E90\uFF09\uFF0C\u65E0\u4F9D\u636E\u4E0D\u4E88\u5173\u95ED',
              }),
            ],
          }),
          w.jsxs('div', {
            className: 'kv-line',
            children: [
              w.jsx('b', { children: '\u5173\u8054\u4E8B\u4EF6' }),
              w.jsx('span', {
                children: (vp(null).find((V) => V.id === T.eventId) || {}).title || '\u2014',
              }),
            ],
          }),
          w.jsxs('div', {
            className: 'detail-sec',
            style: { marginTop: 16 },
            children: [
              w.jsx('h5', { children: '\u5904\u7406\u8F68\u8FF9' }),
              w.jsx(Zu, {
                children: T.logs.map((V, S) => w.jsx(Zu.Item, { label: V[0], children: V[1] }, S)),
              }),
            ],
          }),
          w.jsx('div', {
            className: 'callout',
            children:
              '\u4EFB\u52A1\u72B6\u6001\u4EC5\u8868\u793A\u6F14\u793A\u6D41\u7A0B\uFF0C\u4E0D\u4F1A\u6539\u53D8\u5E93\u5B58\u3001\u9700\u6C42\u3001\u8BA1\u5212\u7248\u672C\u6216\u4E1A\u52A1\u7ED3\u679C\u3002',
          }),
        ],
      });
    },
    D = () =>
      _
        ? _.kind === 'calendar'
          ? w.jsxs(Tn, {
              visible: true,
              title: '\u8BA1\u5212\u65E5\u5386\u4E0E\u8FD0\u884C\u8282\u594F',
              style: { width: 740 },
              footer: w.jsx(et, { onClick: () => P(null), children: '\u5173\u95ED' }),
              onCancel: () => P(null),
              children: [
                w.jsxs('div', {
                  className: 'detail-sec',
                  children: [
                    w.jsx('h5', { children: '\u5F53\u524D\u8282\u70B9' }),
                    _1.map((T) =>
                      w.jsxs(
                        'div',
                        {
                          className: 'kv-line',
                          children: [
                            w.jsx('b', { children: T.name }),
                            w.jsxs('span', {
                              children: [
                                T.date,
                                ' \xB7 ',
                                T.dday >= 0
                                  ? `T\u2212${T.dday}`
                                  : `\u5DF2\u8FC7 ${Math.abs(T.dday)} \u5929`,
                                ' \xB7 ',
                                T.note,
                              ],
                            }),
                          ],
                        },
                        T.id,
                      ),
                    ),
                  ],
                }),
                w.jsxs('div', {
                  className: 'detail-sec',
                  children: [
                    w.jsx('h5', { children: '\u4E09\u5C42\u7ECF\u8425\u8282\u594F' }),
                    w.jsxs('div', {
                      className: 'kv-line',
                      children: [
                        w.jsx('b', { children: '\u6708\u5EA6' }),
                        w.jsx('span', {
                          children:
                            '\u5B9A\u65B9\u5411\uFF1A\u5171\u8BC6\u9700\u6C42\u3001\u5E93\u5B58\u7B56\u7565\u4E0E\u8D44\u6E90\u53D6\u820D\uFF1B\u6708\u521D\u4E3B\u8BA1\u5212\u8BC4\u4F30 25 / 26 \u65E5',
                        }),
                      ],
                    }),
                    w.jsxs('div', {
                      className: 'kv-line',
                      children: [
                        w.jsx('b', { children: '\u5468\u5EA6' }),
                        w.jsx('span', {
                          children:
                            '\u505A\u5E73\u8861\uFF1A\u6EDA\u52A8\u89E3\u51B3\u672A\u6765\u4F9B\u9700\u3001\u4EA7\u80FD\u3001\u7269\u6599\u4E0E\u8C03\u62E8\u95EE\u9898',
                        }),
                      ],
                    }),
                    w.jsxs('div', {
                      className: 'kv-line',
                      children: [
                        w.jsx('b', { children: '\u65E5\u5E38' }),
                        w.jsx('span', {
                          children:
                            '\u7BA1\u5F02\u5E38\uFF1A\u53D1\u73B0\u504F\u5DEE\u3001\u51C6\u5907\u5F71\u54CD\u4E0E\u5EFA\u8BAE\u3001\u8DDF\u8E2A\u65F6\u9650\u3001\u81EA\u52A8\u91CD\u7B97\u53D7\u5F71\u54CD\u94FE\u8DEF',
                        }),
                      ],
                    }),
                  ],
                }),
                w.jsxs('div', {
                  className: 'detail-sec',
                  children: [
                    w.jsx('h5', { children: 'KPI \u8003\u6838\u8282\u70B9' }),
                    w.jsxs('div', {
                      className: 'kv-line',
                      children: [
                        w.jsx('b', { children: '\u4E00\u8282\u70B9' }),
                        w.jsx('span', {
                          children:
                            '7\u201410 \u6708\uFF0C\u76EE\u6807\u53E3\u5F84\uFF1A\u65B0\u9C9C\u5EA6 97%\u3001\u8BA2\u5355\u6EE1\u8DB3\u7387 / \u5468\u8F6C\u6309\u8282\u70B9\u76EE\u6807\u6267\u884C',
                        }),
                      ],
                    }),
                    w.jsxs('div', {
                      className: 'kv-line',
                      children: [
                        w.jsx('b', { children: '\u4E8C\u8282\u70B9' }),
                        w.jsx('span', { children: '7\u20142 \u6708\uFF0C\u65B0\u9C9C\u5EA6 96%' }),
                      ],
                    }),
                    w.jsxs('div', {
                      className: 'kv-line',
                      children: [
                        w.jsx('b', { children: '\u5E74\u5EA6' }),
                        w.jsx('span', {
                          children:
                            '\u65B0\u9C9C\u5EA6 95.5%\u3001\u8BA2\u5355\u6EE1\u8DB3\u7387 91%\u3001\u8BA1\u5212\u51C6\u786E\u7387 78%\u3001\u5DE5\u5382\u4ED3\u5468\u8F6C 11 \u5929',
                        }),
                      ],
                    }),
                  ],
                }),
                w.jsx('div', {
                  className: 'callout',
                  children:
                    '\u672C\u539F\u578B\u7684\u65E5\u5386\u4E3A\u9759\u6001\u6F14\u793A\uFF1B\u771F\u5B9E\u7CFB\u7EDF\u6309\u4E1A\u52A1\u65E5\u5386\u4EA7\u751F\u4FE1\u53F7\u5E76\u89E6\u53D1\u4E8B\u4EF6\u3002',
                }),
              ],
            })
          : w.jsxs(Tn, {
              visible: true,
              title: 'AI \u6D1E\u5BDF \xB7 \u5206\u6790\u4F9D\u636E',
              style: { width: 740 },
              footer: w.jsx(et, { onClick: () => P(null), children: '\u5173\u95ED' }),
              onCancel: () => P(null),
              children: [
                w.jsxs('div', {
                  className: 'detail-sec',
                  children: [
                    w.jsx('h5', { children: '\u5F53\u524D\u4E1A\u52A1\u8303\u56F4' }),
                    w.jsxs('p', {
                      children: [
                        $,
                        ' \xB7 \u5168\u94FE\u53E3\u5F84\uFF08\u57FA\u5730\u4ED3 + \u5206\u4ED3 + \u7ECF\u9500\u5546\u7AEF\uFF09\xB7 \u5FEB\u7167 ',
                        qu,
                      ],
                    }),
                  ],
                }),
                w.jsxs('div', {
                  className: 'detail-sec',
                  children: [
                    w.jsx('h5', { children: '\u76D1\u63A7\u6307\u6807\uFF08\u7ED3\u679C\uFF09' }),
                    j8().map((T) => {
                      const V = k[T];
                      return w.jsxs(
                        'div',
                        {
                          className: 'kv-line',
                          children: [
                            w.jsx('b', { children: rt[T].short }),
                            w.jsxs('span', {
                              children: [
                                V.value == null
                                  ? '\u76EE\u6807\u503C\u672A\u62A5\u5907'
                                  : `${V.value}${rt[T].unit}`,
                                ` \xB7 \u76EE\u6807 ${rt[T].target != null ? `${rt[T].target}${rt[T].unit}` : '\u672A\u62A5\u5907'} \xB7 ${V.status.label}`,
                              ],
                            }),
                          ],
                        },
                        T,
                      );
                    }),
                  ],
                }),
                w.jsxs('div', {
                  className: 'detail-sec',
                  children: [
                    w.jsx('h5', { children: '\u9A71\u52A8\u6307\u6807\uFF08\u4E8B\u5B9E\uFF09' }),
                    w.jsxs('div', {
                      className: 'kv-line',
                      children: [
                        w.jsx('b', { children: '\u5168\u94FE\u53EF\u552E\u5929\u6570' }),
                        w.jsxs('span', {
                          children: [
                            N.chainDays,
                            ' \u5929\uFF08',
                            N.chainStock,
                            ' \u5428 \xF7 ',
                            N.dailyShip,
                            ' \u5428/\u65E5\uFF09',
                          ],
                        }),
                      ],
                    }),
                    w.jsxs('div', {
                      className: 'kv-line',
                      children: [
                        w.jsx('b', { children: '\u5DE5\u5382\u4ED3\u53EF\u552E\u5929\u6570' }),
                        w.jsxs('span', {
                          children: [
                            N.baseDays,
                            ' \u5929\uFF08\u5DE5\u5382\u4ED3 ',
                            N.baseStock,
                            ' \u5428\uFF09',
                          ],
                        }),
                      ],
                    }),
                    w.jsxs('div', {
                      className: 'kv-line',
                      children: [
                        w.jsx('b', { children: 'RCCP \u6EE1\u8DB3\u7387' }),
                        w.jsxs('span', {
                          children: [N.rccpRate, '%\uFF0C\u7F3A\u53E3 ', N.gapTons, ' \u5428'],
                        }),
                      ],
                    }),
                    w.jsxs('div', {
                      className: 'kv-line',
                      children: [
                        w.jsx('b', { children: '\u4EA7\u9500\u7387' }),
                        w.jsxs('span', {
                          children: [
                            N.dealRate,
                            '%\uFF08\u4EA7\u91CF ',
                            N.produceTons,
                            ' \u5428 / \u53D1\u8D27 ',
                            N.shipTons,
                            ' \u5428\uFF09',
                          ],
                        }),
                      ],
                    }),
                    w.jsxs('div', {
                      className: 'kv-line',
                      children: [
                        w.jsx('b', { children: '\u8D85\u671F\u5E93\u5B58' }),
                        w.jsxs('span', {
                          children: [
                            N.overstockTons,
                            ' \u5428\uFF08\u8D85 60 \u5929\u53E3\u5F84\uFF09',
                          ],
                        }),
                      ],
                    }),
                    w.jsxs('div', {
                      className: 'kv-line',
                      children: [
                        w.jsx('b', { children: '\u672A\u6EE1\u8DB3\u8BA2\u5355' }),
                        w.jsxs('span', { children: [N.unmetOrders, ' \u5F20'] }),
                      ],
                    }),
                    w.jsxs('div', {
                      className: 'kv-line',
                      children: [
                        w.jsx('b', { children: '\u504F\u79BB AI \u57FA\u7EBF' }),
                        w.jsxs('span', {
                          children: [
                            N.deviation,
                            ' \u5428\uFF08\u03A3 \u4E0A\u62A5 \u2212 \u03A3 \u57FA\u7EBF\uFF09',
                          ],
                        }),
                      ],
                    }),
                  ],
                }),
                w.jsxs('div', {
                  className: 'detail-sec',
                  children: [
                    w.jsx('h5', { children: '\u4ECE\u4E8B\u5B9E\u5230\u6D1E\u5BDF' }),
                    w.jsx('p', {
                      children:
                        '\u5148\u6309\u5404\u6307\u6807\u53E3\u5F84\u7B97\u51FA\u5B9E\u9645\u503C\u4E0E\u76EE\u6807\u503C\u7684\u5BF9\u7167\uFF0C\u518D\u628A\u672A\u8FBE\u6807\u7684\u9879\u5F52\u56E0\u5230\u53EF\u5E72\u9884\u7684\u9A71\u52A8\u6307\u6807\uFF08\u4EA7\u80FD\u3001\u5E93\u5B58\u7ED3\u6784\u3001\u8BA1\u5212\u504F\u5DEE\u3001\u8D85\u671F\u6279\u6B21\uFF09\uFF1B \u6700\u540E\u6309\u4E8B\u4EF6\u7C7B\u578B\u5206\u7EA7\uFF0C\u53EA\u6709\u8FBE\u5230\u6570\u636E\u8D28\u91CF\u95E8\u69DB\u3001\u4E14\u9700\u8981\u8DE8\u89D2\u8272\u534F\u540C\u6216\u51B3\u7B56\u7684\u4FE1\u53F7\u624D\u8FDB\u5165\u9884\u8B66\u6E05\u5355\u3002',
                    }),
                  ],
                }),
                w.jsxs('div', {
                  className: 'detail-sec',
                  children: [
                    w.jsx('h5', {
                      children:
                        '\u4E09\u7C7B\u53E3\u5F84\u4E0D\u53EF\u4E92\u63A8\uFF08\u6613\u6DF7\u70B9\uFF09',
                    }),
                    w.jsxs('div', {
                      className: 'kv-line',
                      children: [
                        w.jsx('b', { children: '\u5E93\u5B58\u5468\u8F6C\u5929\u6570' }),
                        w.jsx('span', {
                          children:
                            '\u5168\u56FD\u5DE5\u5382\u4ED3\u6708\u672B\u5E93\u5B58 \xF7\uFF08\u4E0B\u6708\u9500\u552E\u8BA1\u5212 \xF7 \u4E0B\u6708\u5B9E\u9645\u5929\u6570\uFF09\uFF1B\u76EE\u6807 11 \u5929',
                        }),
                      ],
                    }),
                    w.jsxs('div', {
                      className: 'kv-line',
                      children: [
                        w.jsx('b', { children: '\u5168\u94FE\u5468\u8F6C\u5929\u6570' }),
                        w.jsxs('span', {
                          children: [
                            '\u5F53\u6708\u5929\u6570 \xF7 ',
                            '[ \u6708\u9500\u552E\u51FA\u5E93\u4EF6\u6570 \xF7 \u5E73\u5747\u5E93\u5B58\u4EF6\u6570 ]',
                            '\uFF1B\u8986\u76D6\u603B\u4ED3 + \u5206\u4ED3 + \u7ECF\u9500\u5546\u4ED3\uFF0C\u76EE\u6807\u6309\u5355\u72EC\u5907\u6848',
                          ],
                        }),
                      ],
                    }),
                    w.jsxs('div', {
                      className: 'kv-line',
                      children: [
                        w.jsx('b', { children: '\u4EA7\u54C1\u65B0\u9C9C\u5EA6' }),
                        w.jsx('span', {
                          children:
                            '1 \u2212 \u5DE5\u5382\u6708\u672B\u8D85\u671F\u4EA7\u54C1\u91CF \xF7 \u603B\u5E93\u5B58\u91CF\uFF1B\u8D85\u671F\u53E3\u5F84\u4E3A\u8D85 60 \u5929\uFF08BP/\u7535\u5546/DC \u4E13\u4F9B\u6309 90 \u5929\uFF09',
                        }),
                      ],
                    }),
                    w.jsx('div', {
                      className: 'callout warn',
                      style: { marginTop: 8 },
                      children:
                        '\u300C\u5168\u94FE\u53EF\u552E 45 \u5929\u504F\u9AD8\u63D0\u9192\u300D\u662F\u672C\u5DE5\u4F5C\u53F0\u7684\u64CD\u4F5C\u6027\u63D0\u793A\u53E3\u5F84\uFF0C\u4E0E\u4E0A\u8FF0\u76D1\u63A7\u53E3\u5F84\u4E0D\u540C\uFF0C\u4E0D\u53EF\u4E92\u76F8\u6362\u7B97\u3002',
                    }),
                  ],
                }),
                w.jsxs('div', {
                  className: 'detail-sec',
                  children: [
                    w.jsx('h5', { children: '\u52A8\u4F5C\u5206\u7EA7\u4E0E\u6743\u9650' }),
                    w.jsxs('div', {
                      className: 'kv-line',
                      children: [
                        w.jsx('b', { children: 'A1' }),
                        w.jsx('span', {
                          children:
                            'Agent \u8D77\u8349\uFF0C\u4EBA\u5DE5\u8865\u8BC1\uFF08\u5982\u9000\u56DE\u62A5\u6587\uFF09',
                        }),
                      ],
                    }),
                    w.jsxs('div', {
                      className: 'kv-line',
                      children: [
                        w.jsx('b', { children: 'A2' }),
                        w.jsx('span', {
                          children:
                            'Agent \u751F\u6210\uFF0C\u8BA1\u5212\u5458\u786E\u8BA4\u540E\u63A8\u8FDB',
                        }),
                      ],
                    }),
                    w.jsxs('div', {
                      className: 'kv-line',
                      children: [
                        w.jsx('b', { children: 'A3' }),
                        w.jsx('span', {
                          children:
                            '\u9700\u6388\u6743\uFF1A\u8DE8\u57FA\u5730\u8C03\u62E8\u3001\u4EA7\u80FD\u8C03\u5242\u7B49\u53D6\u820D\u7C7B\u52A8\u4F5C',
                        }),
                      ],
                    }),
                    w.jsxs('div', {
                      className: 'kv-line',
                      children: [
                        w.jsx('b', { children: 'A4' }),
                        w.jsx('span', {
                          children:
                            '\u987B\u4E1A\u52A1 Owner \u51B3\u7B56\uFF1A\u76EE\u6807\u503C\u62A5\u5907\u3001\u89C4\u5219\u4E0E\u9608\u503C\u53D8\u66F4',
                        }),
                      ],
                    }),
                  ],
                }),
                w.jsxs('div', {
                  className: 'detail-sec',
                  children: [
                    w.jsx('h5', { children: '\u4E94\u6761\u6D41\u7A0B\u7EAA\u5F8B' }),
                    w.jsx('p', {
                      children:
                        '\u65E0\u4E8B\u4EF6\u5361\u4E0D\u534F\u540C\uFF1B\u65E0\u51B3\u7B56\u4E8B\u9879\u4E0D\u5F00\u4F1A\uFF1B\u65E0\u539F\u56E0\u7801\u4E0D\u8986\u76D6 AI \u5EFA\u8BAE\uFF1B\u65E0\u8D23\u4EFB\u4EBA\u3001\u65F6\u9650\u548C\u9A8C\u6536\u6807\u51C6\u4E0D\u6D3E\u53D1\u4EFB\u52A1\uFF1B \u65E0\u7CFB\u7EDF\u56DE\u6267\u548C\u7ED3\u679C\u590D\u76D8\u4E0D\u5173\u95ED\u4E8B\u4EF6\u3002',
                    }),
                  ],
                }),
                w.jsx('div', {
                  className: 'callout warn',
                  children:
                    '\u672C\u539F\u578B\u7684\u201CAI \u6D1E\u5BDF\u201D\u7531\u672C\u5730\u89C4\u5219\u57FA\u4E8E\u6240\u9644\u5FEB\u7167\u62FC\u88C5\uFF0C\u672A\u8C03\u7528\u771F\u5B9E\u5927\u6A21\u578B\uFF1B\u5230\u8D27\u65F6\u95F4\u3001\u4FC3\u9500\u3001\u4EA7\u80FD\u3001\u4FE1\u7528\u3001\u6279\u6B21\u660E\u7EC6\u7B49\u672A\u77E5\u9879\u5747\u4E0D\u4F5C\u8865\u5145\u5047\u8BBE\u3002',
                }),
              ],
            })
        : null;
  y.useEffect(() => {
    const reset = () => {
      i([]);
      o([]);
    };
    window.addEventListener('gea-session-changed', reset);
    window.addEventListener('gea-identity-changed', reset);
    return () => {
      window.removeEventListener('gea-session-changed', reset);
      window.removeEventListener('gea-identity-changed', reset);
    };
  }, []);
  return w.jsxs('div', {
    className: 'app',
    children: [
      w.jsx(N8, {
        category: e,
        setCategory: t,
        view: n,
        setView: r,
        adopted: a,
        extraTasks: l,
        onDrill: H,
        onEventDetail: C,
        onEventAsk: W,
        onSugDetail: g,
        onSugAdopt: z,
        onTaskOpen: E,
        onInsightAsk: L,
        questionTools: w.jsx(AuthorQuestions, {
          react: y,
          jsx: w,
          Button: et,
          questions: [
            ...Mx.map((row) => ({ label: row.label, text: row.prompt })),
            ...C8.map((text) => ({ label: text, text })),
          ],
          draft: v,
          onClearDraft: () => p(''),
          actions,
        }),
      }),
      R(),
      M(),
      j(),
      A(),
      D(),
    ],
  });
}
Yw(document.getElementById('root')).render(w.jsx(c.StrictMode, { children: w.jsx($8, {}) }));
