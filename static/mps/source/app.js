import { mpsView, useMpsPart, useMpsNavigation } from './context.js';
import { AuthorQuestions, useAuthorQuote } from '../../../business/shared/author-questions.js';
import { usePageViewField } from '../../../business/shared/view-state.js';
const changedRows = (rows, baseline) =>
  rows.filter(
    (row) => JSON.stringify(row) !== JSON.stringify(baseline.find((item) => item.id === row.id)),
  );
const restoredRows = (changes, baseline) => [
  ...baseline.map((row) => changes.find((item) => item.id === row.id) ?? row),
  ...changes.filter((row) => !baseline.some((item) => item.id === row.id)),
];
function kO(e, t) {
  const [n, r] = e.split('-').map(Number),
    a = new Date(n, r - 1 + t, 1);
  return `${a.getFullYear()}\u5E74${a.getMonth() + 1}\u6708`;
}
function jO(e, t) {
  const [n, r] = e.split('-').map(Number),
    a = new Date(n, r - 1 + t, 1);
  return `${a.getFullYear()}-${String(a.getMonth() + 1).padStart(2, '0')}`;
}
const k1 = [
    {
      value: 'monthly',
      label: '\u6708\u521D',
      desc: '\u53D6\u5DF2\u751F\u6548\u7684\u6708\u521D\u9700\u6C42\u8BA1\u5212',
    },
    {
      value: 'adjust',
      label: '\u7EA0\u504F',
      desc: '\u53D6\u5DF2\u751F\u6548\u7684\u6708\u7EA0\u504F\u9700\u6C42\u8BA1\u5212',
    },
  ],
  IO = [0, 1, 2].map((e) => ({ value: jO(No.month, e), label: kO(No.month, e) })),
  ig = [1, 2, 3].map((e) => ({
    value: jO(No.month, -12 * e),
    label: kO(No.month, -12 * e),
    tag: ['\u53BB\u5E74\u540C\u671F', '\u524D\u5E74\u540C\u671F', '\u5927\u524D\u5E74\u540C\u671F'][
      e - 1
    ],
  })),
  TO = {
    'report-monthly': {
      title:
        '\u8BA1\u5212\u63D0\u62A5\u6570\u636E \xB7 \u660E\u7EC6\u9884\u89C8\uFF08\u6708\u521D\u53E3\u5F84\uFF09',
      sub: '\u6309\u6708\u521D\u8BA1\u5212\u53E3\u5F84\u53D6\u6570\uFF0C\u4EC5\u542B\u5DF2\u751F\u6548\u7248\u672C',
      cols: [
        '\u5DE5\u5382',
        '\u7ECF\u9500\u5546\u5206\u533A',
        '\u533A\u57DF',
        '\u4F9B\u5E94\u5546/\u5BA2\u6237',
        '\u7269\u6599\u7EC4\u540D\u79F0',
        '\u4EA7\u54C1\u7F16\u7801',
        '\u4EA7\u54C1\u540D\u79F0',
        '\u6708\u4EFD',
        '\u6708\u8BA1\u5212\u91CF',
        '\u6700\u7EC8\u8BA1\u7B97\u91CF',
      ],
      rows: [
        [
          '\u90D1\u5DDE',
          '\u534E\u4E2D\u76F4\u8425\u5206\u533A',
          '\u90D1\u5DDE\u5E02\u8FD0\u8425\u533A',
          '\u90D1\u5DDE\u601D\u5FF5\u98DF\u54C1',
          '12g\u5927\u5305\u88C5\u6C64\u5706',
          '10003235',
          '\u601D\u5FF5800g\u7B80\u88C5\u9ED1\u829D\u9EBB\u6C64\u5706\uFF0810\u888B\uFF09',
          '2026-10',
          1300,
          1300,
        ],
        [
          '\u90D1\u5DDE',
          '\u534E\u4E2D\u76F4\u8425\u5206\u533A',
          '\u90D1\u5DDE\u5E02\u8FD0\u8425\u533A',
          '\u90D1\u5DDE\u601D\u5FF5\u98DF\u54C1',
          '12g\u5927\u5305\u88C5\u6C64\u5706',
          '10003234',
          '\u601D\u5FF5800g\u7B80\u88C5\u82B1\u751F\u6C64\u5706\uFF0810\u888B\uFF09',
          '2026-10',
          1e3,
          1e3,
        ],
        [
          '\u90D1\u5DDE',
          '\u534E\u4E2D\u76F4\u8425\u5206\u533A',
          '\u90D1\u5DDE\u5E02\u8FD0\u8425\u533A',
          '\u90D1\u5DDE\u601D\u5FF5\u98DF\u54C1',
          '\u91D1\u724C\u867E\u997A',
          '10002232',
          '\u601D\u5FF5480g\u91D1\u724C\u867E\u81F3\u81FB\u867E\u7687\u997A\uFF0816\u888B\uFF09',
          '2026-10',
          6801,
          6801,
        ],
        [
          '\u90D1\u5DDE',
          '\u534E\u4E2D\u76F4\u8425\u5206\u533A',
          '\u90D1\u5DDE\u5E02\u8FD0\u8425\u533A',
          '\u90D1\u5DDE\u601D\u5FF5\u98DF\u54C1',
          '\u91D1\u724C\u867E\u997A',
          '10002234',
          '\u601D\u5FF5480g\u91D1\u724C\u867E\u867E\u4EC1\u4E09\u9C9C\u6C34\u997A\uFF0816\u888B\uFF09',
          '2026-10',
          661,
          661,
        ],
        [
          '\u90D1\u5DDE',
          '\u534E\u4E2D\u76F4\u8425\u5206\u533A',
          '\u90D1\u5DDE\u5E02\u8FD0\u8425\u533A',
          '\u90D1\u5DDE\u601D\u5FF5\u98DF\u54C1',
          '\u7EB8\u76AE\u70E7\u9EA6',
          '10004818',
          '\u601D\u5FF5240\u7C92\u7ECF\u5178\u4E09\u4E01\u7EB8\u76AE\u70E7\u9EA6\uFF0824\u888B\uFF09',
          '2026-10',
          540,
          540,
        ],
        [
          '\u534E\u4E1C',
          '\u534E\u4E1C\u76F4\u8425\u5206\u533A',
          '\u534E\u4E1C\u76F4\u8425\u533A',
          '\u534E\u4E1C\u601D\u5FF5\u98DF\u54C1',
          '\u534E\u4E1C\u5B9A\u5236\u8D85\u503C\u88C5\u5C0F\u5706\u5B50',
          '10006369',
          '\u601D\u5FF5202g\u8D85\u503C\u88C5\u767D\u7CEF\u5C0F\u5706\u5B50\uFF0840\u888B\uFF09',
          '2026-10',
          446,
          446,
        ],
        [
          '\u534E\u5357',
          '\u534E\u5357\u76F4\u8425\u5206\u533A',
          '\u534E\u5357\u76F4\u8425\u533A',
          '\u534E\u5357\u601D\u5FF5\u98DF\u54C1',
          '\u4E94\u5408\u5B9A\u5236\u5C0F\u5706\u5B50',
          '10006494',
          '\u601D\u5FF5500g\u767D\u7CEF\u5C0F\u5706\u5B50\uFF0820\u888B\uFF09\uFF08\u4E94\u5408\u5B9A\u5236)',
          '2026-10',
          412,
          412,
        ],
        [
          '\u9042\u5E73',
          '\u534E\u4E2D\u76F4\u8425\u5206\u533A',
          '\u9A7B\u9A6C\u5E97\u8FD0\u8425\u533A',
          '\u9042\u5E73\u601D\u5FF5\u98DF\u54C1',
          'BP\u5C0F\u5706\u5B50',
          '10002656',
          'BP\u601D\u5FF51kg\u767D\u7CEF\u5C0F\u5706\u5B50\uFF0810\u888B\uFF09',
          '2026-10',
          1500,
          1500,
        ],
        [
          '\u897F\u5357',
          '\u897F\u5357\u76F4\u8425\u5206\u533A',
          '\u897F\u5357\u76F4\u8425\u533A',
          '\u897F\u5357\u601D\u5FF5\u98DF\u54C1',
          '\u9E21\u8089\u7C7B\u8C03\u7406',
          '10004111',
          'BP\u601D\u5FF5150g\u5965\u5C14\u826F\u98CE\u5473\u9E21\u8089\u6D77\u82D4\u996D\u56E2\uFF0880\u888B\uFF09',
          '2026-10',
          276,
          276,
        ],
        [
          '\u534E\u4E1C',
          '\u534E\u4E1C\u76F4\u8425\u5206\u533A',
          '\u534E\u4E1C\u76F4\u8425\u533A',
          '\u534E\u4E1C\u601D\u5FF5\u98DF\u54C1',
          '\u98DE\u997C\u7CFB\u5217',
          '10000283',
          '\u601D\u5FF5300g\u897F\u57DF\u5B5C\u7136\u5473\u98DE\u997C\uFF0816\u888B\uFF09',
          '2026-10',
          468,
          468,
        ],
      ],
    },
    'report-adjust': {
      title:
        '\u8BA1\u5212\u63D0\u62A5\u6570\u636E \xB7 \u660E\u7EC6\u9884\u89C8\uFF08\u7EA0\u504F\u53E3\u5F84\uFF09',
      sub: '\u6309\u7EA0\u504F\u8BA1\u5212\u53E3\u5F84\u53D6\u6570\uFF0C\u6BD4\u6708\u521D\u53E3\u5F84\u591A\u51FA\u5171\u8BA1\u5212\u6570\u91CF\u4E0E\u751F\u4EA7\u8BA1\u5212\u91CF',
      cols: [
        '\u5DE5\u5382',
        '\u7ECF\u9500\u5546\u5206\u533A',
        '\u5927\u533A',
        '\u4F9B\u5E94\u5546/\u5BA2\u6237',
        '\u7269\u6599\u7EC4\u540D\u79F0',
        '\u4EA7\u54C1\u7F16\u7801',
        '\u4EA7\u54C1\u540D\u79F0',
        '\u6708\u4EFD',
        '\u6708\u8BA1\u5212\u6570',
        '\u5171\u8BA1\u5212\u6570\u91CF',
        '\u751F\u4EA7\u8BA1\u5212\u91CF',
      ],
      rows: [
        [
          '\u90D1\u5DDE',
          '\u534E\u4E2D\u76F4\u8425\u5206\u533A',
          '\u534E\u4E2D\u5927\u533A',
          '\u90D1\u5DDE\u601D\u5FF5\u98DF\u54C1',
          '12g\u5927\u5305\u88C5\u6C64\u5706',
          '10003235',
          '\u601D\u5FF5800g\u7B80\u88C5\u9ED1\u829D\u9EBB\u6C64\u5706\uFF0810\u888B\uFF09',
          '2026-10',
          1300,
          1300,
          1300,
        ],
        [
          '\u90D1\u5DDE',
          '\u534E\u4E2D\u76F4\u8425\u5206\u533A',
          '\u534E\u4E2D\u5927\u533A',
          '\u90D1\u5DDE\u601D\u5FF5\u98DF\u54C1',
          '12g\u5927\u5305\u88C5\u6C64\u5706',
          '10003234',
          '\u601D\u5FF5800g\u7B80\u88C5\u82B1\u751F\u6C64\u5706\uFF0810\u888B\uFF09',
          '2026-10',
          1e3,
          1e3,
          1e3,
        ],
        [
          '\u90D1\u5DDE',
          '\u534E\u4E2D\u76F4\u8425\u5206\u533A',
          '\u534E\u4E2D\u5927\u533A',
          '\u90D1\u5DDE\u601D\u5FF5\u98DF\u54C1',
          '\u91D1\u724C\u867E\u997A',
          '10002232',
          '\u601D\u5FF5480g\u91D1\u724C\u867E\u81F3\u81FB\u867E\u7687\u997A\uFF0816\u888B\uFF09',
          '2026-10',
          6801,
          6801,
          6801,
        ],
        [
          '\u90D1\u5DDE',
          '\u534E\u4E2D\u76F4\u8425\u5206\u533A',
          '\u534E\u4E2D\u5927\u533A',
          '\u90D1\u5DDE\u601D\u5FF5\u98DF\u54C1',
          '\u91D1\u724C\u867E\u997A',
          '10002234',
          '\u601D\u5FF5480g\u91D1\u724C\u867E\u867E\u4EC1\u4E09\u9C9C\u6C34\u997A\uFF0816\u888B\uFF09',
          '2026-10',
          661,
          661,
          661,
        ],
        [
          '\u90D1\u5DDE',
          '\u534E\u4E2D\u76F4\u8425\u5206\u533A',
          '\u534E\u4E2D\u5927\u533A',
          '\u90D1\u5DDE\u601D\u5FF5\u98DF\u54C1',
          '\u7EB8\u76AE\u70E7\u9EA6',
          '10004818',
          '\u601D\u5FF5240\u7C92\u7ECF\u5178\u4E09\u4E01\u7EB8\u76AE\u70E7\u9EA6\uFF0824\u888B\uFF09',
          '2026-10',
          540,
          540,
          540,
        ],
        [
          '\u534E\u4E1C',
          '\u534E\u4E1C\u76F4\u8425\u5206\u533A',
          '\u534E\u4E1C\u5927\u533A',
          '\u534E\u4E1C\u601D\u5FF5\u98DF\u54C1',
          '\u534E\u4E1C\u5B9A\u5236\u8D85\u503C\u88C5\u5C0F\u5706\u5B50',
          '10006369',
          '\u601D\u5FF5202g\u8D85\u503C\u88C5\u767D\u7CEF\u5C0F\u5706\u5B50\uFF0840\u888B\uFF09',
          '2026-10',
          446,
          446,
          446,
        ],
        [
          '\u534E\u5357',
          '\u534E\u5357\u76F4\u8425\u5206\u533A',
          '\u534E\u5357\u5927\u533A',
          '\u534E\u5357\u601D\u5FF5\u98DF\u54C1',
          '\u4E94\u5408\u5B9A\u5236\u5C0F\u5706\u5B50',
          '10006494',
          '\u601D\u5FF5500g\u767D\u7CEF\u5C0F\u5706\u5B50\uFF0820\u888B\uFF09\uFF08\u4E94\u5408\u5B9A\u5236)',
          '2026-10',
          412,
          412,
          412,
        ],
        [
          '\u9042\u5E73',
          '\u534E\u4E2D\u76F4\u8425\u5206\u533A',
          '\u534E\u4E2D\u5927\u533A',
          '\u9042\u5E73\u601D\u5FF5\u98DF\u54C1',
          'BP\u5C0F\u5706\u5B50',
          '10002656',
          'BP\u601D\u5FF51kg\u767D\u7CEF\u5C0F\u5706\u5B50\uFF0810\u888B\uFF09',
          '2026-10',
          1500,
          1500,
          1500,
        ],
        [
          '\u897F\u5357',
          '\u897F\u5357\u76F4\u8425\u5206\u533A',
          '\u897F\u5357\u5927\u533A',
          '\u897F\u5357\u601D\u5FF5\u98DF\u54C1',
          '\u9E21\u8089\u7C7B\u8C03\u7406',
          '10004111',
          'BP\u601D\u5FF5150g\u5965\u5C14\u826F\u98CE\u5473\u9E21\u8089\u6D77\u82D4\u996D\u56E2\uFF0880\u888B\uFF09',
          '2026-10',
          276,
          276,
          276,
        ],
        [
          '\u534E\u4E1C',
          '\u534E\u4E1C\u76F4\u8425\u5206\u533A',
          '\u534E\u4E1C\u5927\u533A',
          '\u534E\u4E1C\u601D\u5FF5\u98DF\u54C1',
          '\u98DE\u997C\u7CFB\u5217',
          '10000283',
          '\u601D\u5FF5300g\u897F\u57DF\u5B5C\u7136\u5473\u98DE\u997C\uFF0816\u888B\uFF09',
          '2026-10',
          468,
          468,
          468,
        ],
      ],
    },
    growth: {
      title: '\u6210\u957F\u9884\u6D4B\u6570\u636E \xB7 \u660E\u7EC6\u9884\u89C8',
      sub: '\u4E24\u79CD\u6A21\u578B\u7684\u6700\u7EC8\u7ED3\u679C\uFF0C\u53EA\u63D0\u4F9B 10 \u6708\u521D\u4E0E 11 \u6708\u6EDA\u52A8\u4E24\u671F\uFF1B\u4E0D\u542B\u8BA1\u5212\u63D0\u62A5\u4E0E\u8003\u6838\u76EE\u6807',
      cols: [
        '\u57FA\u5730',
        '\u7269\u6599',
        '\u7269\u6599\u63CF\u8FF0-\u6A21\u578B',
        '2026-10\u6708\u521D',
        '2026-11\u6708\u6EDA\u52A8',
      ],
      rows: [
        [
          '\u90D1\u5DDE',
          '10002232',
          '\u601D\u5FF5480g\u91D1\u724C\u867E\u81F3\u81FB\u867E\u7687\u997A\uFF0816\u888B\uFF09',
          6801,
          4075,
        ],
        [
          '\u90D1\u5DDE',
          '10002234',
          '\u601D\u5FF5480g\u91D1\u724C\u867E\u867E\u4EC1\u4E09\u9C9C\u6C34\u997A\uFF0816\u888B\uFF09',
          661,
          392,
        ],
        [
          '\u90D1\u5DDE',
          '10002235',
          '\u601D\u5FF5480g\u91D1\u724C\u867E\u867E\u4EC1\u7389\u7C73\u6C34\u997A\uFF0816\u888B\uFF09',
          485,
          314,
        ],
        [
          '\u90D1\u5DDE',
          '10002576',
          'BP\u601D\u5FF52.5kg\u704C\u6C64\u6C34\u997A\u4E09\u9C9C\uFF084\u888B\uFF09',
          5953,
          5922,
        ],
        [
          '\u9042\u5E73',
          '10002683',
          '\u601D\u5FF5500g\u732A\u8089\u767D\u83DC\u6C34\u997A\uFF0820\u888B\uFF09',
          3120,
          2980,
        ],
        [
          '\u534E\u4E1C',
          '10003102',
          '\u601D\u5FF5400g\u9ED1\u829D\u9EBB\u6C64\u5706\uFF0820\u888B\uFF09',
          2460,
          2310,
        ],
      ],
    },
    ship: {
      title: '\u5386\u53F2\u53D1\u8D27\u6570\u636E \xB7 \u660E\u7EC6\u9884\u89C8',
      sub: '\u4ECE BI \u540C\u6B65\u7684\u5B9E\u9645\u53D1\u8D27\uFF1B\u53D1\u8D27\u91CF\u5355\u4F4D\u6309\u300C\u4EF6\u300D\u6682\u5217\uFF0C\u5F85\u4E1A\u52A1\u786E\u8BA4',
      cols: [
        '\u5E74\u6708',
        '\u57FA\u5730',
        '\u5927\u7C7B',
        '\u7269\u6599',
        '\u7269\u6599\u63CF\u8FF0',
        '\u53D1\u8D27\u91CF',
        '\u5355\u4F4D',
      ],
      rows: [
        [
          '2015\u5E7410\u6708',
          '\u534E\u4E1C',
          '\u997C\u7C7B',
          '10000283',
          '\u601D\u5FF5300g\u897F\u57DF\u5B5C\u7136\u5473\u98DE\u997C\uFF0816\u888B\uFF09',
          468,
          '\u4EF6',
        ],
        [
          '2015\u5E7410\u6708',
          '\u534E\u4E1C',
          '\u997C\u7C7B',
          '10000284',
          '\u601D\u5FF5300g\u6D53\u60C5\u9999\u8549\u5473\u98DE\u997C\uFF0816\u888B\uFF09',
          921,
          '\u4EF6',
        ],
        [
          '2015\u5E7410\u6708',
          '\u534E\u4E1C',
          '\u997C\u7C7B',
          '10000285',
          '\u601D\u5FF5300g\u5370\u5EA6\u5496\u55B1\u5473\u98DE\u997C\uFF0816\u888B\uFF09',
          490,
          '\u4EF6',
        ],
        [
          '2015\u5E7410\u6708',
          '\u534E\u4E1C',
          '\u997C\u7C7B',
          '10000286',
          '\u601D\u5FF5300g\u8471\u6CB9\u98CE\u5473\u98DE\u997C\uFF0816\u888B\uFF09',
          6778,
          '\u4EF6',
        ],
        [
          '2026\u5E748\u6708',
          '\u90D1\u5DDE',
          '\u4F11\u95F2',
          '10004111',
          'BP\u601D\u5FF5150g\u5965\u5C14\u826F\u98CE\u5473\u9E21\u8089\u6D77\u82D4\u996D\u56E2\uFF0880\u888B\uFF09',
          276,
          '\u4EF6',
        ],
      ],
    },
  },
  OV = [
    [
      '\u90D1\u5DDE',
      '\u6C64\u5706',
      '10003102',
      '\u601D\u5FF5400g\u9ED1\u829D\u9EBB\u6C64\u5706\uFF0820\u888B\uFF09',
      786,
    ],
    [
      '\u90D1\u5DDE',
      '\u6C64\u5706',
      '10003105',
      '\u601D\u5FF5500g\u82B1\u751F\u6C64\u5706\uFF0820\u888B\uFF09',
      412,
    ],
    [
      '\u90D1\u5DDE',
      '\u997A\u5B50',
      '10002234',
      '\u601D\u5FF5480g\u91D1\u724C\u867E\u867E\u4EC1\u4E09\u9C9C\u6C34\u997A\uFF0816\u888B\uFF09',
      1198,
    ],
    [
      '\u90D1\u5DDE',
      '\u997A\u5B50',
      '10002235',
      '\u601D\u5FF5480g\u91D1\u724C\u867E\u867E\u4EC1\u7389\u7C73\u6C34\u997A\uFF0816\u888B\uFF09',
      968,
    ],
    [
      '\u90D1\u5DDE',
      '\u9762\u70B9',
      '10004818',
      '\u601D\u5FF5240\u7C92\u7ECF\u5178\u4E09\u4E01\u7EB8\u76AE\u70E7\u9EA6\uFF0824\u888B\uFF09',
      446,
    ],
    [
      '\u90D1\u5DDE',
      '\u8C03\u7406\u8089\u5236\u54C1',
      '10003610',
      '\u601D\u5FF5250g\u539F\u5473\u9E21\u5757\uFF0820\u888B\uFF09',
      418,
    ],
    [
      '\u9042\u5E73',
      '\u6C64\u5706',
      '10003110',
      '\u601D\u5FF5400g\u9ED1\u829D\u9EBB\u6C64\u5706\uFF0820\u888B\uFF09',
      596,
    ],
    [
      '\u534E\u4E1C',
      '\u9762\u70B9',
      '10004820',
      '\u601D\u5FF5300g\u5976\u9EC4\u5305\uFF0820\u888B\uFF09',
      402,
    ],
  ];
