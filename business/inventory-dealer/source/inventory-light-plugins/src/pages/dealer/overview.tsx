import { useState } from 'react';
import { Modal, Button, Table } from '../../dsh-ui/controls';
import css from './workbench.module.css';
const n = (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v)
    ? v.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
    : '-';
export function DealerOverview({
  data,
  onNavigate,
}: {
  data: any;
  onNavigate: (tab: string) => void;
}) {
  const [detail, setDetail] = useState<string | null>(null);
  const total =
    data.sourceMode === 'direct'
      ? (data.matchedTotalInventory ?? null)
      : data.totalInventory == null || data.totalTransitInventory == null
        ? null
        : data.totalInventory + data.totalTransitInventory;
  const cover =
    data.sourceMode === 'direct'
      ? (data.stockCoverDays ?? null)
      : total != null && data.forecastSales > 0
        ? Math.round(total / (data.forecastSales / 30))
        : null;
  const metrics = [
    ['库存健康分', null, '数据待完善', 'health'],
    [
      '库存总量',
      total,
      `在仓 ${n(data.totalInventory)} / 在途 ${n(data.totalTransitInventory)}`,
      'sku',
    ],
    [
      '库存价值',
      data.totalInventoryValue,
      `${data.inventoryValueUnit || '元'} · 按有效日库存金额`,
      'sku',
    ],
    [
      '近7日动销',
      data.sales7Coverage ? data.totalSales7 : null,
      `${data.salesQuantityUnit || '箱'} · 保留源数据范围`,
      'sku',
    ],
    [
      '近30日动销',
      data.sales30Coverage ? data.totalSales30 : null,
      `${data.salesQuantityUnit || '箱'} · 保留源数据范围`,
      'sku',
    ],
    ['平均覆盖', cover, '天 · 按总览销量口径计算', 'sku'],
    [
      '客户数量',
      data.customerCount ?? data.customerSummaryTotal,
      data.sourceMode === 'direct' ? '当前查询范围' : '当前授权范围',
      'customer',
    ],
    ['门店数量', data.storeCount, '未接入时保持未知', 'customer'],
  ];
  const metricUnits: Record<string, string> = {
    库存总量: '箱',
    库存价值: data.inventoryValueUnit || '元',
    近7日动销: data.salesQuantityUnit || '箱',
    近30日动销: data.salesQuantityUnit || '箱',
    平均覆盖: '天',
  };
  const unavailableSource = data.sourceLoading ? '正在读取' : '当前范围暂未取得数据';
  const metricDetails: Record<string, Array<[string, string]>> = {
    库存健康分: [['数据状态', '待完善']],
    库存总量: [
      ['在仓库存', data.sourceMode === 'direct' ? unavailableSource : n(data.totalInventory)],
      ['在途库存', n(data.totalTransitInventory)],
    ],
    库存价值: [['统计范围', data.sourceMode === 'direct' ? unavailableSource : '有值日库存']],
    近7日动销: [['统计范围', data.sourceMode === 'direct' ? unavailableSource : '源数据覆盖范围']],
    近30日动销: [['统计范围', data.sourceMode === 'direct' ? unavailableSource : '源数据覆盖范围']],
    平均覆盖: [['计算依据', data.sourceMode === 'direct' ? unavailableSource : '总览销量口径']],
    客户数量: [
      ['统计范围', data.sourceMode === 'direct' ? '当前客户目录 · 不回溯日期' : '当前授权范围'],
    ],
    门店数量:
      data.sourceMode === 'direct'
        ? [
            ['客户记录覆盖', `${n(data.storeCoverage)} / ${n(data.sourceRowCount)}`],
            ['统计口径', '客户门店数字段之和'],
          ]
        : [
            [
              '数据状态',
              typeof data.storeCount === 'number' && Number.isFinite(data.storeCount)
                ? '已提供'
                : '待完善',
            ],
          ],
  };
  if (data.sourceMode === 'direct' && data.stockSourceAvailable) {
    const scope = (count: unknown) => `${n(count)} / ${n(data.stockRowCount)} 行`;
    const boxes = (value: number | null) =>
      value == null ? '-' : `${Math.abs(value) >= 10000 ? `${n(value / 10000)}万` : n(value)}箱`;
    metricDetails['库存总量'] = [
      ['同批有效记录', `${n(data.inventoryTotalValidCount)}行`],
      ['在仓有效小计', boxes(data.totalInventory)],
      ['在途有效小计', boxes(data.totalTransitInventory)],
    ];
    metricDetails['库存价值'] = [['有效金额记录', scope(data.inventoryValueValidCount)]];
    metricDetails['近7日动销'] = [['有效动销记录', scope(data.sales7Coverage)]];
    metricDetails['近30日动销'] = [['有效动销记录', scope(data.sales30Coverage)]];
    metricDetails['平均覆盖'] = [
      ['计算依据', data.stockCoverDays == null ? '数量单位或有效需求不足' : '同批库存÷日均动销'],
      ['有效记录', scope(data.coverValidCount)],
      [
        '在仓支撑天数',
        data.onhandCoverDays == null ? '-' : Number(data.onhandCoverDays).toFixed(2) + '天',
      ],
      ['在仓计算范围', scope(data.onhandCoverValidCount)],
    ];
  }
  const health = [
    {
      title: '备货合理度',
      tab: 'sku',
      items: [
        ['合理备货 SKU', data.reasonableSkuCount],
        ['不合理备货 SKU', data.unreasonableSkuCount],
        ['目标备货', data.totalTargetInventory],
      ],
    },
    {
      title: '库存保障度',
      tab: 'shortage',
      items: [
        ['货够 SKU', data.coveredSkuCount],
        ['缺货 SKU', data.shortageSkuCount],
      ],
    },
    {
      title: '库存新鲜度',
      tab: 'expiry',
      items: [
        ['临期 SKU', data.nearExpirySkuCount],
        ['平均货龄（天）', data.averageAge],
      ],
    },
  ];
  return (
    <>
      <div className={css.metrics} aria-label="库存总览指标">
        {metrics.map(([label, value]) => {
          const title = String(label),
            available = typeof value === 'number' && Number.isFinite(value);
          return (
            <button
              className={css.metric}
              aria-haspopup="dialog"
              aria-expanded={detail === label}
              key={title}
              onClick={() => setDetail(title)}
            >
              <span className={css.metricTop}>
                <span>{label}</span>
                {data.sourceMode !== 'direct' && (
                  <b
                    className={`${css.metricStatus} ${available ? css.metricCurrent : css.metricMissing}`}
                  >
                    {available ? '当前值' : '待完善'}
                  </b>
                )}
              </span>
              <strong title={n(value)}>
                {available && Math.abs(value) >= 100000000
                  ? `${(value / 100000000).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}亿`
                  : available && Math.abs(value) >= 10000
                    ? `${(value / 10000).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}万`
                    : n(value)}
                {available && metricUnits[title] && (
                  <small className={css.metricUnit}>{metricUnits[title]}</small>
                )}
              </strong>
              <dl className={css.metricDetails}>
                {metricDetails[title].map(([name, text]) => (
                  <div key={name}>
                    <dt>{name}</dt>
                    <dd>{text}</dd>
                  </div>
                ))}
              </dl>
            </button>
          );
        })}
      </div>
      <div className={css.health} aria-label="库存健康度指标">
        {health.map((item) => (
          <button key={item.title} className={css.healthCard} onClick={() => onNavigate(item.tab)}>
            <h3>
              {item.title}
              <span>查看明细 ›</span>
            </h3>
            <dl>
              {item.items.map(([label, value]) => (
                <div key={String(label)}>
                  <dt>{label}</dt>
                  <dd>{n(value)}</dd>
                </div>
              ))}
            </dl>
          </button>
        ))}
      </div>
      <details className={css.coverage}>
        <summary>
          数据范围与口径 · 日库存覆盖 {n(data.inventoryDailyCustomerCount)}/
          {n(data.inventoryDailyExpectedCustomerCount)} 个客户
        </summary>
        <p>
          统计日期 {data.snapshotDate || '未提供'}；库存上传日期{' '}
          {data.inventoryDateLabel || '未提供'}
          ；计划月 {data.planMonth || '未提供'}
          。缺失指标显示横杠，不以零替代。库存健康分及未发布的统计项保持待完善。
          {data.sourceMode === 'direct' &&
            ' 客户数量按当前目录编码去重；门店数量是各客户门店数字段之和，未按门店ID跨客户去重，不随读取日期回溯。'}
          {data.stockSourceAvailable &&
            ` 库存、在途、金额和动销各自只汇总非负且有值记录；库存总量限在仓与在途同时有效的同一批记录，不代表全部客户库存。总记录 ${n(data.stockRowCount)} 行；库存总量使用 ${n(data.inventoryTotalValidCount)} 行；在仓小计使用 ${n(data.stockValidCount)} 行；在途小计使用 ${n(data.transitValidCount)} 行。负库存 ${n(data.negativeStockCount)} 行保留在明细核对，上传日期缺失 ${n(data.missingUploadCount)} 行。统计日之前的最近快照可能较旧，请结合上传日期使用。`}
        </p>
      </details>
      <Modal
        visible={!!detail}
        title={detail ?? ''}
        onCancel={() => setDetail(null)}
        footer={
          <Button
            onClick={() => {
              const item = metrics.find((r) => r[0] === detail);
              setDetail(null);
              onNavigate(item?.[3] === 'health' ? 'category' : String(item?.[3] ?? 'sku'));
            }}
          >
            {data.sourceMode === 'direct' && ['客户数量', '门店数量'].includes(detail ?? '')
              ? '查看客户目录 / 收货地址'
              : '查看对应库存明细'}
          </Button>
        }
      >
        <p>
          {String(metrics.find((r) => r[0] === detail)?.[2] ?? '')}。当前范围：
          {data.scopeLabel}；库存日期：
          {data.inventoryDateLabel || data.snapshotDate || '未提供'}。
        </p>
        <Table
          pagination={false}
          rowKey="label"
          columns={[
            { title: '指标', dataIndex: 'label' },
            { title: '当前值', dataIndex: 'value' },
          ]}
          data={metrics.map(([label, value]) => ({ label, value: n(value) }))}
        />
      </Modal>
    </>
  );
}