ig.forEach((e, t) => {
  const n = 1 - t * 0.06;
  TO[`ship-${e.value}`] = {
    title: `\u5386\u53F2\u53D1\u8D27\u6570\u636E \xB7 \u660E\u7EC6\u9884\u89C8\uFF08${e.label}\uFF09`,
    sub: `${e.tag} \xB7 ${e.label} \u5B9E\u9645\u53D1\u8D27\uFF0C\u7528\u4E8E\u8D8B\u52BF\u53C2\u7167\u4E0E\u51C6\u786E\u7387\u56DE\u7B97\uFF1B\u5355\u4F4D\u5F85\u786E\u8BA4`,
    cols: [
      '\u5E74\u6708',
      '\u57FA\u5730',
      '\u5927\u7C7B',
      '\u7269\u6599',
      '\u7269\u6599\u63CF\u8FF0',
      '\u53D1\u8D27\u91CF',
      '\u5355\u4F4D',
    ],
    rows: OV.map((r) => [e.value, r[0], r[1], r[2], r[3], Math.round(r[4] * n), '\u4EF6']),
  };
});
const Ud = [
    {
      month: 'M+1 \xB7 10 \u6708',
      cat: '\u6C64\u5706',
      demand: 1250,
      open: 180,
      plan: 1260,
      ok: 1260,
      gap: 0,
    },
    {
      month: 'M+1 \xB7 10 \u6708',
      cat: '\u997A\u5B50',
      demand: 1690,
      open: 240,
      plan: 1720,
      ok: 1720,
      gap: 0,
    },
    {
      month: 'M+1 \xB7 10 \u6708',
      cat: '\u9762\u70B9',
      demand: 803,
      open: 90,
      plan: 810,
      ok: 810,
      gap: 0,
    },
    {
      month: 'M+1 \xB7 10 \u6708',
      cat: '\u8C03\u7406\u8089\u5236\u54C1',
      demand: 698,
      open: 120,
      plan: 700,
      ok: 700,
      gap: 0,
    },
    {
      month: 'M+2 \xB7 11 \u6708',
      cat: '\u6C64\u5706',
      demand: 1310,
      open: 200,
      plan: 1350,
      ok: 1350,
      gap: 0,
    },
    {
      month: 'M+2 \xB7 11 \u6708',
      cat: '\u997A\u5B50',
      demand: 1780,
      open: 230,
      plan: 1820,
      ok: 1530,
      gap: -290,
    },
    {
      month: 'M+2 \xB7 11 \u6708',
      cat: '\u9762\u70B9',
      demand: 840,
      open: 95,
      plan: 850,
      ok: 850,
      gap: 0,
    },
    {
      month: 'M+2 \xB7 11 \u6708',
      cat: '\u8C03\u7406\u8089\u5236\u54C1',
      demand: 720,
      open: 110,
      plan: 730,
      ok: 730,
      gap: 0,
    },
    {
      month: 'M+3 \xB7 12 \u6708',
      ref: true,
      cat: '\u6C64\u5706',
      demand: 1290,
      open: 210,
      plan: 1300,
      ok: 1300,
      gap: 0,
    },
    {
      month: 'M+3 \xB7 12 \u6708',
      ref: true,
      cat: '\u997A\u5B50',
      demand: 1740,
      open: 235,
      plan: 1760,
      ok: 1760,
      gap: 0,
    },
    {
      month: 'M+3 \xB7 12 \u6708',
      ref: true,
      cat: '\u9762\u70B9',
      demand: 830,
      open: 92,
      plan: 835,
      ok: 835,
      gap: 0,
    },
    {
      month: 'M+3 \xB7 12 \u6708',
      ref: true,
      cat: '\u8C03\u7406\u8089\u5236\u54C1',
      demand: 700,
      open: 115,
      plan: 710,
      ok: 710,
      gap: 0,
    },
  ],
  SV = [
    { k: '\u73B0\u5E93\u5B58', v: '832 \u5428' },
    { k: '\u8C03\u62E8\u5165\u5E93\uFF08\u542B\u5728\u9014\uFF09', v: '+ 86 \u5428' },
    { k: '\u672C\u6708\u5269\u4F59\u6392\u4EA7', v: '+ 210 \u5428' },
    { k: '\u672C\u6708\u9884\u4F30\u53D1\u8FD0', v: '\u2212 1,690 \u5428' },
    { k: '\u5176\u4E2D\u5DF2\u53D1\u8D27', v: '+ 1,192 \u5428' },
    { k: '\u8C03\u62E8\u51FA\u5E93', v: '\u2212 0 \u5428' },
    {
      k: '\u63A8\u7B97\u671F\u521D\u5E93\u5B58\uFF08\u4E0B\u6708\uFF09',
      v: '630 \u5428',
      bold: true,
    },
  ],
  ar = { planMonth: '2026-10', curMonth: '2026-09', cutOff: '09-22', restDays: 8, monthDays: 30 },
  dl = [
    {
      id: 'ZZ-TY',
      base: '\u90D1\u5DDE',
      cat: '\u6C64\u5706',
      shipped: 352,
      rest: 148,
      stock: 230,
      inbound: 30,
      restProd: 68,
    },
    {
      id: 'ZZ-JZ',
      base: '\u90D1\u5DDE',
      cat: '\u997A\u5B50',
      shipped: 430,
      rest: 180,
      stock: 306,
      inbound: 36,
      restProd: 78,
    },
    {
      id: 'ZZ-MD',
      base: '\u90D1\u5DDE',
      cat: '\u9762\u70B9',
      shipped: 246,
      rest: 94,
      stock: 144,
      inbound: 10,
      restProd: 30,
    },
    {
      id: 'ZZ-TL',
      base: '\u90D1\u5DDE',
      cat: '\u8C03\u7406\u8089\u5236\u54C1',
      shipped: 164,
      rest: 76,
      stock: 152,
      inbound: 10,
      restProd: 34,
    },
    {
      id: 'SP-TY',
      base: '\u9042\u5E73',
      cat: '\u6C64\u5706',
      shipped: 208,
      rest: 92,
      stock: 150,
      inbound: 0,
      restProd: 42,
    },
    {
      id: 'SP-JZ',
      base: '\u9042\u5E73',
      cat: '\u997A\u5B50',
      shipped: 296,
      rest: 132,
      stock: 188,
      inbound: 0,
      restProd: 54,
    },
    {
      id: 'SP-MD',
      base: '\u9042\u5E73',
      cat: '\u9762\u70B9',
      shipped: 122,
      rest: 58,
      stock: 96,
      inbound: 0,
      restProd: 22,
    },
    {
      id: 'SP-TL',
      base: '\u9042\u5E73',
      cat: '\u8C03\u7406\u8089\u5236\u54C1',
      shipped: 84,
      rest: 40,
      stock: 60,
      inbound: 0,
      restProd: 16,
    },
    {
      id: 'HD-TY',
      base: '\u534E\u4E1C',
      cat: '\u6C64\u5706',
      shipped: 176,
      rest: 78,
      stock: 128,
      inbound: 0,
      restProd: 34,
    },
    {
      id: 'HD-JZ',
      base: '\u534E\u4E1C',
      cat: '\u997A\u5B50',
      shipped: 214,
      rest: 96,
      stock: 132,
      inbound: 0,
      restProd: 38,
    },
    {
      id: 'HD-MD',
      base: '\u534E\u4E1C',
      cat: '\u9762\u70B9',
      shipped: 248,
      rest: 106,
      stock: 156,
      inbound: 0,
      restProd: 44,
    },
    {
      id: 'HD-TL',
      base: '\u534E\u4E1C',
      cat: '\u8C03\u7406\u8089\u5236\u54C1',
      shipped: 96,
      rest: 44,
      stock: 66,
      inbound: 0,
      restProd: 18,
    },
    {
      id: 'HN-TY',
      base: '\u534E\u5357',
      cat: '\u6C64\u5706',
      shipped: 132,
      rest: 60,
      stock: 102,
      inbound: 0,
      restProd: 26,
    },
    {
      id: 'HN-JZ',
      base: '\u534E\u5357',
      cat: '\u997A\u5B50',
      shipped: 168,
      rest: 76,
      stock: 108,
      inbound: 0,
      restProd: 30,
    },
    {
      id: 'HN-MD',
      base: '\u534E\u5357',
      cat: '\u9762\u70B9',
      shipped: 196,
      rest: 86,
      stock: 124,
      inbound: 0,
      restProd: 34,
    },
    {
      id: 'HN-TL',
      base: '\u534E\u5357',
      cat: '\u8C03\u7406\u8089\u5236\u54C1',
      shipped: 142,
      rest: 64,
      stock: 96,
      inbound: 0,
      restProd: 28,
    },
    {
      id: 'XN-TY',
      base: '\u897F\u5357',
      cat: '\u6C64\u5706',
      shipped: 88,
      rest: 42,
      stock: 70,
      inbound: 0,
      restProd: 18,
    },
    {
      id: 'XN-JZ',
      base: '\u897F\u5357',
      cat: '\u997A\u5B50',
      shipped: 96,
      rest: 44,
      stock: 72,
      inbound: 0,
      restProd: 20,
    },
    {
      id: 'XN-MD',
      base: '\u897F\u5357',
      cat: '\u9762\u70B9',
      shipped: 84,
      rest: 38,
      stock: 62,
      inbound: 0,
      restProd: 16,
    },
    {
      id: 'XN-TL',
      base: '\u897F\u5357',
      cat: '\u8C03\u7406\u8089\u5236\u54C1',
      shipped: 126,
      rest: 58,
      stock: 88,
      inbound: 0,
      restProd: 26,
    },
    {
      id: 'PY-TY',
      base: '\u6FEE\u9633',
      cat: '\u6C64\u5706',
      shipped: 0,
      rest: 0,
      stock: 0,
      inbound: 0,
      restProd: 0,
      noData: true,
    },
    {
      id: 'PY-JZ',
      base: '\u6FEE\u9633',
      cat: '\u997A\u5B50',
      shipped: 0,
      rest: 0,
      stock: 0,
      inbound: 0,
      restProd: 0,
      noData: true,
    },
    {
      id: 'PY-MD',
      base: '\u6FEE\u9633',
      cat: '\u9762\u70B9',
      shipped: 0,
      rest: 0,
      stock: 0,
      inbound: 0,
      restProd: 0,
      noData: true,
    },
    {
      id: 'PY-TL',
      base: '\u6FEE\u9633',
      cat: '\u8C03\u7406\u8089\u5236\u54C1',
      shipped: 0,
      rest: 0,
      stock: 0,
      inbound: 0,
      restProd: 0,
      noData: true,
    },
  ],
  EV = [
    { base: '\u90D1\u5DDE', need: 42800, yearBase: 46500, m1: 92, m2: 88, m3: 81 },
    { base: '\u9042\u5E73', need: 31200, yearBase: 4e4, m1: 78, m2: 82, m3: 76 },
    { base: '\u534E\u4E1C', need: 21300, yearBase: 3e4, m1: 71, m2: 74, m3: 69 },
    { base: '\u534E\u5357', need: 27200, yearBase: 32e3, m1: 85, m2: 86, m3: 80 },
    { base: '\u897F\u5357', need: 12800, yearBase: 2e4, m1: 64, m2: 68, m3: 62 },
    { base: '\u6FEE\u9633', need: 26400, yearBase: 3e4, m1: 88, m2: 91, m3: 84 },
  ],
  PV = [
    {
      k: '\u6570\u636E\u6765\u6E90',
      v: '\u6700\u65B0\u7248\u5E74\u5EA6\u751F\u4EA7\u8BA1\u5212\uFF089.20 \u7248\uFF09',
    },
    {
      k: '\u4EA7\u7EBF\u5C5E\u6027',
      v: '\u4E13\u7EBF / \u67D4\u7EBF\uFF08\u5E74\u5EA6\u89C4\u5212\u53E3\u5F84\uFF0C\u9700\u6620\u5C04\u5230\u5DE5\u4F5C\u4E2D\u5FC3\uFF09',
    },
    {
      k: '\u81EA\u4EA7\u5916\u534F\u6BD4\u4F8B',
      v: '8 : 2\uFF08\u5E74\u5EA6\u89C4\u5212\u53E3\u5F84\uFF09',
    },
    { k: '\u6838\u5FC3\u74F6\u9888', v: '\u96A7\u9053 \xB7 \u6210\u578B\u673A' },
    {
      k: '\u7EA6\u675F\u53E3\u5F84',
      v: '\u53EA\u770B\u5428\u4EA7\u80FD\uFF0C\u4EF6\u4EA7\u80FD\u4E0D\u4F5C\u4E3A\u7EA6\u675F',
    },
  ],
  NV = [
    {
      line: '\u534E\u4E1C \xB7 \u9762\u70B9\u7CFB\u5217',
      rate: 93,
      tunnel: 88,
      former: 96,
      note: '\u6210\u578B\u673A\u5DF2\u5230\u4E0A\u9650\uFF0CM+2 \u524D\u5FC5\u987B\u5904\u7F6E',
    },
    {
      line: '\u90D1\u5DDE \xB7 \u997A\u5B50\u7CFB\u5217',
      rate: 84,
      tunnel: 79,
      former: 82,
      note: '\u6392\u4EA7\u96C6\u4E2D\u5728\u4E0B\u65EC\uFF0C\u5EFA\u8BAE\u524D\u79FB',
    },
    {
      line: '\u90D1\u5DDE \xB7 \u6C64\u5706\u7CFB\u5217',
      rate: 78,
      tunnel: 74,
      former: 70,
      note: '\u6B63\u5E38',
    },
    {
      line: '\u9042\u5E73 \xB7 \u8C03\u7406\u8089\u5236\u54C1\u7CFB\u5217',
      rate: 71,
      tunnel: 66,
      former: 68,
      note: '\u6B63\u5E38',
    },
  ],
  kV = [
    {
      name: '\u9762\u70B9 2 \u53F7\u7EBF\u6362\u7EBF\u4F18\u5316',
      status: '\u5DF2\u5151\u73B0',
      promise: '+180 \u5428',
      actual: '+175 \u5428',
      owner: '\u534E\u4E1C\u57FA\u5730',
    },
    {
      name: '\u90D1\u5DDE 3 \u53F7\u7EBF\u52A0\u73ED\u6392\u4EA7',
      status: '\u5DF2\u5151\u73B0',
      promise: '+120 \u5428',
      actual: '+118 \u5428',
      owner: '\u90D1\u5DDE\u57FA\u5730',
    },
    {
      name: '\u6FEE\u9633\u8DE8\u57FA\u5730\u8F6C\u4EA7',
      status: '\u5EF6\u671F',
      promise: '+200 \u5428',
      actual: '+80 \u5428',
      owner: '\u6FEE\u9633\u57FA\u5730',
    },
    {
      name: '\u8C03\u7406\u7EBF\u63D0\u524D\u751F\u4EA7',
      status: '\u5F85\u56DE\u6267',
      promise: '+90 \u5428',
      actual: '\u2014',
      owner: '\u8C03\u7406\u4E8B\u4E1A\u90E8',
    },
  ],
  j1 = [
    {
      base: '\u534E\u4E1C',
      cat: '\u9762\u70B9',
      month: 'M+2',
      gap: 210,
      yearCap: '\u8D85\u5E74\u5EA6\u4E0A\u9650 210 \u5428',
      over: true,
      action: '\u9700\u5904\u7F6E',
    },
    {
      base: '\u90D1\u5DDE',
      cat: '\u997A\u5B50',
      month: 'M+2',
      gap: 290,
      yearCap: '\u672A\u8D85\u5E74\u5EA6\u4E0A\u9650',
      over: false,
      action: '\u57FA\u5730\u5185\u6D88\u5316',
    },
    {
      base: '\u9042\u5E73',
      cat: '\u8C03\u7406\u8089\u5236\u54C1',
      month: 'M+3',
      gap: 120,
      yearCap: '\u53C2\u8003\u503C',
      over: false,
      action: '\u672C\u671F\u4E0D\u5904\u7F6E',
    },
  ],
  jV = [
    {
      id: 'out',
      name: '\u5916\u534F\u8865\u5145',
      desc: '\u628A\u8D85\u51FA\u5E74\u5EA6\u4E0A\u9650\u7684\u90E8\u5206\u4EA4\u7531\u5916\u534F\u4EA7\u80FD\u627F\u63A5\uFF0C\u6309\u5E74\u5EA6\u89C4\u5212\u7684 8:2 \u81EA\u4EA7\u5916\u534F\u6BD4\u4F8B\u6267\u884C\u3002',
      effect: '\u53EF\u8986\u76D6\u5168\u90E8\u8D85\u51FA\u91CF 210 \u5428',
      cost: '\u52A0\u5DE5\u6210\u672C\u9AD8\u4E8E\u81EA\u4EA7\uFF0C\u6309\u6210\u672C\u5E93\u53E3\u5F84\u6D4B\u7B97',
      side: '\u4E0D\u5360\u7528\u672C\u57FA\u5730\u4EA7\u7EBF\uFF1B\u9700\u8BC4\u4F30\u5916\u534F\u8D28\u91CF\u4E0E\u4EA4\u671F\u7A33\u5B9A\u6027',
    },
    {
      id: 'adjust',
      name: '\u9500\u552E\u7AEF\u8C03\u6574\u9700\u6C42\u7ED3\u6784',
      desc: '\u7531\u9500\u552E\u7AEF\u8C03\u6574\u9700\u6C42\u5728\u54C1\u7C7B\u6216\u671F\u95F4\u4E0A\u7684\u7ED3\u6784\uFF0C\u628A\u91CF\u632A\u5230\u4EA7\u80FD\u5BCC\u4F59\u7684\u6708\u4EFD\u6216\u54C1\u7C7B\u3002',
      effect: '\u53EF\u964D\u4F4E\u672C\u57FA\u5730\u5CF0\u503C\u8D1F\u8377',
      cost: '\u4E0D\u4EA7\u751F\u76F4\u63A5\u6210\u672C',
      side: '\u9700\u8981\u9500\u552E\u914D\u5408\uFF0C\u8C03\u6574\u7ED3\u679C\u56DE\u6D41\u4E0A\u6E38\u9700\u6C42\u6D41\u7A0B',
    },
  ],
  IV = [
    {
      k: '\u627F\u63A5\u4F18\u5148\u7EA7',
      v: '\u540C\u7CFB\u5217\u4EA7\u80FD\u4E0D\u8DB3\u65F6\u6309\u9700\u6C42\u91CF\u4ECE\u9AD8\u5230\u4F4E\u6392\u5E8F\u627F\u63A5\uFF0C\u7F3A\u53E3\u90E8\u5206\u4F18\u5148\u91CA\u653E\u9700\u6C42\u91CF\u8F83\u4F4E\u7684 SKU',
    },
    {
      k: '\u67D4\u7EBF\u5339\u914D',
      v: '\u6EA2\u51FA\u4EA7\u80FD\u4F18\u5148\u5339\u914D\u540C\u5C5E\u6027\u7684\u67D4\u6027\u4EA7\u7EBF\uFF0C\u4E0D\u505A\u8DE8\u54C1\u7C7B\u5F3A\u5236\u8C03\u914D',
    },
    {
      k: '\u7EA6\u675F\u53E3\u5F84',
      v: '\u53EA\u770B\u5428\u4EA7\u80FD\uFF1B\u4EF6\u4EA7\u80FD\u4E0D\u4F5C\u4E3A\u7EA6\u675F\uFF1B\u4EBA\u529B\u8D44\u6E90\u4E0D\u7EB3\u5165\u672C\u6B21\u8BC4\u4F30',
    },
    {
      k: '\u5904\u7F6E\u8FB9\u754C',
      v: '\u53EA\u8F93\u51FA\u4E24\u7C7B\u65B9\u5411\u4F9B\u4EBA\u5DE5\u51B3\u7B56\uFF0C\u4E0D\u505A\u81EA\u52A8\u65B9\u6848\u63A8\u8350\u4E0E\u6392\u5E8F',
    },
  ],
  I1 = [
    {
      cat: '\u4EA7\u80FD',
      content: '\u90D1\u5DDE 3 \u53F7\u7EBF 10 \u6708\u4E0D\u53EF\u7528',
      target: '\u90D1\u5DDE / \u4EA7\u7EBF',
      strength: '\u786C',
      source: '\u57FA\u5730\u53CD\u9988',
      until: '10-31',
    },
    {
      cat: '\u5DE5\u827A',
      content: '\u7CBD\u5B50\u5FC5\u987B\u81EA\u4EA7\uFF0C\u4E0D\u59D4\u5916',
      target: '\u5168\u90E8\u57FA\u5730 / \u7CBD\u5B50',
      strength: '\u786C',
      source: '\u5DE5\u827A\u8981\u6C42',
      until: '\u957F\u671F',
    },
    {
      cat: '\u5E93\u5B58',
      content: '\u671F\u672B\u5E93\u5B58\u4E0D\u4F4E\u4E8E 12 \u5929\u7528\u91CF',
      target: '\u5168\u90E8\u57FA\u5730',
      strength: '\u8F6F',
      source: '\u8BA1\u5212\u53E3\u5F84',
      until: '\u957F\u671F',
    },
    {
      cat: '\u8C03\u62E8',
      content: '\u5355\u6708\u8C03\u62E8\u4E0D\u8D85\u8FC7 400 \u5428',
      target: '\u534E\u4E1C\u57FA\u5730',
      strength: '\u786C',
      source: '\u7269\u6D41\u80FD\u529B',
      until: '12-31',
    },
    {
      cat: '\u6210\u672C',
      content: '\u4EE3\u5DE5\u6210\u672C\u4E0A\u9650 +8%',
      target: '\u5168\u90E8\u57FA\u5730',
      strength: '\u8F6F',
      source: '\u6210\u672C\u7BA1\u63A7',
      until: '\u957F\u671F',
    },
    {
      cat: '\u4E1A\u52A1',
      content: '\u65B0\u54C1\u63D0\u524D\u671F\u4E0D\u5C11\u4E8E 15 \u5929',
      target: '\u5168\u90E8\u57FA\u5730',
      strength: '\u786C',
      source: '\u4E1A\u52A1\u89C4\u5219',
      until: '\u957F\u671F',
    },
  ],
  Kd = {
    title: '\u90D1\u5DDE 3 \u53F7\u7EBF\u505C\u7528 \xD7 \u671F\u672B\u5E93\u5B58\u4E0B\u9650',
    detail:
      '\u4E24\u6761\u786C\u7EA6\u675F\u53E0\u52A0\u540E\uFF0C\u90D1\u5DDE M+2 \u6709 3 \u4E2A\u5355\u54C1\u65E0\u6CD5\u540C\u65F6\u6EE1\u8DB3\u3002\u82E5\u7EF4\u6301\u4EA7\u7EBF\u505C\u7528\uFF0C\u9700\u653E\u5BBD\u671F\u672B\u5E93\u5B58\u4E0B\u9650\u81F3 8 \u5929\uFF0C\u53EF\u6362\u53D6 210 \u5428\u53EF\u6EE1\u8DB3\u91CF\uFF1B\u4E5F\u53EF\u4EE5\u6062\u590D\u90E8\u5206\u73ED\u6B21\uFF0C\u7528\u4EBA\u5DE5\u6210\u672C\u6362\u4EA7\u80FD\u3002',
    options: [
      {
        k: '\u7EF4\u6301\u505C\u7528 + \u653E\u5BBD\u5E93\u5B58\u4E0B\u9650\u81F3 8 \u5929',
        v: '\u53EF\u6EE1\u8DB3\u91CF +210 \u5428',
        rec: true,
      },
      {
        k: '\u6062\u590D 3 \u53F7\u7EBF\u90E8\u5206\u73ED\u6B21',
        v: '\u53EF\u6EE1\u8DB3\u91CF +290 \u5428\uFF0C\u4EBA\u5DE5\u6210\u672C +1.4 \u4E07',
        rec: false,
      },
      {
        k: '\u4E0D\u8C03\u6574\uFF0C\u5982\u5B9E\u51FA\u7F3A\u53E3',
        v: '\u7F3A\u53E3 210 \u5428\uFF0C\u4E0D\u4F2A\u9020\u8BA1\u5212\u91CF',
        rec: false,
      },
    ],
  },
  TV = [
    {
      value: 'pro',
      label: '\u4E13\u4E1A\u987E\u95EE',
      desc: '\u6C89\u7A33\u3001\u53EF\u4FE1\uFF0C\u9002\u5408\u5BF9\u5916\u6C47\u62A5\u4E0E\u51B3\u7B56\u573A\u666F',
    },
    {
      value: 'geo',
      label: '\u7B80\u7EA6\u51E0\u4F55',
      desc: '\u514B\u5236\u3001\u7406\u6027\uFF0C\u5F31\u5316\u62DF\u4EBA\u611F',
    },
    {
      value: 'soft',
      label: '\u4EB2\u548C\u5706\u6DA6',
      desc: '\u8F7B\u5FEB\u3001\u6613\u63A5\u8FD1\uFF0C\u9002\u5408\u65E5\u5E38\u95EE\u7B54\u4E0E\u63D0\u9192',
    },
  ],
  MV = [
    { value: 'suit', label: '\u6DF1\u8272\u897F\u88C5' },
    { value: 'shirt', label: '\u6D45\u8272\u886C\u886B' },
    { value: 'uniform', label: '\u54C1\u724C\u5236\u670D' },
  ],
  RV = [
    { value: 'calm', label: '\u6C89\u7740' },
    { value: 'warm', label: '\u4EB2\u548C' },
    { value: 'focus', label: '\u4E13\u6CE8' },
  ],
  $V = [
    { value: 'boardroom', label: '\u4EA7\u9500\u534F\u8C03\u4F1A' },
    { value: 'screen', label: '\u6570\u636E\u5927\u5C4F' },
    { value: 'plain', label: '\u7B80\u51C0\u80CC\u666F' },
  ],
  DV = [
    { value: '#C8352F', label: '\u54C1\u724C\u7EA2' },
    { value: '#2A6E9E', label: '\u6DF1\u6D77\u84DD' },
    { value: '#1B7A5A', label: '\u677E\u67CF\u7EFF' },
    { value: '#6A4BA8', label: '\u96FE\u7D2B' },
  ],
  T1 = [
    {
      value: 'zhixing',
      label: '\u77E5\u6027\u5973\u58F0',
      desc: '\u6E05\u6670\u3001\u6709\u6761\u7406\uFF0C\u9ED8\u8BA4\u63A8\u8350',
    },
    {
      value: 'chenwen',
      label: '\u6C89\u7A33\u7537\u58F0',
      desc: '\u4F4E\u7F13\u3001\u6709\u5206\u91CF',
    },
    {
      value: 'qingliang',
      label: '\u6E05\u4EAE\u5973\u58F0',
      desc: '\u660E\u5FEB\u3001\u8F7B\u91CF',
    },
    {
      value: 'wenhe',
      label: '\u6E29\u548C\u7537\u58F0',
      desc: '\u67D4\u548C\u3001\u4E0D\u538B\u8FEB',
    },
  ],
  M1 = [
    {
      value: 'precise',
      label: '\u4E25\u8C28\u7CBE\u786E',
      desc: '\u5148\u7ED9\u7ED3\u8BBA\u4E0E\u4F9D\u636E\uFF0C\u518D\u7ED9\u5EFA\u8BAE',
    },
    {
      value: 'warm',
      label: '\u4EB2\u548C\u534F\u4F5C',
      desc: '\u5148\u5BF9\u9F50\u76EE\u6807\uFF0C\u518D\u63A8\u8FDB\u65B9\u6848',
    },
    {
      value: 'brief',
      label: '\u7B80\u6D01\u76F4\u63A5',
      desc: '\u53EA\u8BB2\u8981\u70B9\u4E0E\u5F85\u529E',
    },
  ],
  AV = { style: 'pro', outfit: 'suit', mood: 'calm', scene: 'boardroom', color: '#C8352F' },
  zV = { tone: 'zhixing', rate: 1, pitch: 0 },
  LV = {
    name: '\u4E3B\u8BA1\u5212\u53C2\u8C0B',
    address: '\u674E\u7433',
    tone: 'precise',
    greeting:
      '\u674E\u7433\uFF0C10 \u6708\u7684\u9700\u6C42\u7248\u672C\u5DF2\u7ECF\u751F\u6548\u3002\u6211\u628A\u5404\u57FA\u5730\u7684\u6EDA\u52A8\u8BA1\u5212\u521D\u7A3F\u5148\u8DD1\u4E86\u4E00\u7248\uFF0C\u534E\u4E1C\u57FA\u5730 M+2 \u6709\u4E2A\u7F3A\u53E3\uFF0C\u8981\u4E0D\u8981\u4E00\u8D77\u8FC7\u4E00\u904D\uFF1F',
  },
  cu = [
    {
      id: 'plan',
      chip: '\u751F\u6210 10 \u6708\u6EDA\u52A8\u8BA1\u5212\u521D\u7A3F',
      question:
        '\u5E2E\u6211\u751F\u6210\u90D1\u5DDE\u57FA\u5730\u7684 M+1 \u5230 M+3 \u6EDA\u52A8\u8BA1\u5212\u521D\u7A3F\uFF0C\u7F3A\u53E3\u5355\u72EC\u6807\u51FA\u6765\u3002',
    },
    {
      id: 'capacity',
      chip: '\u770B\u5404\u57FA\u5730 M+2 \u4EA7\u80FD',
      question:
        '\u5404\u57FA\u5730 M+2 \u7684\u4EA7\u80FD\u8BC4\u4F30\u7ED3\u679C\u600E\u4E48\u6837\uFF1F\u6709\u7F3A\u53E3\u5417\uFF1F',
    },
    {
      id: 'demand',
      chip: '\u4E09\u8DEF\u9700\u6C42\u5BF9\u4E0D\u4E0A\u7684\u5730\u65B9',
      question:
        '\u8BA1\u5212\u63D0\u62A5\u3001\u6210\u957F\u9884\u6D4B\u548C\u5386\u53F2\u53D1\u8D27\uFF0C\u8FD9\u4E09\u8DEF\u9700\u6C42\u5BF9\u4E0D\u4E0A\u7684\u5730\u65B9\u5728\u54EA\uFF1F',
    },
    {
      id: 'gap',
      chip: 'M+2 \u7F3A\u53E3\u600E\u4E48\u5904\u7F6E',
      question:
        '\u534E\u4E1C\u57FA\u5730 M+2 \u9762\u70B9\u6709\u7F3A\u53E3\uFF0C\u8D85\u5E74\u5EA6\u89C4\u5212\u4E0A\u9650\u4E86\u5417\uFF1F\u8BE5\u600E\u4E48\u5904\u7F6E\uFF1F',
    },
    {
      id: 'rule',
      chip: '\u8FD9\u4E2A\u6708\u8C03\u62E8\u54C1\u62C6\u5206\u89C4\u5219',
      question:
        '\u8FD9\u4E2A\u6708\u7684\u8C03\u62E8\u54C1\u62C6\u5206\u89C4\u5219\u600E\u4E48\u6267\u884C\u7684\uFF1F',
    },
  ],
  dn = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  },
  R1 = () =>
    c.jsxs('svg', {
      ...dn,
      children: [
        c.jsx('path', { d: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z' }),
        c.jsx('circle', { cx: '12', cy: '12', r: '3' }),
      ],
    }),
  _VV = () =>
    c.jsxs('svg', {
      ...dn,
      width: 19,
      height: 19,
      children: [
        c.jsx('rect', { x: '9', y: '2.5', width: '6', height: '11', rx: '3' }),
        c.jsx('path', { d: 'M5.5 11.5a6.5 6.5 0 0 0 13 0' }),
        c.jsx('path', { d: 'M12 18v3.5M8.5 21.5h7' }),
      ],
    }),
  _HV = () =>
    c.jsxs('svg', {
      ...dn,
      width: 17,
      height: 17,
      children: [
        c.jsx('path', { d: 'M20.5 3.5 10.5 13.5' }),
        c.jsx('path', { d: 'M20.5 3.5 14 20.5l-3.5-7-7-3.5Z' }),
      ],
    }),
  _BV = () =>
    c.jsx('svg', {
      ...dn,
      width: 11,
      height: 11,
      strokeWidth: 2.6,
      children: c.jsx('path', { d: 'M4 12.5 9 17.5 20 6.5' }),
    }),
  WV = () =>
    c.jsxs('svg', {
      ...dn,
      width: 14,
      height: 14,
      children: [
        c.jsx('path', {
          d: 'M12 2.8 4.8 5.8v6c0 4.3 3 8.1 7.2 9.4 4.2-1.3 7.2-5.1 7.2-9.4v-6L12 2.8Z',
        }),
        c.jsx('path', { d: 'M9 11.8 11.2 14 15.4 9.8' }),
      ],
    }),
  jf = () =>
    c.jsx('svg', {
      ...dn,
      width: 13,
      height: 13,
      children: c.jsx('path', {
        d: 'M12 2.6 13.9 9l6.4 1.9-6.4 1.9L12 19.2l-1.9-6.4L3.7 10.9 10.1 9 12 2.6Z',
      }),
    }),
  MO = () =>
    c.jsxs('svg', {
      ...dn,
      width: 13,
      height: 13,
      children: [
        c.jsx('circle', { cx: '12', cy: '12', r: '8.6' }),
        c.jsx('path', { d: 'M12 7.4V12l3.2 2' }),
      ],
    }),
  If = () =>
    c.jsxs('svg', {
      ...dn,
      width: 14,
      height: 14,
      children: [
        c.jsx('circle', { cx: '12', cy: '12', r: '8.8' }),
        c.jsx('path', { d: 'M12 11v5.4M12 7.8h.01', strokeWidth: '1.8' }),
      ],
    }),
  og = () =>
    c.jsxs('svg', {
      ...dn,
      width: 14,
      height: 14,
      children: [
        c.jsx('path', { d: 'M12 3.4 2.6 20h18.8L12 3.4Z' }),
        c.jsx('path', { d: 'M12 9.6v4.6M12 17.2h.01', strokeWidth: '1.8' }),
      ],
    }),
  RO = () =>
    c.jsx('svg', {
      ...dn,
      width: 16,
      height: 16,
      children: c.jsx('path', { d: 'M12 5.5v13M5.5 12h13' }),
    }),
  _UV = () =>
    c.jsxs('svg', {
      ...dn,
      width: 16,
      height: 16,
      children: [
        c.jsx('circle', { cx: '12', cy: '12', r: '3.2' }),
        c.jsx('path', {
          d: 'M12 2.9v2.3M12 18.8v2.3M21.1 12h-2.3M5.2 12H2.9M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6M18.4 18.4l-1.6-1.6M7.2 7.2 5.6 5.6',
        }),
      ],
    }),
  _KV = () =>
    c.jsxs('svg', {
      ...dn,
      width: 15,
      height: 15,
      children: [
        c.jsx('circle', { cx: '12', cy: '12', r: '3.6' }),
        c.jsx('path', { d: 'M15.6 8.4v4.9a3 3 0 0 0 6 0V12a9.6 9.6 0 1 0-3.9 7.7' }),
      ],
    }),
  _GV = () =>
    c.jsx('svg', {
      ...dn,
      width: 15,
      height: 15,
      children: c.jsx('path', {
        d: 'M20.4 11.6 12 20a5 5 0 0 1-7.1-7.1L13.2 4.7a3.4 3.4 0 0 1 4.8 4.8l-8.3 8.3a1.8 1.8 0 0 1-2.5-2.5l7.6-7.6',
      }),
    }),
  $O = () =>
    c.jsxs('svg', {
      ...dn,
      width: 15,
      height: 15,
      children: [
        c.jsx('path', { d: 'M20.4 12a8.4 8.4 0 1 1-2.6-6' }),
        c.jsx('path', { d: 'M20.6 4.2v5.4h-5.4' }),
      ],
    }),
  DO = () =>
    c.jsxs('svg', {
      ...dn,
      width: 15,
      height: 15,
      children: [
        c.jsx('path', { d: 'M12 15.5V3.8M8 7.4 12 3.4l4 4' }),
        c.jsx('path', { d: 'M4.4 14.5v3.7a2.4 2.4 0 0 0 2.4 2.4h10.4a2.4 2.4 0 0 0 2.4-2.4v-3.7' }),
      ],
    }),
  Gd = '#F3C9A7',
  fu = '#E5B08D',
  Yd = '#2E2B34';
function YV({ style: e }) {
  return e === 'geo'
    ? c.jsx('rect', { x: 68, y: 48, width: 84, height: 94, rx: 30, fill: Gd })
    : e === 'soft'
      ? c.jsx('ellipse', { cx: 110, cy: 96, rx: 46, ry: 48, fill: Gd })
      : c.jsx('ellipse', { cx: 110, cy: 94, rx: 43, ry: 47, fill: Gd });
}
function ZV({ style: e }) {
  return e === 'geo'
    ? c.jsx('path', {
        d: 'M68 78 C68 46 86 38 110 38 C134 38 152 46 152 78 L152 66 C152 50 134 46 110 46 C86 46 68 50 68 66 Z',
        fill: Yd,
      })
    : e === 'soft'
      ? c.jsxs('g', {
          fill: Yd,
          children: [
            c.jsx('circle', { cx: 82, cy: 66, r: 22 }),
            c.jsx('circle', { cx: 110, cy: 54, r: 26 }),
            c.jsx('circle', { cx: 138, cy: 66, r: 22 }),
            c.jsx('circle', { cx: 70, cy: 86, r: 14 }),
            c.jsx('circle', { cx: 150, cy: 86, r: 14 }),
            c.jsx('ellipse', { cx: 110, cy: 72, rx: 46, ry: 30 }),
          ],
        })
      : c.jsx('path', {
          d: 'M67 88 C67 52 84 38 110 38 C136 38 153 52 153 88 C153 72 140 60 110 60 C80 60 67 72 67 88 Z',
          fill: Yd,
        });
}
function XV({ mood: e }) {
  const t = '#3A3540',
    n =
      e === 'warm'
        ? 'M80 82 Q90 77 100 81'
        : e === 'focus'
          ? 'M80 80 Q90 79 100 82'
          : 'M80 82 Q90 78 100 82',
    r =
      e === 'warm'
        ? 'M120 81 Q130 77 140 82'
        : e === 'focus'
          ? 'M120 82 Q130 79 140 80'
          : 'M120 82 Q130 78 140 82';
  return c.jsxs('g', {
    stroke: t,
    strokeWidth: 2.6,
    fill: 'none',
    strokeLinecap: 'round',
    children: [c.jsx('path', { d: n }), c.jsx('path', { d: r })],
  });
}
function QV({ style: e, mood: t }) {
  if (e === 'geo')
    return c.jsxs('g', {
      fill: '#2A2830',
      children: [
        c.jsx('rect', { x: 84, y: 92, width: 15, height: 3.6, rx: 1.8 }),
        c.jsx('rect', { x: 121, y: 92, width: 15, height: 3.6, rx: 1.8 }),
      ],
    });
  const n = e === 'soft' ? 7.5 : 6.5,
    r = e === 'soft' ? 6 : 5.2;
  return c.jsxs('g', {
    children: [
      c.jsx('ellipse', { cx: 91, cy: 97, rx: r, ry: n, fill: '#25232C' }),
      c.jsx('ellipse', { cx: 129, cy: 97, rx: r, ry: n, fill: '#25232C' }),
      c.jsx('circle', { cx: 93, cy: 94.5, r: 1.9, fill: '#FFFFFF', opacity: 0.85 }),
      c.jsx('circle', { cx: 131, cy: 94.5, r: 1.9, fill: '#FFFFFF', opacity: 0.85 }),
      t === 'warm' &&
        c.jsxs('g', {
          stroke: '#3A3540',
          strokeWidth: 1.8,
          fill: 'none',
          strokeLinecap: 'round',
          opacity: 0.55,
          children: [
            c.jsx('path', { d: 'M84 89 Q91 85 98 89' }),
            c.jsx('path', { d: 'M122 89 Q129 85 136 89' }),
          ],
        }),
    ],
  });
}
function qV({ mood: e }) {
  const t =
    e === 'warm'
      ? 'M100 124 Q110 134 120 124'
      : e === 'focus'
        ? 'M103 127 Q110 129 117 127'
        : 'M101 125 Q110 131 119 125';
  return c.jsx('path', {
    d: t,
    stroke: '#C36A5C',
    strokeWidth: 2.6,
    fill: 'none',
    strokeLinecap: 'round',
  });
}
function JV() {
  return c.jsxs('g', {
    stroke: '#3C4150',
    strokeWidth: 2,
    fill: 'none',
    opacity: 0.92,
    children: [
      c.jsx('rect', {
        x: 77,
        y: 85,
        width: 26,
        height: 22,
        rx: 8,
        fill: '#FFFFFF',
        fillOpacity: 0.12,
      }),
      c.jsx('rect', {
        x: 117,
        y: 85,
        width: 26,
        height: 22,
        rx: 8,
        fill: '#FFFFFF',
        fillOpacity: 0.12,
      }),
      c.jsx('path', { d: 'M103 95 L117 95' }),
      c.jsx('path', { d: 'M77 92 L67 96' }),
      c.jsx('path', { d: 'M143 92 L153 96' }),
    ],
  });
}
function eH({ outfit: e, color: t }) {
  return e === 'shirt'
    ? c.jsxs('g', {
        children: [
          c.jsx('path', {
            d: 'M34 240 C34 194 66 170 110 170 C154 170 186 194 186 240 Z',
            fill: '#E7EAF1',
          }),
          c.jsx('path', {
            d: 'M34 240 C34 194 66 170 110 170 C154 170 186 194 186 240 Z',
            fill: 'none',
            stroke: '#D3D8E3',
            strokeWidth: 1.5,
          }),
          c.jsx('path', {
            d: 'M96 172 Q110 194 124 172 Q117 170 110 170 Q103 170 96 172 Z',
            fill: '#F5F7FB',
          }),
          c.jsx('path', { d: 'M110 186 L110 240', stroke: '#D8DDE7', strokeWidth: 1.4 }),
          c.jsx('circle', { cx: 110, cy: 203, r: 2.2, fill: '#C3CAD7' }),
        ],
      })
    : e === 'uniform'
      ? c.jsxs('g', {
          children: [
            c.jsx('path', {
              d: 'M34 240 C34 194 66 170 110 170 C154 170 186 194 186 240 Z',
              fill: '#EDEFF3',
            }),
            c.jsx('path', {
              d: 'M34 240 C34 194 66 170 110 170 C154 170 186 194 186 240 Z',
              fill: 'none',
              stroke: '#DCE0E8',
              strokeWidth: 1.5,
            }),
            c.jsx('path', {
              d: 'M88 172 L110 196 L132 172 L124 170 L110 182 L96 170 Z',
              fill: t,
              opacity: 0.92,
            }),
            c.jsx('path', { d: 'M110 196 L110 240', stroke: '#D5DAE3', strokeWidth: 1.4 }),
            c.jsx('circle', {
              cx: 139,
              cy: 206,
              r: 6,
              fill: 'none',
              stroke: t,
              strokeWidth: 1.6,
              opacity: 0.7,
            }),
            c.jsx('circle', { cx: 139, cy: 206, r: 2, fill: t, opacity: 0.7 }),
          ],
        })
      : c.jsxs('g', {
          children: [
            c.jsx('path', {
              d: 'M34 240 C34 194 66 170 110 170 C154 170 186 194 186 240 Z',
              fill: '#2C3345',
            }),
            c.jsx('path', {
              d: 'M92 170 L110 198 L128 170 L120 168 L110 182 L100 168 Z',
              fill: '#F4F6FA',
            }),
            c.jsx('path', { d: 'M110 192 L103 202 L110 234 L117 202 Z', fill: t }),
            c.jsx('path', { d: 'M92 170 L110 198 L104 200 L88 176 Z', fill: '#232A3A' }),
            c.jsx('path', { d: 'M128 170 L110 198 L116 200 L132 176 Z', fill: '#232A3A' }),
          ],
        });
}
function tH({ scene: e, color: t }) {
  if (e === 'screen') {
    const n = [];
    for (let r = 0; r < 6; r += 1)
      for (let a = 0; a < 10; a += 1)
        n.push(
          c.jsx(
            'circle',
            { cx: 18 + a * 21, cy: 22 + r * 21, r: 1.4, fill: t, opacity: 0.1 },
            `${r}-${a}`,
          ),
        );
    return c.jsxs('g', {
      children: [n, c.jsx('rect', { x: 0, y: 150, width: 220, height: 3, fill: t, opacity: 0.13 })],
    });
  }
  return e === 'boardroom'
    ? c.jsxs('g', {
        children: [
          c.jsx('circle', { cx: 110, cy: 74, r: 96, fill: t, opacity: 0.05 }),
          c.jsx('ellipse', { cx: 110, cy: 252, rx: 132, ry: 46, fill: t, opacity: 0.07 }),
          c.jsx('path', {
            d: 'M0 176 C48 168 64 150 110 150 C156 150 172 168 220 176 L220 182 C172 174 156 156 110 156 C64 156 48 174 0 182 Z',
            fill: t,
            opacity: 0.06,
          }),
        ],
      })
    : c.jsx('circle', { cx: 110, cy: 92, r: 82, fill: t, opacity: 0.06 });
}
function Iu({ cfg: e, size: t = 200, breathe: n = true, className: r }) {
  const { style: a, outfit: i, mood: o, scene: l, color: s } = e,
    u = `${a}-${i}-${o}-${l}-${s.replace('#', '')}`;
  return c.jsxs('svg', {
    className: r,
    width: t,
    height: t * (240 / 220),
    viewBox: '0 0 220 240',
    role: 'img',
    'aria-label': '\u6570\u5B57\u4EBA\u5F62\u8C61\u9884\u89C8',
    children: [
      c.jsxs('defs', {
        children: [
          c.jsxs('linearGradient', {
            id: `bg-${u}`,
            x1: '0',
            y1: '0',
            x2: '0',
            y2: '1',
            children: [
              c.jsx('stop', { offset: '0%', stopColor: '#FFFFFF' }),
              c.jsx('stop', { offset: '100%', stopColor: '#F2F4F8' }),
            ],
          }),
          c.jsx('clipPath', {
            id: `clip-${u}`,
            children: c.jsx('rect', { x: 0, y: 0, width: 220, height: 240, rx: 18 }),
          }),
        ],
      }),
      c.jsxs('g', {
        clipPath: `url(#clip-${u})`,
        children: [
          c.jsx('rect', { x: 0, y: 0, width: 220, height: 240, fill: `url(#bg-${u})` }),
          c.jsx(tH, { scene: l, color: s }),
          c.jsxs('g', {
            className: n ? 'avatar-breathe' : void 0,
            children: [
              c.jsx(eH, { outfit: i, color: s }),
              c.jsx('rect', { x: 94, y: 128, width: 32, height: 46, rx: 15, fill: fu }),
              c.jsx('ellipse', { cx: 110, cy: 140, rx: 16, ry: 9, fill: fu }),
              a !== 'geo' &&
                c.jsxs('g', {
                  fill: fu,
                  children: [
                    c.jsx('ellipse', { cx: a === 'soft' ? 63 : 67, cy: 98, rx: 7, ry: 10.5 }),
                    c.jsx('ellipse', { cx: a === 'soft' ? 157 : 153, cy: 98, rx: 7, ry: 10.5 }),
                  ],
                }),
              c.jsx(YV, { style: a }),
              c.jsx(ZV, { style: a }),
              (o === 'warm' || a === 'soft') &&
                c.jsxs('g', {
                  fill: '#EF9A8B',
                  opacity: 0.36,
                  children: [
                    c.jsx('ellipse', { cx: 78, cy: 112, rx: 9.5, ry: 5.5 }),
                    c.jsx('ellipse', { cx: 142, cy: 112, rx: 9.5, ry: 5.5 }),
                  ],
                }),
              c.jsx(XV, { mood: o }),
              c.jsx(QV, { style: a, mood: o }),
              c.jsx('path', {
                d: 'M110 103 L110 113 L104 115',
                stroke: fu,
                strokeWidth: 2,
                fill: 'none',
                strokeLinecap: 'round',
              }),
              c.jsx(qV, { mood: o }),
              a === 'pro' && c.jsx(JV, {}),
            ],
          }),
        ],
      }),
    ],
  });
}

function Fn({ label: e, badge: t, children: n }) {
  return c.jsxs('div', {
    className: 'ap-ctrl',
    children: [
      c.jsxs('div', {
        className: 'ap-ctrl-label',
        children: [
          e,
          t &&
            c.jsx('span', {
              style: { fontWeight: 400, color: 'var(--ap-ink-3)', fontSize: 11.5 },
              children: t,
            }),
        ],
      }),
      n,
    ],
  });
}
function al({ value: e, options: t, onChange: n }) {
  return c.jsx(On.Group, {
    className: 'ap-opt-group',
    value: e,
    onChange: (r) => n(String(r)),
    children: t.map((r) =>
      c.jsx(
        On,
        {
          value: r.value,
          children: c.jsxs('span', {
            className: 'ap-opt-inner',
            children: [
              c.jsx('span', { className: 'ap-opt-label', children: r.label }),
              r.desc ? c.jsx('span', { className: 'ap-opt-desc', children: r.desc }) : null,
            ],
          }),
        },
        r.value,
      ),
    ),
  });
}
function iH({ cfg: e, voice: t, persona: n, onCfg: r, onVoice: a, onPersona: i }) {
  var p, h, m;
  const [o, l] = y.useState(0),
    [s, u] = y.useState(0);
  y.useEffect(() => {
    l(0);
    let g = 0;
    const w = window.setInterval(() => {
      void ((g += 1), l(g), g >= n.greeting.length && window.clearInterval(w));
    }, 26);
    return () => window.clearInterval(w);
  }, [n.greeting, s]);
  const d =
      (h = (p = T1.find((g) => g.value === t.tone)) == null ? void 0 : p.label) != null
        ? h
        : '\u77E5\u6027\u5973\u58F0',
    v = o < n.greeting.length;
  return c.jsxs('div', {
    className: 'ap-studio-layout',
    children: [
      c.jsxs('div', {
        className: 'ap-stage',
        children: [
          c.jsx('div', { className: 'ap-stage-ava', children: c.jsx(Iu, { cfg: e, size: 244 }) }),
          c.jsxs('div', {
            className: 'ap-bubble',
            children: [
              c.jsxs('div', {
                style: {
                  fontSize: 11,
                  color: 'var(--ap-ink-3)',
                  marginBottom: 7,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                },
                children: [
                  c.jsxs('span', {
                    style: { display: 'flex', alignItems: 'center', gap: 6 },
                    children: [
                      c.jsx('span', {
                        style: {
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: 'var(--green-6)',
                        },
                      }),
                      n.name,
                      ' \xB7 ',
                      d,
                    ],
                  }),
                  c.jsxs('span', { children: [t.rate.toFixed(2), '\xD7'] }),
                ],
              }),
              c.jsx('span', {
                className: v ? 'ap-caret' : void 0,
                children: n.greeting.slice(0, o),
              }),
            ],
          }),
          c.jsx(Ke, {
            long: true,
            onClick: () => u((g) => g + 1),
            children: '\u91CD\u64AD\u5F00\u573A\u767D',
          }),
          c.jsxs('div', {
            style: { fontSize: 11.5, color: 'var(--ap-ink-3)', lineHeight: 1.65 },
            children: [
              c.jsx(If, {}),
              ' \u5F62\u8C61\u4E3A\u77E2\u91CF\u7ED8\u5236\uFF0C\u6B63\u5F0F\u5F00\u53D1\u65F6\u66FF\u6362\u4E3A\u6B63\u5F0F\u5F62\u8C61\u8D44\u6E90\uFF1B\u6B64\u5904\u53EA\u7528\u4E8E\u786E\u8BA4\u98CE\u683C\u65B9\u5411\u3002',
            ],
          }),
        ],
      }),
      c.jsxs('div', {
        children: [
          c.jsx(Fn, {
            label: '\u5F62\u8C61\u98CE\u683C',
            children: c.jsx(al, {
              value: e.style,
              options: TV,
              onChange: (g) => r({ ...e, style: g }),
            }),
          }),
          c.jsx(Fn, {
            label: '\u670D\u9970',
            children: c.jsx(al, {
              value: e.outfit,
              options: MV,
              onChange: (g) => r({ ...e, outfit: g }),
            }),
          }),
          c.jsx(Fn, {
            label: '\u795E\u6001',
            children: c.jsx(al, {
              value: e.mood,
              options: RV,
              onChange: (g) => r({ ...e, mood: g }),
            }),
          }),
          c.jsx(Fn, {
            label: '\u51FA\u573A\u573A\u666F',
            children: c.jsx(al, {
              value: e.scene,
              options: $V,
              onChange: (g) => r({ ...e, scene: g }),
            }),
          }),
          c.jsx(Fn, {
            label: '\u4E3B\u8272',
            badge: '\u7528\u4E8E\u670D\u9970\u70B9\u7F00\u4E0E\u573A\u666F\u6C1B\u56F4',
            children: c.jsx('div', {
              className: 'ap-swatch',
              children: DV.map((g) =>
                c.jsx(
                  Ke,
                  {
                    shape: 'square',
                    type: e.color === g.value ? 'primary' : 'secondary',
                    title: g.label,
                    onClick: () => r({ ...e, color: g.value }),
                    icon: c.jsx('span', {
                      className: 'ap-swatch-dot',
                      style: { background: g.value },
                    }),
                  },
                  g.value,
                ),
              ),
            }),
          }),
          c.jsx('div', { className: 'ap-divider' }),
          c.jsx(Fn, {
            label: '\u97F3\u8272',
            badge:
              '\u4E00\u671F\u4F7F\u7528\u901A\u7528\u97F3\u8272\uFF0C\u4E8C\u671F\u63A5\u5165\u54C1\u724C\u4E13\u5C5E\u97F3\u8272',
            children: c.jsx(al, {
              value: t.tone,
              options: T1,
              onChange: (g) => a({ ...t, tone: g }),
            }),
          }),
          c.jsxs('div', {
            style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 },
            children: [
              c.jsx(Fn, {
                label: '\u8BED\u901F',
                badge: `${t.rate.toFixed(2)}\xD7`,
                children: c.jsx(Hp, {
                  min: 0.8,
                  max: 1.25,
                  step: 0.05,
                  value: t.rate,
                  onChange: (g) => a({ ...t, rate: Number(g) }),
                  formatTooltip: (g) => `${Number(g).toFixed(2)}\xD7`,
                }),
              }),
              c.jsx(Fn, {
                label: '\u8BED\u8C03',
                badge: t.pitch > 0 ? '\u7565\u9AD8' : t.pitch < 0 ? '\u7565\u4F4E' : '\u6807\u51C6',
                children: c.jsx(Hp, {
                  min: -2,
                  max: 2,
                  step: 1,
                  value: t.pitch,
                  onChange: (g) => a({ ...t, pitch: Number(g) }),
                  formatTooltip: (g) => String(g),
                }),
              }),
            ],
          }),
          c.jsx('div', { className: 'ap-divider' }),
          c.jsxs('div', {
            style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 },
            children: [
              c.jsx(Fn, {
                label: '\u52A9\u624B\u540D\u79F0',
                children: c.jsx(Zt, {
                  value: n.name,
                  onChange: (g) => i({ ...n, name: g }),
                  placeholder: '\u4F8B\u5982\uFF1A\u4E3B\u8BA1\u5212\u53C2\u8C0B',
                }),
              }),
              c.jsx(Fn, {
                label: '\u79F0\u547C\u4F60\u4E3A',
                children: c.jsx(Zt, {
                  value: n.address,
                  onChange: (g) => i({ ...n, address: g }),
                  placeholder: '\u4F8B\u5982\uFF1A\u674E\u7433',
                }),
              }),
            ],
          }),
          c.jsxs(Fn, {
            label: '\u8BDD\u672F\u53E3\u543B',
            children: [
              c.jsx(On.Group, {
                type: 'button',
                value: n.tone,
                onChange: (g) => i({ ...n, tone: String(g) }),
                children: M1.map((g) => c.jsx(On, { value: g.value, children: g.label }, g.value)),
              }),
              c.jsx('div', {
                style: { fontSize: 11.5, color: 'var(--ap-ink-3)', marginTop: 8 },
                children: (m = M1.find((g) => g.value === n.tone)) == null ? void 0 : m.desc,
              }),
            ],
          }),
          c.jsx(Fn, {
            label: '\u5F00\u573A\u767D',
            children: c.jsx(Zt.TextArea, {
              value: n.greeting,
              onChange: (g) => i({ ...n, greeting: g }),
              autoSize: { minRows: 3, maxRows: 5 },
            }),
          }),
          c.jsx(Ke, {
            type: 'primary',
            onClick: () => kt.success('\u8BBE\u7F6E\u5DF2\u4FDD\u5B58\uFF08\u6A21\u62DF\uFF09'),
            children: '\u4FDD\u5B58\u8BBE\u7F6E',
          }),
        ],
      }),
    ],
  });
}
function oH({
  s: e,
  pullType: t,
  onPullType: n,
  months: r,
  onMonths: a,
  shipPeriod: i,
  onShipPeriod: o,
  onPreview: l,
}) {
  var s, u;
  return c.jsxs('section', {
    className: 'ap-board-card ap-source-card',
    children: [
      c.jsxs('div', {
        className: 'ap-card-head',
        children: [
          c.jsxs('h3', {
            children: [
              e.title,
              c.jsx(ut, {
                color: e.state === 'ok' ? 'green' : 'orange',
                size: 'small',
                bordered: true,
                children: e.state === 'ok' ? '\u5DF2\u9F50\u5907' : '\u6709\u7F3A\u9879',
              }),
            ],
          }),
          c.jsx('span', { style: { fontSize: 11.5, color: 'var(--ap-ink-3)' }, children: e.from }),
        ],
      }),
      c.jsxs('div', {
        className: 'ap-card-body ap-source-body',
        children: [
          c.jsxs('div', {
            className: 'ap-source-meta',
            children: [
              c.jsxs('span', { className: 'ap-brand-chip', children: [c.jsx(MO, {}), e.time] }),
              c.jsx('span', { className: 'ap-brand-chip', children: e.version }),
            ],
          }),
          c.jsx('div', {
            className: 'ap-source-stats',
            children: e.stats.map((d) =>
              c.jsxs(
                'div',
                {
                  children: [
                    c.jsx('div', { className: 'ap-stat-k', children: d.k }),
                    c.jsx('div', { className: 'ap-stat-v', children: d.v }),
                  ],
                },
                d.k,
              ),
            ),
          }),
          e.pull &&
            c.jsxs('div', {
              className: 'ap-pull',
              children: [
                c.jsx('div', { className: 'ap-pull-title', children: '\u62C9\u53D6\u8BBE\u7F6E' }),
                c.jsxs('div', {
                  className: 'ap-pull-row',
                  children: [
                    c.jsx('span', {
                      className: 'ap-pull-label',
                      children: '\u8BA1\u5212\u7C7B\u578B',
                    }),
                    c.jsx(On.Group, {
                      type: 'button',
                      size: 'small',
                      value: t,
                      onChange: (d) => n(String(d)),
                      children: k1.map((d) =>
                        c.jsx(On, { value: d.value, children: d.label }, d.value),
                      ),
                    }),
                  ],
                }),
                c.jsxs('div', {
                  className: 'ap-pull-row',
                  children: [
                    c.jsx('span', {
                      className: 'ap-pull-label',
                      children: '\u53C2\u4E0E\u671F\u95F4',
                    }),
                    c.jsx(Mr.Group, {
                      value: r,
                      onChange: (d) => a(d),
                      options: IO.map((d) => ({ label: d.label, value: d.value })),
                    }),
                  ],
                }),
                c.jsxs('div', {
                  className: 'ap-pull-hint',
                  children: [
                    (s = k1.find((d) => d.value === t)) == null ? void 0 : s.desc,
                    ' \xB7 \u9ED8\u8BA4\u53D6\u8BC4\u4F30\u6708\u4EFD\u8D77\u8FDE\u7EED 3 \u4E2A\u6708',
                    r.length === 0 &&
                      ' \xB7 \u8BF7\u81F3\u5C11\u9009\u62E9\u4E00\u4E2A\u671F\u95F4',
                  ],
                }),
              ],
            }),
          e.periods &&
            c.jsxs('div', {
              className: 'ap-periods',
              children: [
                c.jsx('div', {
                  className: 'ap-periods-title',
                  children:
                    '\u540C\u671F\u53D1\u8D27\u660E\u7EC6\uFF08\u6309\u8BC4\u4F30\u6708\u4EFD\u63A8\u5BFC\uFF09',
                }),
                c.jsx('div', {
                  className: 'ap-period-grid',
                  children: ig.map((d) =>
                    c.jsxs(
                      Ke,
                      {
                        className: 'ap-period-tile',
                        'data-active': i === d.value,
                        onClick: () => {
                          void (o(d.value), l('ship'));
                        },
                        children: [
                          c.jsx('span', { className: 'ap-period-tag', children: d.tag }),
                          c.jsx('span', { className: 'ap-period-val', children: d.label }),
                          c.jsxs('span', {
                            className: 'ap-period-eye',
                            children: [c.jsx(R1, {}), '\u9884\u89C8'],
                          }),
                        ],
                      },
                      d.value,
                    ),
                  ),
                }),
              ],
            }),
          e.note && c.jsx('div', { className: 'ap-source-note', children: e.note }),
          c.jsxs('div', {
            className: 'ap-source-actions',
            children: [
              e.canSync &&
                c.jsx(Ke, {
                  size: 'small',
                  icon: e.syncText ? c.jsx(DO, {}) : c.jsx($O, {}),
                  onClick: () => {
                    var d;
                    return kt.success(
                      `\u5DF2\u53D1\u8D77${e.title}${(d = e.syncText) != null ? d : '\u540C\u6B65'}\uFF08\u6A21\u62DF\uFF09`,
                    );
                  },
                  children: (u = e.syncText) != null ? u : '\u540C\u6B65\u6570\u636E',
                }),
              c.jsx(Ke, {
                size: 'small',
                type: 'text',
                icon: c.jsx(R1, {}),
                onClick: () => l(e.id),
                children: '\u9884\u89C8\u6570\u636E',
              }),
            ],
          }),
        ],
      }),
    ],
  });
}
function lH({ onNext: e }) {
  var v;
  const [t, n] = usePageViewField(
      y,
      mpsView,
      'preview',
      null,
      (value) => value,
      (value) => (value === null || mV.some((row) => row.id === value) ? value : null),
    ),
    [r, a] = usePageViewField(y, mpsView, 'pullType', 'monthly'),
    [i, o] = usePageViewField(
      y,
      mpsView,
      'months',
      IO.map((p) => p.value),
      (value) => value,
      (value) => value.filter((month) => IO.some((row) => row.value === month)),
    ),
    [l, s] = usePageViewField(y, mpsView, 'shipPeriod', ig[0].value),
    u =
      t === 'report'
        ? `report-${r === 'adjust' ? 'adjust' : 'monthly'}`
        : t === 'ship'
          ? `ship-${l}`
          : t,
    d = u ? TO[u] : null;
  useMpsPart(
    y,
    'check',
    { sources: mV, pullType: r, months: i, shipPeriod: l, preview: d },
    pV['check'] ?? vV['check'],
  );
  return c.jsxs(c.Fragment, {
    children: [
      c.jsxs('div', {
        className: 'ap-notice',
        'data-kind': 'info',
        style: { marginBottom: 16 },
        children: [
          c.jsx(If, {}),
          c.jsxs('span', {
            children: [
              '\u8FD9\u662F\u8BA1\u5212\u94FE\u7684\u7B2C\u4E00\u6B65\uFF1A\u5148\u786E\u8BA4\u4E09\u8DEF\u6570\u636E\uFF08',
              c.jsx('b', { children: '\u8BA1\u5212\u63D0\u62A5\u6570\u636E' }),
              ' + ',
              c.jsx('b', { children: '\u6210\u957F\u9884\u6D4B\u6570\u636E' }),
              ' + ',
              c.jsx('b', { children: '\u5386\u53F2\u53D1\u8D27\u6570\u636E' }),
              '\uFF09 \u9F50\u5168\u3001\u5B57\u6BB5\u5B8C\u6574\uFF0C\u786E\u8BA4\u65E0\u8BEF\u540E\u518D\u8FDB\u5165\u9700\u6C42\u52A0\u5DE5\u4E0E\u4E3B\u6570\u636E\u5BF9\u5E94\u5173\u7CFB\u3002\u7F3A\u9879\u4E00\u5F8B\u5982\u5B9E\u6807\u6CE8\uFF0C\u4E0D\u7528\u4F30\u7B97\u503C\u8865\u9F50\u3002',
            ],
          }),
        ],
      }),
      c.jsxs('div', {
        className: 'ap-section-title',
        style: { marginTop: 0 },
        children: [
          c.jsx('h2', { children: '\u4E09\u8DEF\u6570\u636E' }),
          c.jsx('span', {
            children:
              '\u4E09\u8DEF\u90FD\u53C2\u4E0E\u52A0\u6743\u52A0\u5DE5\u51FA\u521D\u7248\u9700\u6C42\uFF0C\u5386\u53F2\u53D1\u8D27\u5355\u72EC\u770B\u4E5F\u662F\u540C\u671F\u6821\u9A8C\u7684\u53C2\u7167',
          }),
        ],
      }),
      c.jsx('div', {
        className: 'ap-grid-3 ap-source-grid',
        children: mV.map((p) =>
          c.jsx(
            oH,
            {
              s: p,
              pullType: r,
              onPullType: a,
              months: i,
              onMonths: o,
              shipPeriod: l,
              onShipPeriod: s,
              onPreview: n,
            },
            p.id,
          ),
        ),
      }),
      c.jsx('div', {
        style: { display: 'flex', justifyContent: 'flex-end', marginTop: 16 },
        children: c.jsx(Ke, {
          type: 'primary',
          onClick: e,
          children: '\u4E0B\u4E00\u6B65\uFF1A\u9700\u6C42\u52A0\u5DE5\u4E0E\u6536\u655B',
        }),
      }),
      c.jsx(Zm, {
        width: 880,
        title: (v = d == null ? void 0 : d.title) != null ? v : '',
        visible: !!d,
        onCancel: () => n(null),
        footer: null,
        children:
          d &&
          c.jsxs(c.Fragment, {
            children: [
              c.jsx('div', {
                style: { fontSize: 12.5, color: 'var(--ap-ink-3)', marginBottom: 14 },
                children: d.sub,
              }),
              c.jsx('div', {
                style: { border: '1px solid var(--ap-line)', borderRadius: 10, overflow: 'hidden' },
                children: c.jsxs('table', {
                  className: 'ap-table',
                  children: [
                    c.jsx('thead', {
                      children: c.jsx('tr', {
                        children: d.cols.map((p) => c.jsx('th', { children: p }, p)),
                      }),
                    }),
                    c.jsx('tbody', {
                      children: d.rows.map((p, h) =>
                        c.jsx(
                          'tr',
                          {
                            children: p.map((m, g) =>
                              c.jsx(
                                'td',
                                { className: g === 0 ? 'ap-left' : 'ap-num', children: m },
                                g,
                              ),
                            ),
                          },
                          h,
                        ),
                      ),
                    }),
                  ],
                }),
              }),
              c.jsx('div', {
                style: { fontSize: 11.8, color: 'var(--ap-ink-3)', marginTop: 12, lineHeight: 1.7 },
                children:
                  '\u4EE5\u4E0A\u4E3A\u524D 10 \u6761\u793A\u4F8B\u8BB0\u5F55\u3002\u5B8C\u6574\u660E\u7EC6\u53EF\u5BFC\u51FA\u540E\u67E5\u770B\u3002',
              }),
            ],
          }),
      }),
    ],
  });
}
function sH(e, t) {
  const n = [
      { v: e.report, weight: t.report },
      { v: e.growth, weight: t.growth },
      { v: e.ship, weight: t.ship },
    ].filter((a) => a.v !== null),
    r = n.reduce((a, i) => a + i.weight, 0);
  return r ? Math.round(n.reduce((a, i) => a + i.v * i.weight, 0) / r) : 0;
}
const vu = (e, t) => Math.round((e * 1e3) / t);
function uH() {
  const [t, n] = usePageViewField(y, mpsView, 'weights', { report: 40, growth: 40, ship: 20 }),
    [r, a] = usePageViewField(y, mpsView, 'demandEdits', {}),
    i = N1.reduce((s, u) => {
      var d;
      return s + ((d = t[u.id]) != null ? d : 0);
    }, 0),
    o = i === 100,
    l = Object.keys(r).length > 0;
  useMpsPart(
    y,
    'process',
    {
      weights: t,
      weightTotal: i,
      valid: o,
      adjustments: r,
      rows: gV.map((row) => ({
        ...row,
        initialDemand: vu(sH(row, t), row.net),
        finalDemand: r[row.sku] ?? vu(sH(row, t), row.net),
      })),
    },
    pV['process'] ?? vV['process'],
  );
  return c.jsxs(c.Fragment, {
    children: [
      c.jsxs('section', {
        className: 'ap-board-card',
        children: [
          c.jsxs('div', {
            className: 'ap-card-head',
            children: [
              c.jsxs('h3', {
                children: [
                  '\u9700\u6C42\u6743\u91CD',
                  c.jsxs(ut, {
                    color: o ? 'green' : 'red',
                    size: 'small',
                    bordered: true,
                    children: ['\u5408\u8BA1 ', i, '%'],
                  }),
                ],
              }),
              c.jsx('span', {
                style: { fontSize: 11.5, color: 'var(--ap-ink-3)' },
                children:
                  '\u6743\u91CD\u7531\u4EBA\u5DE5\u8BBE\u5B9A\uFF0C\u7CFB\u7EDF\u4E0D\u505A\u6743\u91CD\u7684\u667A\u80FD\u8BA1\u7B97',
              }),
            ],
          }),
          c.jsxs('div', {
            className: 'ap-card-body',
            children: [
              c.jsx('div', {
                className: 'ap-grid-3',
                children: N1.map((s) =>
                  c.jsxs(
                    'div',
                    {
                      children: [
                        c.jsxs('div', {
                          className: 'ap-ctrl-label',
                          style: { marginBottom: 6 },
                          children: [
                            s.name,
                            c.jsxs('span', {
                              style: { fontWeight: 400, color: 'var(--ap-ink-3)' },
                              children: [t[s.id], '%'],
                            }),
                          ],
                        }),
                        c.jsx(Hp, {
                          min: 0,
                          max: 100,
                          step: 5,
                          value: t[s.id],
                          onChange: (u) => n((d) => ({ ...d, [s.id]: Number(u) })),
                          formatTooltip: (u) => `${u}%`,
                        }),
                      ],
                    },
                    s.id,
                  ),
                ),
              }),
              !o &&
                c.jsxs('div', {
                  className: 'ap-notice',
                  'data-kind': 'warn',
                  style: { marginTop: 14 },
                  children: [
                    c.jsx(og, {}),
                    c.jsxs('span', {
                      children: [
                        '\u4E09\u8DEF\u6743\u91CD\u5408\u8BA1\u9700\u4E3A 100%\uFF0C\u5F53\u524D\u4E3A ',
                        i,
                        '%\u3002\u8C03\u6574\u540E\u4F1A\u91CD\u65B0\u52A0\u5DE5\u521D\u7248\u9700\u6C42\u3002',
                      ],
                    }),
                  ],
                }),
            ],
          }),
        ],
      }),
      c.jsxs('section', {
        className: 'ap-board-card',
        children: [
          c.jsxs('div', {
            className: 'ap-card-head',
            children: [
              c.jsxs('h3', {
                children: [
                  '\u52A0\u5DE5\u540E\u7684\u521D\u7248\u9700\u6C42',
                  c.jsx(ut, {
                    size: 'small',
                    bordered: true,
                    children: '\u90D1\u5DDE\u57FA\u5730',
                  }),
                ],
              }),
              c.jsx('span', {
                style: { fontSize: 11.5, color: 'var(--ap-ink-3)' },
                children:
                  '\u5355\u4F4D\uFF1A\u4EF6\uFF08\u6309\u5355\u54C1\u51C0\u91CD\u6298\u7B97\uFF09\xB7 \u521D\u7248\u9700\u6C42\u968F\u6743\u91CD\u5B9E\u65F6\u53D8\u5316',
              }),
              c.jsx('span', { style: { flex: 1 } }),
              l &&
                c.jsx(Ke, {
                  size: 'small',
                  onClick: () => a({}),
                  children: '\u91CD\u7F6E\u4E3A\u521D\u7248\u9700\u6C42',
                }),
            ],
          }),
          c.jsx('div', {
            className: 'ap-card-body flush',
            style: { overflowX: 'auto' },
            children: c.jsxs('table', {
              className: 'ap-table',
              children: [
                c.jsx('thead', {
                  children: c.jsxs('tr', {
                    children: [
                      c.jsx('th', { children: '\u5927\u7C7B' }),
                      c.jsx('th', { children: '\u7CFB\u5217' }),
                      c.jsx('th', { children: '\u5355\u54C1' }),
                      c.jsx('th', { children: '\u8BA1\u5212\u63D0\u62A5' }),
                      c.jsx('th', { children: '\u6210\u957F\u9884\u6D4B' }),
                      c.jsx('th', { children: '\u5386\u53F2\u53D1\u8D27' }),
                      c.jsx('th', { children: '\u521D\u7248\u9700\u6C42' }),
                      c.jsx('th', {
                        children: '\u6700\u7EC8\u9700\u6C42\uFF08\u53EF\u8C03\u6574\uFF09',
                      }),
                    ],
                  }),
                }),
                c.jsx('tbody', {
                  children: gV.map((s) => {
                    var p;
                    const u = vu(sH(s, t), s.net),
                      d = (p = r[s.sku]) != null ? p : u,
                      v = r[s.sku] !== void 0 && r[s.sku] !== u;
                    return c.jsxs(
                      'tr',
                      {
                        children: [
                          c.jsx('td', { className: 'ap-left', children: s.cat }),
                          c.jsx('td', {
                            className: 'ap-left',
                            children: c.jsx(ut, {
                              size: 'small',
                              bordered: true,
                              children: s.series,
                            }),
                          }),
                          c.jsx('td', { className: 'ap-left', children: s.sku }),
                          c.jsx('td', {
                            className: 'ap-num ap-muted',
                            children:
                              s.report === null ? '\u2014' : vu(s.report, s.net).toLocaleString(),
                          }),
                          c.jsx('td', {
                            className: 'ap-num',
                            children: vu(s.growth, s.net).toLocaleString(),
                          }),
                          c.jsx('td', {
                            className: 'ap-num ap-muted',
                            children: vu(s.ship, s.net).toLocaleString(),
                          }),
                          c.jsx('td', {
                            className: 'ap-num',
                            style: { fontWeight: 650, color: 'var(--primary-7)' },
                            children: u.toLocaleString(),
                          }),
                          c.jsx('td', {
                            children: c.jsxs('span', {
                              style: { display: 'inline-flex', gap: 6, alignItems: 'center' },
                              children: [
                                c.jsx(hi, {
                                  size: 'small',
                                  min: 0,
                                  step: 1e3,
                                  value: d,
                                  style: { width: 132 },
                                  onChange: (h) => a((m) => ({ ...m, [s.sku]: Number(h) || 0 })),
                                }),
                                v &&
                                  c.jsx(ut, {
                                    size: 'small',
                                    color: 'orange',
                                    bordered: true,
                                    children: '\u5DF2\u8C03\u6574',
                                  }),
                              ],
                            }),
                          }),
                        ],
                      },
                      s.sku,
                    );
                  }),
                }),
              ],
            }),
          }),
          c.jsx('div', {
            className: 'ap-card-body',
            style: { borderTop: '1px solid var(--ap-line)', paddingTop: 12 },
            children: c.jsxs('span', {
              style: { fontSize: 12.6, color: 'var(--ap-ink-2)' },
              children: [
                '\u6700\u7EC8\u9700\u6C42 ',
                c.jsx('b', { children: '\u9ED8\u8BA4\u7B49\u4E8E\u521D\u7248\u9700\u6C42' }),
                '\uFF0C\u53EF\u9010\u884C\u4EBA\u5DE5\u8C03\u6574\uFF1B\u7CFB\u7EDF\u53EA\u505A\u63D0\u793A\u3001\u4E0D\u88C1\u51B3\uFF0C\u6700\u7EC8\u4EE5\u54C1\u7C7B\u8BC4\u4F30\u7ED3\u679C\u4E3A\u51C6\u3002',
              ],
            }),
          }),
        ],
      }),
    ],
  });
}
const Zd = bV.map((e) => ({ label: e, value: e })),
  $1 = xV.map((e) => ({ label: e, value: e }));
function cH(e) {
  const {
      visible: t,
      tab: n,
      onTab: r,
      onClose: a,
      skus: i,
      onSkus: o,
      lines: l,
      onLines: s,
      transfers: u,
      onTransfers: d,
      blanksOnly: v,
      onBlanksOnly: p,
    } = e,
    [h, m] = usePageViewField(y, mpsView, 'masterSearch', ''),
    [g, w] = usePageViewField(
      y,
      mpsView,
      'masterSelected',
      undefined,
      (value) => value ?? null,
      (value) =>
        value == null
          ? undefined
          : [...i, ...l, ...u].some((row) => row.id === value)
            ? value
            : undefined,
    ),
    b = y.useRef(null);
  y.useEffect(() => {
    var z;
    t && ((z = b.current) == null || z.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }, [t]);
  const x = (z) => {
      var R;
      return !z.base || !z.shop || !z.lineId || !((R = ju(z.lineId)) != null && R.series) || !z.net;
    },
    C = (z) => !z.base || !z.shop || !z.center || !z.tunnel || !z.series || !z.ton || !z.dayPcs,
    _ = (z) => !z.from || !z.to || !z.code || !z.name,
    E = y.useMemo(
      () =>
        i.filter((z) => {
          var R, K;
          return !(
            (h && !(z.code.includes(h) || z.name.includes(h))) ||
            (g && ((K = (R = ju(z.lineId)) == null ? void 0 : R.series) != null ? K : '') !== g) ||
            (v && !x(z))
          );
        }),
      [i, h, g, v],
    ),
    O = y.useMemo(() => (v ? l.filter(C) : l), [l, v]),
    P = y.useMemo(() => (v ? u.filter(_) : u), [u, v]),
    N = (z, R) => {
      o(i.map((K) => (K.id === z ? { ...K, ...R } : K)));
    },
    S = (z) =>
      Array.from(new Set(l.filter((R) => R.base === z).map((R) => R.shop))).map((R) => ({
        label: R,
        value: R,
      })),
    j = (z, R) =>
      l
        .filter((K) => K.base === z && K.shop === R)
        .map((K) => ({ label: `${K.center} \xB7 ${K.tunnel}`, value: K.id })),
    I = [
      {
        title: '\u7269\u6599\u53F7',
        dataIndex: 'code',
        width: 96,
        render: (z) => c.jsx('span', { style: { whiteSpace: 'nowrap' }, children: z }),
      },
      { title: '\u7269\u6599\u540D\u79F0', dataIndex: 'name', width: 178, ellipsis: true },
      {
        title: '\u7CFB\u5217',
        dataIndex: 'lineId',
        width: 126,
        render: (z) => {
          var K;
          const R = (K = ju(z)) == null ? void 0 : K.series;
          return R
            ? c.jsx(ut, { size: 'small', bordered: true, children: R })
            : c.jsx('span', { className: 'ap-muted', children: '\u2014' });
        },
      },
      { title: '\u51C0\u91CD(kg)', dataIndex: 'net', width: 84, align: 'right' },
      {
        title: '\u57FA\u5730',
        dataIndex: 'base',
        width: 98,
        render: (z, R) =>
          c.jsx(kn, {
            size: 'small',
            value: z || void 0,
            placeholder: '\u8BF7\u9009\u62E9',
            allowClear: true,
            options: Zd,
            style: { width: '100%' },
            onChange: (K) => N(R.id, { base: K || '', shop: '', lineId: '' }),
          }),
      },
      {
        title: '\u8F66\u95F4',
        dataIndex: 'shop',
        width: 148,
        render: (z, R) =>
          c.jsx(kn, {
            size: 'small',
            value: z || void 0,
            placeholder: R.base ? '\u8BF7\u9009\u62E9' : '\u5148\u9009\u57FA\u5730',
            allowClear: true,
            disabled: !R.base,
            options: S(R.base),
            style: { width: '100%' },
            onChange: (K) => N(R.id, { shop: K || '', lineId: '' }),
          }),
      },
      {
        title: '\u4EA7\u7EBF',
        dataIndex: 'lineId',
        width: 164,
        render: (z, R) =>
          c.jsx(kn, {
            size: 'small',
            value: z || void 0,
            placeholder: R.shop ? '\u8BF7\u9009\u62E9' : '\u5148\u9009\u8F66\u95F4',
            allowClear: true,
            disabled: !R.shop,
            options: j(R.base, R.shop),
            style: { width: '100%' },
            onChange: (K) => N(R.id, { lineId: K || '' }),
          }),
      },
    ],
    $ = new Set(i.map((z) => z.code)),
    T = i.filter(x).length,
    D = l.filter(C).length,
    B = u.filter(_).length,
    M = (z, R) => {
      s(l.map((K) => (K.id === z ? { ...K, ...R } : K)));
    },
    A = [
      { title: '\u57FA\u5730', dataIndex: 'base', width: 76 },
      { title: '\u5DE5\u4F5C\u4E2D\u5FC3', dataIndex: 'center', width: 96 },
      { title: '\u8F66\u95F4', dataIndex: 'shop', width: 158 },
      { title: '\u96A7\u9053', dataIndex: 'tunnel', width: 70 },
      {
        title: '\u5428\u4F4D\uFF08\u5428\uFF09',
        dataIndex: 'ton',
        width: 118,
        render: (z, R) =>
          c.jsx(hi, {
            size: 'small',
            min: 0,
            step: 0.5,
            value: z,
            style: { width: '100%' },
            onChange: (K) => M(R.id, { ton: Number(K) || 0 }),
          }),
      },
      {
        title: '\u7CFB\u5217\uFF08\u53EF\u9009\uFF09',
        dataIndex: 'series',
        width: 208,
        render: (z, R) =>
          c.jsx(kn, {
            size: 'small',
            value: z || void 0,
            placeholder: '\u8BF7\u9009\u62E9\u7CFB\u5217',
            allowClear: true,
            showSearch: true,
            options: $1,
            style: { width: '100%' },
            onChange: (K) => M(R.id, { series: K || '' }),
          }),
      },
      {
        title: '\u6807\u51C6\u65E5\u4EA7\uFF08\u4EF6/\u65E5\uFF09',
        dataIndex: 'dayPcs',
        width: 178,
        render: (z, R) =>
          c.jsx(hi, {
            size: 'small',
            min: 0,
            step: 100,
            value: z,
            style: { width: '100%' },
            onChange: (K) => M(R.id, { dayPcs: Number(K) || 0 }),
          }),
      },
    ],
    k = () => {
      void (d([...u, { id: `T${Date.now()}`, from: '', to: '', code: '', name: '' }]),
      kt.info(
        '\u5DF2\u65B0\u589E\u4E00\u884C\uFF0C\u8BF7\u9009\u62E9\u53D1\u51FA / \u63A5\u6536\u57FA\u5730\u5E76\u586B\u7269\u6599',
      ));
    },
    L = (z, R) => {
      d(u.map((K) => (K.id === z ? { ...K, ...R } : K)));
    },
    F = [
      {
        title: '\u53D1\u51FA\u57FA\u5730',
        dataIndex: 'from',
        width: 150,
        render: (z, R) =>
          c.jsx(kn, {
            size: 'small',
            value: z || void 0,
            placeholder: '\u8BF7\u9009\u62E9',
            options: Zd,
            style: { width: '100%' },
            onChange: (K) => L(R.id, { from: K || '' }),
          }),
      },
      {
        title: '\u63A5\u6536\u57FA\u5730',
        dataIndex: 'to',
        width: 150,
        render: (z, R) =>
          c.jsx(kn, {
            size: 'small',
            value: z || void 0,
            placeholder: '\u8BF7\u9009\u62E9',
            options: Zd.filter((K) => K.value !== R.from),
            style: { width: '100%' },
            onChange: (K) => L(R.id, { to: K || '' }),
          }),
      },
      {
        title: '\u7269\u6599\u7F16\u7801',
        dataIndex: 'code',
        width: 140,
        render: (z, R) =>
          c.jsx(Zt, {
            size: 'small',
            value: z,
            placeholder: '\u7269\u6599\u7F16\u7801',
            onChange: (K) => L(R.id, { code: K }),
          }),
      },
      {
        title: '\u7269\u6599\u63CF\u8FF0',
        dataIndex: 'name',
        width: 300,
        render: (z, R) =>
          c.jsx(Zt, {
            size: 'small',
            value: z,
            placeholder: '\u7269\u6599\u63CF\u8FF0',
            onChange: (K) => L(R.id, { name: K }),
          }),
      },
      {
        title: '\u64CD\u4F5C',
        dataIndex: 'op',
        width: 80,
        render: (z, R) =>
          c.jsx(Ke, {
            size: 'mini',
            type: 'text',
            status: 'danger',
            onClick: () => d(u.filter((K) => K.id !== R.id)),
            children: '\u5220\u9664',
          }),
      },
    ],
    W = [
      '\u5355\u54C1 \u2013 \u4EA7\u7EBF\u5F52\u5C5E',
      '\u4EA7\u7EBF \u2013 \u7CFB\u5217 / \u4EA7\u80FD\u53C2\u6570',
      '\u57FA\u5730 \u2013 \u8C03\u62E8\u8303\u56F4',
    ],
    U = n === 0 ? i.length : n === 1 ? l.length : u.length,
    V = () =>
      kt.success(`\u5DF2\u5BFC\u51FA\u300A${W[n]}\u300B\u5171 ${U} \u6761\uFF08\u6A21\u62DF\uFF09`),
    H = () =>
      kt.info(
        `\u5DF2\u6253\u5F00\u300A${W[n]}\u300B\u7684\u4E0A\u4F20\u5165\u53E3\uFF0C\u6309\u6A21\u677F\u6279\u91CF\u5BFC\u5165\u5373\u53EF\uFF08\u6A21\u62DF\uFF09`,
      ),
    J =
      n === 0
        ? `\u672C\u9875 ${E.length} / ${i.length} \u884C\uFF08${$.size} \u4E2A\u5355\u54C1 \xB7 \u6309\u5355\u54C1\xD7\u4EA7\u7EBF\u5C55\u5F00\uFF09\xB7 \u4E0D\u5B8C\u6574 ${T} \u884C`
        : n === 1
          ? `\u672C\u9875 ${O.length} / ${l.length} \u6761\u4EA7\u7EBF \xB7 \u4E0D\u5B8C\u6574\uFF08\u7F3A\u57FA\u5730/\u8F66\u95F4/\u96A7\u9053/\u7CFB\u5217/\u5428\u4F4D/\u65E5\u4EA7\u80FD\uFF09${D} \u6761`
          : `\u672C\u9875 ${P.length} / ${u.length} \u6761\u8C03\u62E8\u5173\u7CFB \xB7 \u4E0D\u5B8C\u6574 ${B} \u6761`;
  return t
    ? c.jsx('div', {
        ref: b,
        children: c.jsxs('section', {
          className: 'ap-board-card ap-maint-card',
          children: [
            c.jsxs('div', {
              className: 'ap-card-head',
              children: [
                c.jsx('h3', { children: '\u4E3B\u6570\u636E\u7EF4\u62A4' }),
                c.jsx('span', {
                  style: { fontSize: 11.5, color: 'var(--ap-ink-3)' },
                  children:
                    '\u6539\u52A8\u5373\u65F6\u4FDD\u5B58\u751F\u6548\uFF0C\u4E0D\u9700\u8981\u53E6\u8D70\u63D0\u4EA4',
                }),
                c.jsx('span', { style: { flex: 1 } }),
                c.jsx(Ke, { size: 'small', onClick: a, children: '\u6536\u8D77' }),
              ],
            }),
            c.jsxs('div', {
              className: 'ap-card-body',
              children: [
                c.jsxs(Ji, {
                  activeTab: String(n),
                  onChange: (z) => r(Number(z)),
                  extra: c.jsxs('span', {
                    style: { display: 'inline-flex', gap: 12, alignItems: 'center' },
                    children: [
                      c.jsx(Mr, {
                        checked: v,
                        onChange: p,
                        children: '\u53EA\u770B\u4E0D\u5B8C\u6574',
                      }),
                      c.jsxs('span', {
                        style: { display: 'inline-flex', gap: 8, alignItems: 'center' },
                        children: [
                          c.jsx(Ke, { size: 'small', onClick: V, children: '\u4E0B\u8F7D' }),
                          c.jsx(Ke, {
                            size: 'small',
                            type: 'primary',
                            onClick: H,
                            children: '\u4E0A\u4F20',
                          }),
                        ],
                      }),
                    ],
                  }),
                  children: [
                    c.jsxs(
                      Ji.TabPane,
                      {
                        title: '\u5355\u54C1 \u2013 \u4EA7\u7EBF\u5F52\u5C5E',
                        children: [
                          c.jsxs('div', {
                            className: 'ap-maint-bar',
                            children: [
                              c.jsx(Zt, {
                                size: 'small',
                                allowClear: true,
                                placeholder: '\u641C\u7269\u6599\u53F7\u6216\u54C1\u540D',
                                value: h,
                                onChange: m,
                                style: { width: 200 },
                              }),
                              c.jsx(kn, {
                                size: 'small',
                                placeholder: '\u5168\u90E8\u7CFB\u5217',
                                allowClear: true,
                                showSearch: true,
                                value: g,
                                options: $1,
                                onChange: (z) => w(z),
                                style: { width: 168 },
                              }),
                              c.jsx('span', { className: 'ap-maint-stat', children: J }),
                              c.jsx('span', { style: { flex: 1 } }),
                              c.jsx('span', {
                                style: { fontSize: 12, color: 'var(--ap-ink-3)' },
                                children:
                                  '\u57FA\u5730 / \u8F66\u95F4 / \u4EA7\u7EBF\u53EF\u4E0B\u62C9\u9009\u62E9\uFF1B\u9009\u4E0A\u4E00\u7EA7\u4F1A\u6E05\u6389\u4E0B\u4E00\u7EA7',
                              }),
                            ],
                          }),
                          c.jsx(ku, {
                            size: 'small',
                            border: true,
                            rowKey: 'id',
                            columns: I,
                            data: E,
                            pagination: false,
                            noDataElement: c.jsx('span', {
                              style: { fontSize: 12.5, color: 'var(--ap-ink-3)' },
                              children: v
                                ? '\u5F53\u524D\u6CA1\u6709\u4E0D\u5B8C\u6574\u7684\u8BB0\u5F55 \u2014\u2014 \u8FD9\u4E2A\u5217\u8868\u7684\u6570\u636E\u662F\u5B8C\u6574\u7684'
                                : '\u6682\u65E0\u6570\u636E',
                            }),
                            scroll: { x: 900, y: 460 },
                          }),
                        ],
                      },
                      '0',
                    ),
                    c.jsxs(
                      Ji.TabPane,
                      {
                        title: '\u4EA7\u7EBF \u2013 \u7CFB\u5217 / \u4EA7\u80FD\u53C2\u6570',
                        children: [
                          c.jsxs('div', {
                            className: 'ap-maint-bar',
                            children: [
                              c.jsx('span', { className: 'ap-maint-stat', children: J }),
                              c.jsx('span', { style: { flex: 1 } }),
                              c.jsx('span', {
                                style: { fontSize: 12, color: 'var(--ap-ink-3)' },
                                children:
                                  '\u7CFB\u5217\u4ECE\u4EA7\u54C1\u7CFB\u5217\u6E05\u5355\u91CC\u9009\uFF1B\u5428\u4F4D\u4E0E\u6807\u51C6\u65E5\u4EA7\uFF08\u4EF6/\u65E5\uFF09\u53EF\u76F4\u63A5\u6539',
                              }),
                            ],
                          }),
                          c.jsx(ku, {
                            size: 'small',
                            border: true,
                            rowKey: 'id',
                            columns: A,
                            data: O,
                            pagination: false,
                            noDataElement: c.jsx('span', {
                              style: { fontSize: 12.5, color: 'var(--ap-ink-3)' },
                              children: v
                                ? '\u5F53\u524D\u6CA1\u6709\u4E0D\u5B8C\u6574\u7684\u8BB0\u5F55 \u2014\u2014 \u8FD9\u4E2A\u5217\u8868\u7684\u6570\u636E\u662F\u5B8C\u6574\u7684'
                                : '\u6682\u65E0\u6570\u636E',
                            }),
                            scroll: { x: 904, y: 460 },
                          }),
                        ],
                      },
                      '1',
                    ),
                    c.jsxs(
                      Ji.TabPane,
                      {
                        title: '\u57FA\u5730 \u2013 \u8C03\u62E8\u8303\u56F4',
                        children: [
                          c.jsxs('div', {
                            className: 'ap-maint-bar',
                            children: [
                              c.jsx('h4', {
                                style: { margin: 0, fontSize: 13.5 },
                                children: '\u8C03\u62E8\u5173\u7CFB',
                              }),
                              c.jsx('span', {
                                className: 'ap-maint-stat',
                                children:
                                  '\u53D1\u51FA\u57FA\u5730 \xB7 \u63A5\u6536\u57FA\u5730 \xB7 \u7269\u6599\u7F16\u7801 \xB7 \u7269\u6599\u63CF\u8FF0',
                              }),
                              c.jsx('span', { style: { flex: 1 } }),
                              c.jsx(Ke, {
                                size: 'small',
                                type: 'primary',
                                onClick: k,
                                children: '\u65B0\u589E\u8C03\u62E8\u5173\u7CFB',
                              }),
                            ],
                          }),
                          c.jsx(ku, {
                            size: 'small',
                            border: true,
                            rowKey: 'id',
                            columns: F,
                            data: P,
                            pagination: false,
                            noDataElement: c.jsx('span', {
                              style: { fontSize: 12.5, color: 'var(--ap-ink-3)' },
                              children: v
                                ? '\u5F53\u524D\u6CA1\u6709\u4E0D\u5B8C\u6574\u7684\u8BB0\u5F55 \u2014\u2014 \u8FD9\u4E2A\u5217\u8868\u7684\u6570\u636E\u662F\u5B8C\u6574\u7684'
                                : '\u6682\u65E0\u6570\u636E',
                            }),
                            scroll: { x: 828, y: 460 },
                          }),
                        ],
                      },
                      '2',
                    ),
                  ],
                }),
                c.jsxs('div', {
                  className: 'ap-notice',
                  'data-kind': 'info',
                  style: { marginTop: 14, marginBottom: 0 },
                  children: [
                    c.jsx(jf, {}),
                    c.jsx('span', {
                      children:
                        '\u7B2C\u4E00\u671F\u4E0D\u7EB3\u5165\u300C\u4E13\u7EBF / \u67D4\u7EBF\u300D\u6807\u7B7E\u2014\u2014\u7B49\u5E74\u5EA6\u89C4\u5212\u7684\u4EA7\u7EBF\u5C5E\u6027\u786E\u5B9A\u540E\u518D\u4F5C\u4E3A\u72EC\u7ACB\u5B57\u6BB5\u8865\u5145\u3002\u5217\u8868\u53EF\u4E0B\u8F7D\u6A21\u677F\u3001\u7EBF\u4E0B\u8865\u5168\u540E\u4E0A\u4F20\u56DE\u5199\u3002',
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      })
    : null;
}
// prettier-ignore
const fH = { sku: 0, line: 1, base: 2 };
function dH() {
  const [e, t] = usePageViewField(y, mpsView, 'masterOpen', false),
    [n, r] = usePageViewField(y, mpsView, 'masterTab', 0),
    [a, i] = usePageViewField(
      y,
      mpsView,
      'masterSkus',
      wV,
      (value) => changedRows(value, wV),
      (value) => restoredRows(value, wV),
    ),
    [o, l] = usePageViewField(
      y,
      mpsView,
      'masterLines',
      NO,
      (value) => changedRows(value, NO),
      (value) => restoredRows(value, NO),
    ),
    [s, u] = usePageViewField(
      y,
      mpsView,
      'masterTransfers',
      _V,
      (value) => changedRows(value, _V),
      (value) => restoredRows(value, _V),
    ),
    [d, v] = usePageViewField(y, mpsView, 'masterBlanks', false);
  y.useEffect(() => {
    const m = () => {
      const g = window.location.hash.match(/maint-(\d)/);
      void (g && (r(Number(g[1])), v(/blanks/.test(window.location.hash)), t(true)));
    };
    return (
      m(),
      window.addEventListener('hashchange', m),
      () => window.removeEventListener('hashchange', m)
    );
  }, []);
  const p = (m) => {
      var g;
      void (v(false), r((g = fH[m]) != null ? g : 0), t(true));
    },
    h = Math.round(
      (Wd.reduce((m, g) => m + g.done, 0) / Wd.reduce((m, g) => m + g.total, 0)) * 100,
    );
  useMpsPart(
    y,
    'masterdata',
    {
      skuMappings: a,
      lineMappings: o,
      transferMappings: s,
      maintenanceOpen: e,
      maintenanceTab: n,
      onlyBlanks: d,
      completionPercent: h,
      groups: Wd,
    },
    pV['masterdata'] ?? vV['masterdata'],
  );
  return c.jsxs(c.Fragment, {
    children: [
      c.jsxs('div', {
        className: 'ap-notice',
        'data-kind': 'warn',
        style: { marginBottom: 16 },
        children: [
          c.jsx(og, {}),
          c.jsxs('span', {
            children: [
              '\u8FD9\u662F\u4EA7\u80FD\u8BC4\u4F30\u7684',
              c.jsx('b', { children: '\u524D\u63D0' }),
              '\uFF1A\u5355\u54C1\u5230\u4EA7\u80FD\u8D44\u6E90\u7684\u5BF9\u5E94\u5173\u7CFB\u4E0D\u9F50\uFF0C\u8BC4\u4F30\u5C31\u65E0\u4ECE\u8C08\u8D77\u3002\u5F53\u524D\u6574\u4F53\u5B8C\u6210\u5EA6',
              ' ',
              c.jsxs('b', { children: [h, '%'] }),
              '\uFF0C\u672A\u8865\u5168\u90E8\u5206\u5728\u8BC4\u4F30\u65F6\u4F1A\u663E\u5F0F\u6807\u4E3A\u300C\u53E3\u5F84\u672A\u5B9A\u300D\uFF0C\u4E0D\u7528\u4F30\u7B97\u503C\u66FF\u4EE3\u3002 \u70B9\u5361\u7247\u53F3\u4E0B\u89D2\u7684',
              c.jsx('b', { children: '\u53BB\u7EF4\u62A4' }),
              '\u53EF\u4EE5\u76F4\u63A5\u8865\u5168\u3002',
            ],
          }),
        ],
      }),
      c.jsx('div', {
        className: 'ap-grid-3',
        style: { marginBottom: 16 },
        children: Wd.map((m) => {
          const g = Math.round((m.done / m.total) * 100);
          return c.jsxs(
            'section',
            {
              className: 'ap-board-card ap-source-card',
              children: [
                c.jsxs('div', {
                  className: 'ap-card-head',
                  children: [
                    c.jsx('h3', { children: m.name }),
                    c.jsxs(ut, {
                      color: g >= 90 ? 'green' : g >= 70 ? 'orange' : 'red',
                      size: 'small',
                      bordered: true,
                      children: [g, '%'],
                    }),
                  ],
                }),
                c.jsxs('div', {
                  className: 'ap-card-body ap-source-body',
                  children: [
                    c.jsx('p', {
                      style: {
                        fontSize: 12.4,
                        color: 'var(--ap-ink-2)',
                        lineHeight: 1.66,
                        margin: '0 0 14px',
                      },
                      children: m.desc,
                    }),
                    c.jsx('div', {
                      className: 'ap-bar',
                      children: c.jsx('i', {
                        style: {
                          width: `${g}%`,
                          background: g >= 90 ? void 0 : 'linear-gradient(90deg,#F0A97F,#D2712C)',
                        },
                      }),
                    }),
                    c.jsxs('div', {
                      style: {
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'baseline',
                        marginTop: 10,
                      },
                      children: [
                        c.jsxs('span', {
                          style: { fontSize: 12.3, color: 'var(--ap-ink-2)' },
                          children: [
                            '\u5DF2\u5B8C\u6210 ',
                            c.jsx('b', { style: { fontSize: 15 }, children: m.done }),
                            ' / ',
                            m.total,
                            ' ',
                            m.unit,
                          ],
                        }),
                        c.jsx(Ke, {
                          size: 'mini',
                          type: 'primary',
                          onClick: () => p(m.id),
                          children: '\u53BB\u7EF4\u62A4',
                        }),
                      ],
                    }),
                    c.jsx('div', {
                      style: {
                        fontSize: 11.5,
                        color: 'var(--ap-ink-3)',
                        marginTop: 8,
                        lineHeight: 1.6,
                      },
                      children: m.detail,
                    }),
                  ],
                }),
              ],
            },
            m.id,
          );
        }),
      }),
      c.jsx(cH, {
        visible: e,
        tab: n,
        onTab: r,
        onClose: () => t(false),
        skus: a,
        onSkus: i,
        lines: o,
        onLines: l,
        transfers: s,
        onTransfers: u,
        blanksOnly: d,
        onBlanksOnly: v,
      }),
      c.jsxs('section', {
        className: 'ap-board-card',
        children: [
          c.jsxs('div', {
            className: 'ap-card-head',
            children: [
              c.jsxs('h3', {
                children: [
                  '\u5B58\u91CF\u5355\u54C1\u6807\u7B7E\u8865\u5168',
                  c.jsx(ut, {
                    color: 'orange',
                    size: 'small',
                    bordered: true,
                    children: '\u8FDB\u884C\u4E2D',
                  }),
                ],
              }),
              c.jsx('span', {
                style: { fontSize: 11.5, color: 'var(--ap-ink-3)' },
                children:
                  '\u5728\u4EA7\u5355\u54C1\u7531\u5404\u54C1\u7C7B\u8D1F\u8D23\u4EBA\u9010\u4E00\u6838\u5BF9',
              }),
              c.jsx('span', { style: { flex: 1 } }),
              c.jsx(Ke, {
                size: 'small',
                type: 'primary',
                onClick: () => {
                  void (v(true), r(0), t(true));
                },
                children: '\u53BB\u8865\u5168',
              }),
            ],
          }),
          c.jsx('div', {
            className: 'ap-card-body flush',
            style: { overflowX: 'auto' },
            children: c.jsxs('table', {
              className: 'ap-table',
              children: [
                c.jsx('thead', {
                  children: c.jsxs('tr', {
                    children: [
                      c.jsx('th', { children: '\u54C1\u7C7B' }),
                      c.jsx('th', { children: '\u5E94\u8865\u5355\u54C1' }),
                      c.jsx('th', { children: '\u5DF2\u5B8C\u6210' }),
                      c.jsx('th', { children: '\u5B8C\u6210\u5EA6' }),
                    ],
                  }),
                }),
                c.jsx('tbody', {
                  children: yV.map((m) => {
                    const g = Math.round((m.done / m.total) * 100);
                    return c.jsxs(
                      'tr',
                      {
                        children: [
                          c.jsx('td', {
                            className: 'ap-left',
                            style: { fontWeight: 600 },
                            children: m.cat,
                          }),
                          c.jsx('td', { className: 'ap-num', children: m.total }),
                          c.jsx('td', { className: 'ap-num', children: m.done }),
                          c.jsx('td', {
                            style: { width: 180 },
                            children: c.jsx('div', {
                              className: 'ap-bar',
                              children: c.jsx('i', {
                                style: {
                                  width: `${g}%`,
                                  background:
                                    g === 100 ? void 0 : 'linear-gradient(90deg,#F0A97F,#D2712C)',
                                },
                              }),
                            }),
                          }),
                        ],
                      },
                      m.cat,
                    );
                  }),
                }),
              ],
            }),
          }),
        ],
      }),
    ],
  });
}
const { Item: vH } = Ef;
function pH() {
  const [t, n] = usePageViewField(y, mpsView, 'plansOpen', false),
    r = ['M+1 \xB7 10 \u6708', 'M+2 \xB7 11 \u6708', 'M+3 \xB7 12 \u6708'],
    a = (o) => Ud.filter((l) => l.month === o).reduce((l, s) => l + s.plan, 0),
    i = Ud.reduce((o, l) => o + l.gap, 0);
  useMpsPart(y, 'plans', { rows: Ud, gapTotal: i }, pV['plans'] ?? vV['plans']);
  return c.jsxs(c.Fragment, {
    children: [
      c.jsx('div', {
        className: 'ap-grid-3',
        style: { marginBottom: 16 },
        children: r.map((o) =>
          c.jsx(
            'section',
            {
              className: 'ap-board-card',
              style: { marginBottom: 0 },
              children: c.jsxs('div', {
                className: 'ap-card-body',
                children: [
                  c.jsxs('div', {
                    style: { fontSize: 12, color: 'var(--ap-ink-3)', marginBottom: 6 },
                    children: [o, ' \u4E3B\u8BA1\u5212\u91CF'],
                  }),
                  c.jsxs('div', {
                    style: { fontSize: 22, fontWeight: 650, letterSpacing: '-0.3px' },
                    children: [
                      a(o).toLocaleString(),
                      c.jsx('span', {
                        style: {
                          fontSize: 12.5,
                          fontWeight: 400,
                          color: 'var(--ap-ink-3)',
                          marginLeft: 6,
                        },
                        children: '\u5428',
                      }),
                    ],
                  }),
                  c.jsx('div', {
                    style: {
                      marginTop: 8,
                      fontSize: 12,
                      color: o === 'M+3 \xB7 12 \u6708' ? 'var(--ap-ink-3)' : 'var(--ap-ink-2)',
                    },
                    children:
                      o === 'M+3 \xB7 12 \u6708'
                        ? '\u53C2\u8003\u503C \xB7 \u4E0D\u53EF\u6267\u884C'
                        : '\u542B 4 \u4E2A\u5927\u7C7B \xB7 \u660E\u7EC6\u5230\u5355\u54C1',
                  }),
                ],
              }),
            },
            o,
          ),
        ),
      }),
      c.jsxs('section', {
        className: 'ap-board-card',
        children: [
          c.jsxs('div', {
            className: 'ap-card-head',
            children: [
              c.jsxs('h3', {
                children: [
                  '\u6EDA\u52A8\u4E3B\u751F\u4EA7\u8BA1\u5212',
                  c.jsx(ut, {
                    size: 'small',
                    bordered: true,
                    children: '\u90D1\u5DDE\u57FA\u5730',
                  }),
                ],
              }),
              c.jsx('span', {
                style: { fontSize: 11.5, color: 'var(--ap-ink-3)' },
                children:
                  '\u5355\u4F4D\uFF1A\u5428 \xB7 \u4E3B\u8BA1\u5212\u91CF / \u8BC4\u4F30\u53EF\u6EE1\u8DB3\u91CF / \u98CE\u9669\u7F3A\u53E3\u5206\u5217',
              }),
            ],
          }),
          c.jsx('div', {
            className: 'ap-card-body flush',
            style: { overflowX: 'auto' },
            children: c.jsxs('table', {
              className: 'ap-table',
              children: [
                c.jsx('thead', {
                  children: c.jsxs('tr', {
                    children: [
                      c.jsx('th', { children: '\u8BA1\u5212\u6708' }),
                      c.jsx('th', { children: '\u5927\u7C7B' }),
                      c.jsx('th', { children: '\u9700\u6C42' }),
                      c.jsx('th', { children: '\u671F\u521D\u5E93\u5B58' }),
                      c.jsx('th', { children: '\u4E3B\u8BA1\u5212\u91CF' }),
                      c.jsx('th', { children: '\u8BC4\u4F30\u53EF\u6EE1\u8DB3\u91CF' }),
                      c.jsx('th', { children: '\u98CE\u9669 / \u7F3A\u53E3' }),
                    ],
                  }),
                }),
                c.jsx('tbody', {
                  children: Ud.map((o) =>
                    c.jsxs(
                      'tr',
                      {
                        children: [
                          c.jsxs('td', {
                            children: [
                              o.month,
                              o.ref &&
                                c.jsx(ut, {
                                  size: 'small',
                                  bordered: true,
                                  style: { marginLeft: 6 },
                                  children: '\u53C2\u8003\u503C',
                                }),
                            ],
                          }),
                          c.jsx('td', { className: 'ap-left', children: o.cat }),
                          c.jsx('td', { className: 'ap-num', children: o.demand.toLocaleString() }),
                          c.jsx('td', {
                            className: 'ap-num ap-muted',
                            children: o.open.toLocaleString(),
                          }),
                          c.jsx('td', { className: 'ap-num', children: o.plan.toLocaleString() }),
                          c.jsx('td', { className: 'ap-num', children: o.ok.toLocaleString() }),
                          c.jsx('td', {
                            className: 'ap-num',
                            style: { color: o.gap < 0 ? 'var(--red-6)' : 'var(--ap-ink-3)' },
                            children: o.gap === 0 ? '\u2014' : o.gap.toLocaleString(),
                          }),
                        ],
                      },
                      `${o.month}-${o.cat}`,
                    ),
                  ),
                }),
              ],
            }),
          }),
          c.jsxs('div', {
            className: 'ap-card-body',
            style: { borderTop: '1px solid var(--ap-line)', paddingTop: 12 },
            children: [
              c.jsxs('div', {
                style: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
                children: [
                  c.jsxs('span', {
                    style: { fontSize: 12.6, color: 'var(--ap-ink-2)' },
                    children: [
                      '\u5408\u8BA1\u7F3A\u53E3 ',
                      c.jsxs('b', {
                        style: { color: i < 0 ? 'var(--red-6)' : 'var(--ap-ink)' },
                        children: [i.toLocaleString(), ' \u5428'],
                      }),
                      '\uFF08\u5168\u90E8\u843D\u5728 M+2 \u997A\u5B50\u5927\u7C7B\uFF09',
                    ],
                  }),
                  c.jsx('span', { style: { flex: 1 } }),
                  c.jsx(Ke, {
                    size: 'small',
                    onClick: () => n((o) => !o),
                    children: t
                      ? '\u6536\u8D77\u671F\u521D\u5E93\u5B58\u63A8\u7B97'
                      : '\u67E5\u770B\u671F\u521D\u5E93\u5B58\u63A8\u7B97',
                  }),
                  c.jsx(Ke, {
                    size: 'small',
                    onClick: () =>
                      kt.info(
                        '\u5DF2\u751F\u6210\u8BC4\u4F30\u4F1A\u6750\u6599\uFF08\u6A21\u62DF\uFF09',
                      ),
                    children: '\u751F\u6210\u8BC4\u4F30\u4F1A\u6750\u6599',
                  }),
                ],
              }),
              t &&
                c.jsx('div', {
                  style: { marginTop: 14 },
                  children: c.jsx(Ef, {
                    bordered: false,
                    defaultActiveKey: ['1'],
                    children: c.jsxs(vH, {
                      header:
                        '\u671F\u521D\u5E93\u5B58 = \u73B0\u5E93\u5B58 + \u8C03\u62E8\u5165\u5E93\uFF08\u542B\u5728\u9014\uFF09+ \u672C\u6708\u5269\u4F59\u6392\u4EA7 \u2212\uFF08\u672C\u6708\u9884\u4F30\u53D1\u8FD0 \u2212 \u5DF2\u53D1\u8D27\uFF09\u2212 \u8C03\u62E8\u51FA\u5E93',
                      name: '1',
                      children: [
                        c.jsx('dl', {
                          className: 'ap-kv',
                          style: { maxWidth: 420 },
                          children: SV.map((o) =>
                            c.jsxs(
                              f.Fragment,
                              {
                                children: [
                                  c.jsx('dt', { children: o.k }),
                                  c.jsx('dd', {
                                    style: { fontWeight: o.bold ? 650 : 400 },
                                    children: o.v,
                                  }),
                                ],
                              },
                              o.k,
                            ),
                          ),
                        }),
                        c.jsx('div', {
                          style: { fontSize: 11.8, color: 'var(--ap-ink-3)', marginTop: 8 },
                          children:
                            '\u53E3\u5F84\u4E0E\u300C\u672C\u6708\u9884\u4F30\u53D1\u8D27\u300D\u9875\u4E00\u81F4\uFF1A\u8FD9\u91CC\u7528\u7684\u662F\u6574\u6708\u9884\u4F30\u53D1\u8FD0\uFF0C\u672C\u6708\u7684\u8D26\u53EA\u7B97\u5230\u5269\u4F59\u5929\u6570\u9884\u4F30\u90A3\u4E00\u6BB5\u3002',
                        }),
                      ],
                    }),
                  }),
                }),
            ],
          }),
        ],
      }),
      c.jsxs('section', {
        className: 'ap-board-card',
        children: [
          c.jsxs('div', {
            className: 'ap-card-head',
            children: [
              c.jsx('h3', { children: '\u8BA1\u5212\u8D28\u91CF\u8BCA\u65AD' }),
              c.jsx('span', {
                style: { fontSize: 11.5, color: 'var(--ap-ink-3)' },
                children: '\u5BF9\u6807\u5355\u54C1\u8BA1\u5212\u51C6\u786E\u7387\u57FA\u7EBF 75%',
              }),
            ],
          }),
          c.jsx('div', {
            className: 'ap-card-body',
            children: c.jsx('div', {
              className: 'ap-grid-2',
              children: [
                {
                  k: '\u672C\u671F\u8BA1\u5212\u51C6\u786E\u7387',
                  v: '82%',
                  d: '\u8F83\u57FA\u7EBF\u9AD8 7 \u4E2A\u767E\u5206\u70B9',
                  bar: 82,
                  warn: false,
                },
                {
                  k: '\u4F4E\u4E8E\u57FA\u7EBF\u7684\u5355\u54C1',
                  v: '2 \u4E2A',
                  d: '\u96C6\u4E2D\u5728\u8C03\u5473\u54C1\u4E0E\u65B0\u4E0A\u5E02\u5355\u54C1',
                  bar: 24,
                  warn: true,
                },
              ].map((o) =>
                c.jsxs(
                  'div',
                  {
                    children: [
                      c.jsxs('div', {
                        style: {
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'baseline',
                          marginBottom: 6,
                        },
                        children: [
                          c.jsx('span', {
                            style: { fontSize: 12.6, color: 'var(--ap-ink-2)' },
                            children: o.k,
                          }),
                          c.jsx('b', {
                            style: {
                              fontSize: 16,
                              color: o.warn ? 'var(--red-6)' : 'var(--ap-ink)',
                            },
                            children: o.v,
                          }),
                        ],
                      }),
                      c.jsx('div', {
                        className: 'ap-bar',
                        children: c.jsx('i', {
                          style: {
                            width: `${o.bar}%`,
                            background: o.warn ? 'linear-gradient(90deg,#F08A82,#D24038)' : void 0,
                          },
                        }),
                      }),
                      c.jsx('div', {
                        style: { fontSize: 11.5, color: 'var(--ap-ink-3)', marginTop: 6 },
                        children: o.d,
                      }),
                    ],
                  },
                  o.k,
                ),
              ),
            }),
          }),
        ],
      }),
    ],
  });
}
function il(e) {
  return e >= 90 ? 'var(--red-6)' : e >= 85 ? 'var(--orange-6)' : 'var(--ap-ink)';
}
function D1(e) {
  return e >= 90
    ? c.jsx(ut, { color: 'red', size: 'small', bordered: true, children: '\u8D85\u4E0A\u9650' })
    : e >= 85
      ? c.jsx(ut, { color: 'orange', size: 'small', bordered: true, children: '\u504F\u9AD8' })
      : null;
}
function hH() {
  useMpsPart(y, 'capacity', { baseline: PV, rows: j1 }, pV['capacity'] ?? vV['capacity']);
  return c.jsxs(c.Fragment, {
    children: [
      c.jsxs('section', {
        className: 'ap-board-card',
        children: [
          c.jsxs('div', {
            className: 'ap-card-head',
            children: [
              c.jsx('h3', { children: '\u5E74\u5EA6\u89C4\u5212\u57FA\u51C6' }),
              c.jsx('span', {
                style: { fontSize: 11.5, color: 'var(--ap-ink-3)' },
                children:
                  '\u5E74\u5EA6\u89C4\u5212\u662F\u6708\u5EA6\u8BC4\u4F30\u7684\u300C\u5C3A\u5B50\u300D\uFF0C\u6708\u5EA6\u7ED3\u679C\u987B\u4E0E\u5E74\u5EA6\u91CF\u505A\u5BF9\u5E94\u6821\u9A8C',
              }),
            ],
          }),
          c.jsx('div', {
            className: 'ap-card-body',
            children: c.jsx('dl', {
              className: 'ap-kv',
              children: PV.map((t) =>
                c.jsxs(
                  f.Fragment,
                  { children: [c.jsx('dt', { children: t.k }), c.jsx('dd', { children: t.v })] },
                  t.k,
                ),
              ),
            }),
          }),
        ],
      }),
      c.jsxs('section', {
        className: 'ap-board-card',
        children: [
          c.jsxs('div', {
            className: 'ap-card-head',
            children: [
              c.jsxs('h3', {
                children: [
                  '\u672C\u6708\u9700\u751F\u4EA7\u91CF vs \u5E74\u5EA6\u89C4\u5212\u4EA7\u80FD',
                ],
              }),
              c.jsx('span', {
                style: { fontSize: 11.5, color: 'var(--ap-ink-3)' },
                children:
                  '\u5355\u4F4D\uFF1A\u5428 \xB7 \u53EA\u6309\u5428\u4EA7\u80FD\u8BC4\u4F30',
              }),
            ],
          }),
          c.jsx('div', {
            className: 'ap-card-body flush',
            style: { overflowX: 'auto' },
            children: c.jsxs('table', {
              className: 'ap-table',
              children: [
                c.jsx('thead', {
                  children: c.jsxs('tr', {
                    children: [
                      c.jsx('th', { children: '\u57FA\u5730' }),
                      c.jsx('th', { children: '\u672C\u6708\u9700\u751F\u4EA7\u91CF' }),
                      c.jsx('th', { children: '\u5E74\u5EA6\u89C4\u5212\u4EA7\u80FD' }),
                      c.jsx('th', { children: '\u8D1F\u8377\u7387' }),
                      c.jsx('th', { children: '\u4F59\u91CF' }),
                      c.jsx('th', { children: 'M+2' }),
                      c.jsx('th', { children: 'M+3' }),
                    ],
                  }),
                }),
                c.jsx('tbody', {
                  children: EV.map((t) => {
                    const n = t.yearBase - t.need;
                    return c.jsxs(
                      'tr',
                      {
                        children: [
                          c.jsx('td', { className: 'ap-left', children: t.base }),
                          c.jsx('td', { className: 'ap-num', children: t.need.toLocaleString() }),
                          c.jsx('td', {
                            className: 'ap-num ap-muted',
                            children: t.yearBase.toLocaleString(),
                          }),
                          c.jsxs('td', {
                            className: 'ap-num',
                            style: { color: il(t.m1), fontWeight: t.m1 >= 90 ? 650 : 400 },
                            children: [t.m1, '%'],
                          }),
                          c.jsx('td', {
                            className: 'ap-num',
                            style: { color: n < 0 ? 'var(--red-6)' : 'var(--ap-ink-3)' },
                            children: n > 0 ? `+${n.toLocaleString()}` : n.toLocaleString(),
                          }),
                          c.jsxs('td', {
                            className: 'ap-num',
                            style: { color: il(t.m2) },
                            children: [t.m2, '% ', D1(t.m2)],
                          }),
                          c.jsxs('td', {
                            className: 'ap-num',
                            style: { color: il(t.m3) },
                            children: [t.m3, '%'],
                          }),
                        ],
                      },
                      t.base,
                    );
                  }),
                }),
              ],
            }),
          }),
          c.jsx('div', {
            className: 'ap-card-body',
            style: { borderTop: '1px solid var(--ap-line)', paddingTop: 12 },
            children: c.jsxs('div', {
              style: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
              children: [
                c.jsx('span', {
                  style: { fontSize: 12.6, color: 'var(--ap-ink-2)' },
                  children:
                    '\u90D1\u5DDE\u57FA\u5730\u8D1F\u8377 92% \u4E3A\u6700\u9AD8\uFF0C\u6FEE\u9633 M+2 \u8FBE 91% \u4E5F\u4F1A\u8D8A\u8FC7\u4E0A\u9650\uFF1B\u4F59\u91CF\u4E3A\u8D1F\u8868\u793A\u9700\u5904\u7F6E\u3002',
                }),
                c.jsx('span', { style: { flex: 1 } }),
                c.jsx(Ke, {
                  size: 'small',
                  onClick: () =>
                    kt.info(
                      '\u5DF2\u6253\u5F00\u7EA6\u675F\u786E\u8BA4\u6D41\uFF08\u6A21\u62DF\uFF09',
                    ),
                  children: '\u67E5\u770B\u786E\u8BA4\u6D41',
                }),
                c.jsx(Ke, {
                  size: 'small',
                  onClick: () =>
                    kt.info('\u5DF2\u5BFC\u51FA\u8BC4\u4F30\u5E95\u7A3F\uFF08\u6A21\u62DF\uFF09'),
                  children: '\u5BFC\u51FA\u8BC4\u4F30\u5E95\u7A3F',
                }),
              ],
            }),
          }),
        ],
      }),
      c.jsxs('section', {
        className: 'ap-board-card',
        children: [
          c.jsxs('div', {
            className: 'ap-card-head',
            children: [
              c.jsx('h3', {
                children: '\u6838\u5FC3\u74F6\u9888\uFF1A\u96A7\u9053 \xB7 \u6210\u578B\u673A',
              }),
              c.jsx('span', {
                style: { fontSize: 11.5, color: 'var(--ap-ink-3)' },
                children:
                  'M+2 \u53E3\u5F84 \xB7 \u74F6\u9888\u5224\u5B9A\u53EA\u76EF\u8FD9\u4E24\u7C7B\u8D44\u6E90',
              }),
            ],
          }),
          c.jsx('div', {
            className: 'ap-card-body',
            style: { display: 'grid', gap: 14 },
            children: NV.map((t) =>
              c.jsxs(
                'div',
                {
                  children: [
                    c.jsxs('div', {
                      style: {
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'baseline',
                        marginBottom: 6,
                      },
                      children: [
                        c.jsxs('span', {
                          style: {
                            fontSize: 13,
                            fontWeight: 600,
                            display: 'flex',
                            gap: 8,
                            alignItems: 'center',
                          },
                          children: [t.line, D1(t.rate)],
                        }),
                        c.jsxs('span', {
                          style: { fontSize: 12.3, color: 'var(--ap-ink-2)' },
                          children: [
                            '\u96A7\u9053 ',
                            c.jsxs('b', {
                              style: { color: il(t.tunnel) },
                              children: [t.tunnel, '%'],
                            }),
                            c.jsxs('span', {
                              style: { color: 'var(--ap-ink-3)' },
                              children: [
                                ' ',
                                '\xB7 \u6210\u578B\u673A ',
                                c.jsxs('b', {
                                  style: { color: il(t.former) },
                                  children: [t.former, '%'],
                                }),
                              ],
                            }),
                          ],
                        }),
                      ],
                    }),
                    c.jsx('div', {
                      className: 'ap-bar',
                      children: c.jsx('i', {
                        style: {
                          width: `${Math.max(t.tunnel, t.former)}%`,
                          background:
                            Math.max(t.tunnel, t.former) >= 90
                              ? 'linear-gradient(90deg,#F08A82,#D24038)'
                              : void 0,
                        },
                      }),
                    }),
                    c.jsx('div', {
                      style: { fontSize: 11.5, color: 'var(--ap-ink-3)', marginTop: 6 },
                      children: t.note,
                    }),
                  ],
                },
                t.line,
              ),
            ),
          }),
        ],
      }),
      c.jsxs('section', {
        className: 'ap-board-card',
        children: [
          c.jsxs('div', {
            className: 'ap-card-head',
            children: [
              c.jsx('h3', { children: '\u80FD\u529B\u63AA\u65BD\u5151\u73B0\u8DDF\u8E2A' }),
              c.jsx('span', {
                style: { fontSize: 11.5, color: 'var(--ap-ink-3)' },
                children:
                  '\u5BF9\u6BD4\u627F\u8BFA\u4E0E\u5B9E\u9645\u60C5\u51B5\uFF0C\u8BC4\u4F30\u7ED3\u679C\u4E0D\u843D\u5730\u89C6\u4E3A\u672A\u5B8C\u6210',
              }),
            ],
          }),
          c.jsx('div', {
            className: 'ap-card-body flush',
            style: { overflowX: 'auto' },
            children: c.jsxs('table', {
              className: 'ap-table',
              children: [
                c.jsx('thead', {
                  children: c.jsxs('tr', {
                    children: [
                      c.jsx('th', { children: '\u63AA\u65BD' }),
                      c.jsx('th', { children: '\u5151\u73B0\u72B6\u6001' }),
                      c.jsx('th', { children: '\u627F\u8BFA\u4EA7\u80FD' }),
                      c.jsx('th', { children: '\u5B9E\u9645\u5151\u73B0' }),
                      c.jsx('th', { children: '\u8D23\u4EFB\u65B9' }),
                    ],
                  }),
                }),
                c.jsx('tbody', {
                  children: kV.map((t) =>
                    c.jsxs(
                      'tr',
                      {
                        children: [
                          c.jsx('td', { className: 'ap-left', children: t.name }),
                          c.jsx('td', {
                            children: c.jsx(ut, {
                              size: 'small',
                              bordered: true,
                              color:
                                t.status === '\u5DF2\u5151\u73B0'
                                  ? 'green'
                                  : t.status === '\u5EF6\u671F'
                                    ? 'red'
                                    : 'gray',
                              children: t.status,
                            }),
                          }),
                          c.jsx('td', { className: 'ap-num', children: t.promise }),
                          c.jsx('td', {
                            className: 'ap-num',
                            style: {
                              color: t.status === '\u5EF6\u671F' ? 'var(--red-6)' : 'var(--ap-ink)',
                            },
                            children: t.actual,
                          }),
                          c.jsx('td', { className: 'ap-left ap-muted', children: t.owner }),
                        ],
                      },
                      t.name,
                    ),
                  ),
                }),
              ],
            }),
          }),
        ],
      }),
    ],
  });
}
function mH() {
  const t = j1.filter((n) => n.over);
  useMpsPart(y, 'gap', { rows: t }, pV['gap'] ?? vV['gap']);
  return c.jsxs(c.Fragment, {
    children: [
      c.jsxs('div', {
        className: 'ap-notice',
        'data-kind': 'info',
        style: { marginBottom: 16 },
        children: [
          c.jsx(WV, {}),
          c.jsxs('span', {
            children: [
              '\u672C\u9875\u53EA\u505A\u4E00\u4EF6\u4E8B\uFF1A\u628A\u8D85\u51FA\u5E74\u5EA6\u89C4\u5212\u4E0A\u9650\u7684\u7F3A\u53E3\u6446\u51FA\u6765\uFF0C\u7ED9\u4E24\u4E2A\u5904\u7F6E\u65B9\u5411\u3002',
              c.jsx('b', {
                children:
                  '\u4E0D\u505A\u591A\u65B9\u6848\u63A8\u6F14\uFF0C\u4E5F\u4E0D\u505A\u81EA\u52A8\u65B9\u6848\u63A8\u8350\u4E0E\u6392\u5E8F',
              }),
              '\uFF0C\u9009\u54EA\u6761\u8DEF\u7531\u4EBA\u5DE5\u5728\u4EA7\u9500\u534F\u540C\u73AF\u8282\u51B3\u5B9A\u3002',
            ],
          }),
        ],
      }),
      c.jsxs('section', {
        className: 'ap-board-card',
        children: [
          c.jsxs('div', {
            className: 'ap-card-head',
            children: [
              c.jsxs('h3', { children: ['\u7F3A\u53E3\u603B\u89C8'] }),
              c.jsx('span', {
                style: { fontSize: 11.5, color: 'var(--ap-ink-3)' },
                children:
                  '\u5BF9\u7167\u5E74\u5EA6\u89C4\u5212\u57FA\u51C6\u6821\u9A8C\uFF0C\u8D85\u51FA\u4E0A\u9650\u7684\u624D\u9700\u8981\u5904\u7F6E',
              }),
            ],
          }),
          c.jsx('div', {
            className: 'ap-card-body flush',
            style: { overflowX: 'auto' },
            children: c.jsxs('table', {
              className: 'ap-table',
              children: [
                c.jsx('thead', {
                  children: c.jsxs('tr', {
                    children: [
                      c.jsx('th', { children: '\u57FA\u5730' }),
                      c.jsx('th', { children: '\u5927\u7C7B' }),
                      c.jsx('th', { children: '\u8BA1\u5212\u6708' }),
                      c.jsx('th', { children: '\u7F3A\u53E3' }),
                      c.jsx('th', { children: '\u4E0E\u5E74\u5EA6\u89C4\u5212\u5BF9\u6BD4' }),
                      c.jsx('th', { children: '\u5904\u7406' }),
                    ],
                  }),
                }),
                c.jsx('tbody', {
                  children: j1.map((n) =>
                    c.jsxs(
                      'tr',
                      {
                        children: [
                          c.jsx('td', { className: 'ap-left', children: n.base }),
                          c.jsx('td', { className: 'ap-left', children: n.cat }),
                          c.jsx('td', { children: n.month }),
                          c.jsxs('td', {
                            className: 'ap-num',
                            style: {
                              color: n.over ? 'var(--red-6)' : 'var(--ap-ink)',
                              fontWeight: n.over ? 650 : 400,
                            },
                            children: [n.gap, ' \u5428'],
                          }),
                          c.jsx('td', {
                            className: 'ap-left',
                            style: {
                              whiteSpace: 'normal',
                              fontWeight: 400,
                              color: 'var(--ap-ink-2)',
                            },
                            children: n.yearCap,
                          }),
                          c.jsx('td', {
                            children: c.jsx(ut, {
                              size: 'small',
                              bordered: true,
                              color: n.over ? 'red' : 'gray',
                              children: n.action,
                            }),
                          }),
                        ],
                      },
                      `${n.base}-${n.cat}-${n.month}`,
                    ),
                  ),
                }),
              ],
            }),
          }),
          c.jsx('div', {
            className: 'ap-card-body',
            style: { borderTop: '1px solid var(--ap-line)', paddingTop: 12 },
            children: c.jsxs('span', {
              style: { fontSize: 12.6, color: 'var(--ap-ink-2)' },
              children: [
                '\u672C\u6B21\u6709 ',
                c.jsx('b', { style: { color: 'var(--red-6)' }, children: t.length }),
                ' \u9879\u8D85\u51FA\u5E74\u5EA6\u89C4\u5212\u4E0A\u9650\uFF0C\u9700\u8981\u4EBA\u5DE5\u9009\u62E9\u5904\u7F6E\u65B9\u5411\u3002',
              ],
            }),
          }),
        ],
      }),
      c.jsxs('section', {
        className: 'ap-board-card',
        children: [
          c.jsxs('div', {
            className: 'ap-card-head',
            children: [
              c.jsxs('h3', {
                children: [
                  '\u53EF\u9009\u5904\u7F6E\u65B9\u5411',
                  c.jsx(ut, { size: 'small', bordered: true, children: '\u4E24\u7C7B' }),
                ],
              }),
              c.jsx('span', {
                style: { fontSize: 11.5, color: 'var(--ap-ink-3)' },
                children:
                  '\u53EA\u5E76\u5217\u5448\u73B0\uFF0C\u4E0D\u6392\u5E8F\u3001\u4E0D\u63A8\u8350',
              }),
            ],
          }),
          c.jsxs('div', {
            className: 'ap-card-body',
            children: [
              c.jsx('div', {
                className: 'ap-grid-2',
                children: jV.map((n) =>
                  c.jsxs(
                    'div',
                    {
                      style: {
                        border: '1px solid var(--ap-line)',
                        borderRadius: 12,
                        padding: '16px 18px',
                        background: '#FCFCFD',
                        display: 'flex',
                        flexDirection: 'column',
                      },
                      children: [
                        c.jsx('div', {
                          style: { fontSize: 15, fontWeight: 650, marginBottom: 8 },
                          children: n.name,
                        }),
                        c.jsx('p', {
                          style: {
                            fontSize: 12.6,
                            color: 'var(--ap-ink-2)',
                            lineHeight: 1.7,
                            margin: '0 0 14px',
                          },
                          children: n.desc,
                        }),
                        c.jsxs('dl', {
                          className: 'ap-facts',
                          style: { marginBottom: 14 },
                          children: [
                            c.jsxs('div', {
                              className: 'ap-fact',
                              children: [
                                c.jsx('dt', { children: '\u53EF\u8986\u76D6\u91CF' }),
                                c.jsx('dd', { children: n.effect }),
                              ],
                            }),
                            c.jsxs('div', {
                              className: 'ap-fact',
                              children: [
                                c.jsx('dt', { children: '\u4EE3\u4EF7' }),
                                c.jsx('dd', { children: n.cost }),
                              ],
                            }),
                            c.jsxs('div', {
                              className: 'ap-fact',
                              children: [
                                c.jsx('dt', { children: '\u9700\u8981\u786E\u8BA4' }),
                                c.jsx('dd', { children: n.side }),
                              ],
                            }),
                          ],
                        }),
                        c.jsx(Ke, {
                          size: 'small',
                          style: { marginTop: 'auto', alignSelf: 'flex-start' },
                          onClick: () =>
                            kt.success(
                              `\u5DF2\u9009\u4E2D\u300C${n.name}\u300D\u5E76\u751F\u6210\u5F85\u51B3\u7B56\u4E8B\u9879\uFF08\u6A21\u62DF\uFF09`,
                            ),
                          children: '\u9009\u6B64\u65B9\u5411',
                        }),
                      ],
                    },
                    n.id,
                  ),
                ),
              }),
              c.jsxs('div', {
                className: 'ap-notice',
                'data-kind': 'warn',
                style: { marginTop: 16 },
                children: [
                  c.jsx(og, {}),
                  c.jsx('span', {
                    children:
                      '\u4E24\u7C7B\u65B9\u5411\u90FD\u9700\u8981\u4EBA\u5DE5\u5224\u65AD\uFF0C\u7CFB\u7EDF\u4E0D\u7ED9\u51FA\u503E\u5411\u6027\u5EFA\u8BAE\u3002\u9009\u5B9A\u540E\u4ECD\u9700\u5728\u4EA7\u9500\u534F\u540C\u73AF\u8282\u786E\u8BA4\uFF0C\u5E76\u56DE\u586B\u539F\u56E0\u7801\u3002',
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
      c.jsxs('section', {
        className: 'ap-board-card',
        children: [
          c.jsxs('div', {
            className: 'ap-card-head',
            children: [
              c.jsx('h3', { children: '\u627F\u63A5\u4E0E\u5339\u914D\u89C4\u5219' }),
              c.jsx('span', {
                style: { fontSize: 11.5, color: 'var(--ap-ink-3)' },
                children:
                  '\u89C4\u5219\u53EF\u540E\u7EED\u7075\u6D3B\u8C03\u6574\uFF0C\u5148\u8DD1\u901A\u518D\u8FED\u4EE3',
              }),
            ],
          }),
          c.jsx('div', {
            className: 'ap-card-body',
            children: c.jsx('dl', {
              className: 'ap-kv',
              children: IV.map((n) =>
                c.jsxs(
                  f.Fragment,
                  { children: [c.jsx('dt', { children: n.k }), c.jsx('dd', { children: n.v })] },
                  n.k,
                ),
              ),
            }),
          }),
        ],
      }),
    ],
  });
}
function gH() {
  useMpsPart(
    y,
    'constraints',
    { constraints: I1, notice: '约束由品类计划维护，模拟展示' },
    pV['constraints'] ?? vV['constraints'],
  );
  return c.jsxs(c.Fragment, {
    children: [
      c.jsxs('div', {
        className: 'ap-notice',
        'data-kind': 'info',
        style: { marginBottom: 16 },
        children: [
          c.jsx(If, {}),
          c.jsxs('span', {
            children: [
              '\u6240\u6709\u7EA6\u675F\u5747\u7531 ',
              c.jsx('b', { children: '\u54C1\u7C7B\u8BA1\u5212' }),
              ' \u7EF4\u62A4\uFF0C\u4E0D\u8BBE\u5BA1\u6279\u963B\u65AD\uFF1B\u4EC5\u5F53\u7EA6\u675F\u663E\u8457\u6539\u53D8\u8DE8\u57FA\u5730\u8D44\u6E90\u5206\u914D\u65F6\u505A\u63D0\u9192\u4E0E\u7559\u75D5\u3002',
            ],
          }),
        ],
      }),
      c.jsxs('section', {
        className: 'ap-board-card',
        children: [
          c.jsxs('div', {
            className: 'ap-card-head',
            children: [
              c.jsxs('h3', {
                children: [
                  '\u7EA6\u675F\u5217\u8868',
                  c.jsxs(ut, {
                    size: 'small',
                    bordered: true,
                    children: [I1.length, ' \u6761\u751F\u6548\u4E2D'],
                  }),
                ],
              }),
              c.jsxs('div', {
                style: { display: 'flex', gap: 8, alignItems: 'center' },
                children: [
                  c.jsx(Qm, { size: 'small', defaultChecked: true }),
                  c.jsx('span', {
                    style: { fontSize: 12, color: 'var(--ap-ink-2)' },
                    children: '\u4EC5\u770B\u786C\u7EA6\u675F',
                  }),
                  c.jsx(Ke, {
                    size: 'small',
                    type: 'primary',
                    onClick: () =>
                      kt.info('\u5DF2\u6253\u5F00\u65B0\u589E\u7EA6\u675F\uFF08\u6A21\u62DF\uFF09'),
                    children: '\u65B0\u589E\u7EA6\u675F',
                  }),
                ],
              }),
            ],
          }),
          c.jsx('div', {
            className: 'ap-card-body flush',
            style: { overflowX: 'auto' },
            children: c.jsxs('table', {
              className: 'ap-table',
              children: [
                c.jsx('thead', {
                  children: c.jsxs('tr', {
                    children: [
                      c.jsx('th', { children: '\u7C7B\u522B' }),
                      c.jsx('th', { children: '\u7EA6\u675F\u5185\u5BB9' }),
                      c.jsx('th', { children: '\u4F5C\u7528\u5BF9\u8C61' }),
                      c.jsx('th', { children: '\u5F3A\u5EA6' }),
                      c.jsx('th', { children: '\u6765\u6E90' }),
                      c.jsx('th', { children: '\u751F\u6548\u81F3' }),
                    ],
                  }),
                }),
                c.jsx('tbody', {
                  children: I1.map((e) =>
                    c.jsxs(
                      'tr',
                      {
                        children: [
                          c.jsx('td', {
                            className: 'ap-left',
                            children: c.jsx(ut, { size: 'small', bordered: true, children: e.cat }),
                          }),
                          c.jsx('td', {
                            className: 'ap-left',
                            style: { fontWeight: 500 },
                            children: e.content,
                          }),
                          c.jsx('td', { className: 'ap-left ap-muted', children: e.target }),
                          c.jsx('td', {
                            children: c.jsxs(ut, {
                              color: e.strength === '\u786C' ? 'red' : 'gray',
                              size: 'small',
                              bordered: true,
                              children: [e.strength, '\u7EA6\u675F'],
                            }),
                          }),
                          c.jsx('td', { className: 'ap-left ap-muted', children: e.source }),
                          c.jsx('td', { children: e.until }),
                        ],
                      },
                      e.content,
                    ),
                  ),
                }),
              ],
            }),
          }),
        ],
      }),
      c.jsxs('section', {
        className: 'ap-board-card',
        style: { borderLeft: '3px solid var(--red-6)' },
        children: [
          c.jsxs('div', {
            className: 'ap-card-head',
            children: [
              c.jsxs('h3', {
                children: [
                  '\u51B2\u7A81\u4E0E\u653E\u5BBD\u5EFA\u8BAE',
                  c.jsx(ut, {
                    color: 'red',
                    size: 'small',
                    bordered: true,
                    children: '\u786C\u7EA6\u675F\u4E0D\u53EF\u884C',
                  }),
                ],
              }),
              c.jsx('span', {
                style: { fontSize: 11.5, color: 'var(--ap-ink-3)' },
                children:
                  '\u7981\u6B62\u9759\u9ED8\u653E\u5F00\uFF1A\u51FA\u51B2\u7A81\u6E05\u5355 + \u653E\u5BBD\u5EFA\u8BAE + \u63D0\u8BF7\u51B3\u7B56\uFF0C\u4ECD\u4E0D\u53EF\u884C\u5219\u5982\u5B9E\u51FA\u7F3A\u53E3',
              }),
            ],
          }),
          c.jsxs('div', {
            className: 'ap-card-body',
            children: [
              c.jsx('div', {
                style: { fontSize: 13.4, fontWeight: 650, marginBottom: 8 },
                children: Kd.title,
              }),
              c.jsx('p', {
                className: 'ap-lead',
                style: { marginBottom: 14 },
                children: Kd.detail,
              }),
              c.jsx('div', {
                style: { display: 'grid', gap: 10 },
                children: Kd.options.map((e) =>
                  c.jsxs(
                    'div',
                    {
                      style: {
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '11px 14px',
                        border: `1px solid ${e.rec ? 'var(--primary-4)' : 'var(--ap-line)'}`,
                        background: e.rec ? 'var(--primary-1)' : '#fff',
                        borderRadius: 10,
                      },
                      children: [
                        c.jsxs('div', {
                          style: { flex: 1, minWidth: 0 },
                          children: [
                            c.jsxs('div', {
                              style: { fontSize: 13, fontWeight: e.rec ? 650 : 500 },
                              children: [
                                e.k,
                                e.rec &&
                                  c.jsx(ut, {
                                    color: 'red',
                                    size: 'small',
                                    bordered: true,
                                    style: { marginLeft: 8 },
                                    children: '\u5EFA\u8BAE',
                                  }),
                              ],
                            }),
                            c.jsx('div', {
                              style: { fontSize: 12, color: 'var(--ap-ink-2)', marginTop: 3 },
                              children: e.v,
                            }),
                          ],
                        }),
                        c.jsx(Ke, {
                          size: 'small',
                          type: e.rec ? 'primary' : 'secondary',
                          onClick: () =>
                            kt.success(
                              `\u5DF2\u6309\u300C${e.k}\u300D\u63D0\u4EA4\u51B3\u7B56\uFF08\u6A21\u62DF\uFF09`,
                            ),
                          children: '\u9009\u6B64\u9879',
                        }),
                      ],
                    },
                    e.k,
                  ),
                ),
              }),
            ],
          }),
        ],
      }),
    ],
  });
}
const yH = [
  { label: '\u5168\u90E8\u57FA\u5730', value: '\u5168\u90E8' },
  ...Array.from(new Set(dl.map((e) => e.base))).map((e) => ({ label: e, value: e })),
];
function xH({ onNext: e }) {
  const [t, n] = usePageViewField(y, mpsView, 'shipBase', '\u5168\u90E8'),
    [r, a] = usePageViewField(
      y,
      mpsView,
      'shipRemaining',
      Object.fromEntries(dl.map((w) => [w.id, w.rest])),
      (value) =>
        Object.fromEntries(Object.entries(value).filter(([id]) => dl.some((row) => row.id === id))),
    ),
    i = y.useMemo(
      () =>
        dl.map((w) => {
          var x;
          const b = w.noData ? 0 : (x = r[w.id]) != null ? x : w.rest;
          return {
            ...w,
            restVal: b,
            est: w.noData ? null : w.shipped + b,
            monthEnd: w.noData ? null : w.stock + w.inbound + w.restProd - b,
            changed: !w.noData && b !== w.rest,
          };
        }),
      [r],
    ),
    o = y.useMemo(() => Array.from(new Set(dl.filter((w) => w.noData).map((w) => w.base))), []),
    l = t === '\u5168\u90E8' ? i : i.filter((w) => w.base === t),
    s = t === '\u5168\u90E8' ? o : o.filter((w) => w === t),
    u = i.filter((w) => !w.noData),
    d = u.reduce((w, b) => w + b.shipped, 0),
    v = u.reduce((w, b) => {
      var x;
      return w + ((x = b.est) != null ? x : 0);
    }, 0),
    p = u.reduce((w, b) => {
      var x;
      return w + ((x = b.monthEnd) != null ? x : 0);
    }, 0),
    h = u
      .filter((w) => w.base === '\u90D1\u5DDE')
      .reduce((w, b) => {
        var x;
        return w + ((x = b.monthEnd) != null ? x : 0);
      }, 0),
    m = i.some((w) => w.changed),
    g = v ? Math.round((d / v) * 100) : 0;
  useMpsPart(
    y,
    'ship',
    { base: t, rows: l, missingBases: s, shipped: d, estimatedShipment: v, monthEnd: p },
    pV['ship'] ?? vV['ship'],
  );
  return c.jsxs(c.Fragment, {
    children: [
      c.jsxs('div', {
        className: 'ap-notice',
        'data-kind': 'info',
        style: { marginBottom: 16 },
        children: [
          c.jsx(If, {}),
          c.jsxs('span', {
            children: [
              '\u672C\u6708\u7684',
              c.jsx('strong', { children: '\u5DF2\u53D1\u8D27' }),
              '\u53D6\u81EA BI \u5B9E\u9645\u3001',
              c.jsx('strong', { children: '\u5269\u4F59\u5929\u6570\u9884\u4F30' }),
              '\u6309\u63D0\u62A5\u53E3\u5F84\uFF0C\u4E24\u8005\u76F8\u52A0\u5F97\u5230\u6574\u6708\u9884\u4F30\u53D1\u8FD0\uFF1B \u63A8\u7B97\u51FA\u7684',
              c.jsxs('strong', {
                children: [
                  '\u6708\u672B\u5E93\u5B58\u76F4\u63A5\u4F5C\u4E3A ',
                  ar.planMonth,
                  ' \u8BA1\u5212\u7684\u671F\u521D\u5E93\u5B58',
                ],
              }),
              '\uFF0C\u4E0D\u518D\u624B\u5DE5\u63A8\u7B97\u3002',
            ],
          }),
        ],
      }),
      c.jsxs('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          marginBottom: 16,
        },
        children: [
          c.jsxs('span', {
            className: 'ap-pill',
            children: ['\u672C\u6708 ', c.jsx('b', { children: ar.curMonth })],
          }),
          c.jsxs('span', {
            className: 'ap-pill',
            children: ['\u8BC4\u4F30\u8BA1\u5212\u6708 ', c.jsx('b', { children: ar.planMonth })],
          }),
          c.jsxs('span', {
            className: 'ap-pill',
            children: ['\u6570\u636E\u622A\u6B62 ', c.jsx('b', { children: ar.cutOff })],
          }),
          c.jsxs('span', {
            className: 'ap-pill',
            children: [
              '\u5269\u4F59\u53D1\u8FD0\u5929\u6570 ',
              c.jsxs('b', { children: [ar.restDays, ' \u5929'] }),
            ],
          }),
          c.jsxs('span', {
            className: 'ap-pill',
            children: ['\u672C\u6708\u5171 ', c.jsxs('b', { children: [ar.monthDays, ' \u5929'] })],
          }),
        ],
      }),
      c.jsx('div', {
        className: 'ap-grid-3',
        style: { marginBottom: 16 },
        children: [
          {
            k: `\u672C\u6708\u5DF2\u53D1\u8D27 \xB7 \u622A\u81F3 ${ar.cutOff}`,
            v: d,
            d: `\u5360\u6574\u6708\u9884\u4F30 ${g}%\uFF0C\u5269\u4F59 ${ar.restDays} \u5929\u4E3A\u9884\u4F30\u503C`,
          },
          {
            k: '\u672C\u6708\u9884\u4F30\u53D1\u8FD0\uFF08\u6574\u6708\uFF09',
            v,
            d: '\u5DF2\u53D1\u8D27 + \u5269\u4F59\u5929\u6570\u9884\u4F30\uFF08\u6309\u57FA\u5730 \xD7 \u5927\u7C7B\uFF09',
          },
          {
            k: '\u9884\u8BA1\u6708\u672B\u5E93\u5B58\u5408\u8BA1',
            v: p,
            d: `\u7ED3\u8F6C\u4E3A ${ar.planMonth} \u8BA1\u5212\u7684\u671F\u521D\u5E93\u5B58`,
          },
        ].map((w) =>
          c.jsx(
            'section',
            {
              className: 'ap-board-card',
              style: { marginBottom: 0 },
              children: c.jsxs('div', {
                className: 'ap-card-body',
                children: [
                  c.jsx('div', {
                    style: { fontSize: 12, color: 'var(--ap-ink-3)', marginBottom: 6 },
                    children: w.k,
                  }),
                  c.jsxs('div', {
                    style: { fontSize: 22, fontWeight: 650, letterSpacing: '-0.3px' },
                    children: [
                      w.v.toLocaleString(),
                      c.jsx('span', {
                        style: {
                          fontSize: 12.5,
                          fontWeight: 400,
                          color: 'var(--ap-ink-3)',
                          marginLeft: 6,
                        },
                        children: '\u5428',
                      }),
                    ],
                  }),
                  c.jsx('div', {
                    style: { marginTop: 8, fontSize: 12, color: 'var(--ap-ink-2)' },
                    children: w.d,
                  }),
                ],
              }),
            },
            w.k,
          ),
        ),
      }),
      c.jsxs('section', {
        className: 'ap-board-card',
        children: [
          c.jsxs('div', {
            className: 'ap-card-head',
            children: [
              c.jsxs('h3', {
                children: [
                  '\u672C\u6708\u9884\u4F30\u53D1\u8D27',
                  c.jsx(ut, {
                    size: 'small',
                    bordered: true,
                    children: '\u5355\u4F4D\uFF1A\u5428',
                  }),
                ],
              }),
              c.jsx('span', {
                style: { fontSize: 11.5, color: 'var(--ap-ink-3)' },
                children:
                  '\u5269\u4F59\u5929\u6570\u9884\u4F30\u53EF\u76F4\u63A5\u6539\uFF0C\u6574\u6708\u9884\u4F30\u4E0E\u6708\u672B\u5E93\u5B58\u5373\u65F6\u91CD\u7B97',
              }),
              c.jsx('span', { style: { flex: 1 } }),
              m &&
                c.jsx(Ke, {
                  size: 'small',
                  icon: c.jsx($O, {}),
                  onClick: () => a(Object.fromEntries(dl.map((w) => [w.id, w.rest]))),
                  children: '\u91CD\u7F6E\u4E3A\u63D0\u62A5\u503C',
                }),
              c.jsx(kn, {
                size: 'small',
                value: t,
                onChange: n,
                style: { width: 108 },
                options: yH,
              }),
            ],
          }),
          c.jsx('div', {
            className: 'ap-card-body flush',
            style: { overflowX: 'auto' },
            children: c.jsxs('table', {
              className: 'ap-table',
              children: [
                c.jsx('thead', {
                  children: c.jsxs('tr', {
                    children: [
                      c.jsx('th', { children: '\u57FA\u5730' }),
                      c.jsx('th', { children: '\u5927\u7C7B' }),
                      c.jsx('th', { children: '\u672C\u6708\u5DF2\u53D1\u8D27' }),
                      c.jsx('th', { children: '\u5269\u4F59\u5929\u6570\u9884\u4F30' }),
                      c.jsx('th', { children: '\u672C\u6708\u9884\u4F30\u53D1\u8FD0' }),
                      c.jsx('th', { children: '\u73B0\u5E93\u5B58' }),
                      c.jsx('th', { children: '\u8C03\u62E8\u5165\u5E93' }),
                      c.jsx('th', { children: '\u672C\u6708\u5269\u4F59\u6392\u4EA7' }),
                      c.jsx('th', { children: '\u9884\u8BA1\u6708\u672B\u5E93\u5B58' }),
                    ],
                  }),
                }),
                c.jsxs('tbody', {
                  children: [
                    l
                      .filter((w) => !w.noData)
                      .map((w) => {
                        var b, x;
                        return c.jsxs(
                          'tr',
                          {
                            children: [
                              c.jsx('td', {
                                className: 'ap-left',
                                style: { fontWeight: 500 },
                                children: w.base,
                              }),
                              c.jsx('td', { className: 'ap-left ap-muted', children: w.cat }),
                              c.jsx('td', {
                                className: 'ap-num ap-muted',
                                children: w.shipped.toLocaleString(),
                              }),
                              c.jsx('td', {
                                children: c.jsxs('span', {
                                  style: { display: 'inline-flex', gap: 6, alignItems: 'center' },
                                  children: [
                                    c.jsx(hi, {
                                      size: 'small',
                                      min: 0,
                                      value: w.restVal,
                                      style: { width: 92 },
                                      onChange: (C) => a((_) => ({ ..._, [w.id]: Number(C) || 0 })),
                                    }),
                                    w.changed &&
                                      c.jsx(ut, {
                                        size: 'small',
                                        color: 'orange',
                                        bordered: true,
                                        children: '\u5DF2\u8C03\u6574',
                                      }),
                                  ],
                                }),
                              }),
                              c.jsx('td', {
                                className: 'ap-num',
                                style: { fontWeight: 650 },
                                children: ((b = w.est) != null ? b : 0).toLocaleString(),
                              }),
                              c.jsx('td', {
                                className: 'ap-num ap-muted',
                                children: w.stock.toLocaleString(),
                              }),
                              c.jsx('td', {
                                className: 'ap-num ap-muted',
                                children: w.inbound === 0 ? '\u2014' : `+${w.inbound}`,
                              }),
                              c.jsx('td', {
                                className: 'ap-num ap-muted',
                                children: w.restProd.toLocaleString(),
                              }),
                              c.jsx('td', {
                                className: 'ap-num',
                                style: { fontWeight: 650, color: 'var(--primary-7)' },
                                children: ((x = w.monthEnd) != null ? x : 0).toLocaleString(),
                              }),
                            ],
                          },
                          w.id,
                        );
                      }),
                    s.map((w) =>
                      c.jsxs(
                        'tr',
                        {
                          children: [
                            c.jsx('td', {
                              className: 'ap-left',
                              style: { fontWeight: 500 },
                              children: w,
                            }),
                            c.jsxs('td', {
                              className: 'ap-left ap-muted',
                              colSpan: 8,
                              children: [
                                '\u793A\u4F8B\u6570\u636E\u91CC',
                                c.jsx('b', {
                                  children:
                                    '\u53EA\u6709\u4EA7\u7EBF\u6570\u636E\u3001\u6CA1\u6709\u53D1\u8FD0\u4E0E\u9884\u6D4B\u8BB0\u5F55',
                                }),
                                '\uFF0C\u672C\u6B21\u4E0D\u7EB3\u5165\u63A8\u7B97 \u2014\u2014 \u5DF2\u4F5C\u4E3A\u6570\u636E\u7F3A\u53E3\u5217\u5165\u5F85\u786E\u8BA4',
                              ],
                            }),
                          ],
                        },
                        w,
                      ),
                    ),
                  ],
                }),
              ],
            }),
          }),
          c.jsxs('div', {
            className: 'ap-card-body',
            style: { borderTop: '1px solid var(--ap-line)', paddingTop: 12 },
            children: [
              c.jsxs('div', {
                style: { fontSize: 12.6, color: 'var(--ap-ink-2)', lineHeight: 1.75 },
                children: [
                  c.jsx('b', { children: '\u9884\u8BA1\u6708\u672B\u5E93\u5B58' }),
                  ' = \u73B0\u5E93\u5B58 + \u8C03\u62E8\u5165\u5E93\uFF08\u542B\u5728\u9014\uFF09+ \u672C\u6708\u5269\u4F59\u6392\u4EA7 \u2212 \u5269\u4F59\u5929\u6570\u9884\u4F30\uFF1B \u5176\u4E2D',
                  c.jsx('b', { children: '\u5269\u4F59\u5929\u6570\u9884\u4F30' }),
                  ' = \u672C\u6708\u9884\u4F30\u53D1\u8FD0 \u2212 \u672C\u6708\u5DF2\u53D1\u8D27\u3002',
                  c.jsx('br', {}),
                  '\u90D1\u5DDE 4 \u5927\u7C7B\u6708\u672B\u5E93\u5B58\u5408\u8BA1 ',
                  c.jsxs('b', { children: [h.toLocaleString(), ' \u5428'] }),
                  '\uFF0C\u5373 ',
                  ar.planMonth,
                  ' \u8BA1\u5212\u7684\u671F\u521D\u5E93\u5B58\uFF0C \u4E0E\u300C\u6708\u5EA6\u8BA1\u5212\u7F16\u5236\u300D\u91CC\u7684\u671F\u521D\u5E93\u5B58\u9010\u5927\u7C7B\u4E00\u81F4\u3002',
                ],
              }),
              c.jsxs('div', {
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  flexWrap: 'wrap',
                  marginTop: 12,
                },
                children: [
                  c.jsx('span', {
                    style: { fontSize: 12.6, color: 'var(--ap-ink-2)' },
                    children:
                      '\u786E\u8BA4\u540E\u53EF\u76F4\u63A5\u5E26\u8FDB\u4E0B\u6708\u8BA1\u5212\uFF0C\u4E0D\u9700\u8981\u518D\u7EBF\u4E0B\u63A8\u4E00\u904D\u671F\u521D\u5E93\u5B58\u3002',
                  }),
                  c.jsx('span', { style: { flex: 1 } }),
                  c.jsx(Ke, {
                    size: 'small',
                    icon: c.jsx(DO, {}),
                    onClick: () =>
                      kt.info(
                        '\u5DF2\u5BFC\u51FA\u672C\u6708\u53D1\u8FD0\u660E\u7EC6\uFF08\u6A21\u62DF\uFF09',
                      ),
                    children: '\u5BFC\u51FA\u660E\u7EC6',
                  }),
                  c.jsx(Ke, {
                    size: 'small',
                    type: 'primary',
                    onClick: () => {
                      void (kt.success(
                        `\u5DF2\u7ED3\u8F6C ${ar.planMonth} \u671F\u521D\u5E93\u5B58\uFF08\u6A21\u62DF\uFF09`,
                      ),
                      e == null || e());
                    },
                    children: '\u7ED3\u8F6C\u81F3\u6708\u5EA6\u8BA1\u5212\u7F16\u5236',
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}
const bH = eh.map((e) => e.key);
function A1() {
  const e = window.location.hash.replace(/^#\/?/, '').split('/')[0];
  return bH.includes(e) ? e : 'check';
}
function CH() {
  var m;
  const [e, t] = usePageViewField(
      y,
      mpsView,
      'tab',
      A1,
      (value) => value,
      (value) => (bH.includes(value) ? value : 'check'),
    ),
    [n, r] = usePageViewField(y, mpsView, 'avatar', AV),
    [a, i] = usePageViewField(y, mpsView, 'voice', zV),
    [o, l] = usePageViewField(y, mpsView, 'persona', LV),
    [s, u] = usePageViewField(y, mpsView, 'studioOpen', false),
    [draft, setDraft] = usePageViewField(y, mpsView, 'assistantDraft', ''),
    actions = useAuthorQuote(y);
  f.useEffect(() => {
    const g = () => t(A1());
    return (
      window.addEventListener('hashchange', g), () => window.removeEventListener('hashchange', g)
    );
  }, []);
  const h = (g) => {
    void (t(g), window.location.hash !== `#${g}` && (window.location.hash = g));
  };
  useMpsNavigation(
    y,
    { tab: e, title: pV[e] ?? vV[e], description: hV[e], tabs: eh, version: No },
    h,
  );
  return c.jsxs('div', {
    className: 'ap-app',
    children: [
      c.jsxs('main', {
        className: 'ap-board',
        children: [
          c.jsxs('div', {
            className: 'ap-board-head',
            children: [
              c.jsxs('div', {
                className: 'ap-page-tabs',
                children: [
                  c.jsxs('div', {
                    className: 'ap-brando',
                    children: [
                      c.jsx('span', { className: 'ap-brando-mark', children: '\u5FF5' }),
                      c.jsx('span', {
                        className: 'ap-brando-name',
                        children: '\u8BA1\u5212\u534F\u540C\u5E73\u53F0',
                      }),
                    ],
                  }),
                  eh.map((g, w) => {
                    const b = eh.findIndex((x) => x.key === e);
                    return c.jsx(
                      Ke,
                      {
                        className: 'ap-page-tab',
                        'data-active': e === g.key,
                        'data-done': w < b,
                        title: g.hint,
                        onClick: () => h(g.key),
                        children: c.jsxs('span', {
                          className: 'ap-page-tab-inner',
                          children: [
                            c.jsx('span', {
                              className: 'ap-page-tab-step',
                              style: {
                                background: e === g.key ? '#C8352F' : w < b ? '#1B8A56' : '#EFF1F5',
                                color: e === g.key || w < b ? '#FFFFFF' : '#878F9D',
                                boxShadow: e === g.key ? '0 0 0 3px rgba(200,53,47,0.15)' : void 0,
                              },
                              children: g.step,
                            }),
                            g.label,
                          ],
                        }),
                      },
                      g.key,
                    );
                  }),
                ],
              }),
              c.jsxs('div', {
                className: 'ap-title-row',
                children: [
                  c.jsx('h1', {
                    className: 'ap-board-title',
                    children: (m = pV[e]) != null ? m : vV[e],
                  }),
                  c.jsxs('div', {
                    className: 'ap-version-switch',
                    children: [
                      c.jsxs('span', {
                        className: 'ap-pill',
                        children: [
                          '\u8BC4\u4F30\u7248\u672C',
                          ' ',
                          c.jsxs('b', { children: [No.name, ' \xB7 ', No.no] }),
                        ],
                      }),
                      c.jsx(Ke, {
                        size: 'small',
                        icon: c.jsx(RO, {}),
                        onClick: () =>
                          kt.success(
                            '\u5DF2\u65B0\u5EFA\u8BC4\u4F30\u7248\u672C\uFF08\u6A21\u62DF\uFF09',
                          ),
                        children: '\u65B0\u5EFA\u8BC4\u4F30\u7248\u672C',
                      }),
                    ],
                  }),
                ],
              }),
              c.jsx('p', { className: 'ap-board-sub', children: hV[e] }),
              c.jsxs('div', {
                className: 'ap-board-actions',
                children: [
                  c.jsx(Ke, {
                    size: 'small',
                    onClick: () => u(true),
                    children: 'Studio / 人物设置',
                  }),
                  c.jsx('span', { style: { flex: 1 } }),
                  e !== 'masterdata' &&
                    c.jsx(Ke, {
                      size: 'small',
                      onClick: () =>
                        kt.success('\u8C03\u6574\u5DF2\u4FDD\u5B58\uFF08\u6A21\u62DF\uFF09'),
                      children: '\u4FDD\u5B58\u8C03\u6574',
                    }),
                  ['plans', 'capacity', 'gap'].includes(e) &&
                    c.jsx(Ke, {
                      size: 'small',
                      type: 'primary',
                      onClick: () =>
                        kt.success('\u5DF2\u63D0\u4EA4\u786E\u8BA4\uFF08\u6A21\u62DF\uFF09'),
                      children: '\u63D0\u4EA4\u786E\u8BA4',
                    }),
                ],
              }),
            ],
          }),
          c.jsxs('div', {
            className: 'ap-board-body',
            children: [
              c.jsx(AuthorQuestions, {
                react: y,
                jsx: c,
                Button: Ke,
                questions: cu.map((item) => ({ label: item.chip, text: item.question })),
                draft,
                onClearDraft: () => setDraft(''),
                actions,
              }),
              e === 'check' && c.jsx(lH, { onNext: () => h('process') }),
              e === 'process' && c.jsx(uH, {}),
              e === 'masterdata' && c.jsx(dH, {}),
              e === 'constraints' && c.jsx(gH, {}),
              e === 'ship' && c.jsx(xH, { onNext: () => h('plans') }),
              e === 'plans' && c.jsx(pH, {}),
              e === 'capacity' && c.jsx(hH, {}),
              e === 'gap' && c.jsx(mH, {}),
            ],
          }),
        ],
      }),
      c.jsx(Zm, {
        width: 'min(760px, calc(100vw - 32px))',
        title: 'AI \u52A9\u624B\u8BBE\u7F6E',
        visible: s,
        onCancel: () => u(false),
        footer: null,
        children: c.jsx(iH, { cfg: n, voice: a, persona: o, onCfg: r, onVoice: i, onPersona: l }),
      }),
    ],
  });
}
XC(document.getElementById('root')).render(c.jsx(f.StrictMode, { children: c.jsx(CH, {}) }));
