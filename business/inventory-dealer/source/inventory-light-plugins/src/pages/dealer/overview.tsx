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
      data.sourceMode === 'direct'
        ? '库存总量取在仓和在途均有效的同批记录；下方在仓与在途分别取各自有效范围，不能直接相加校验。'
        : `在仓 ${n(data.totalInventory)} / 在途 ${n(data.totalTransitInventory)}`,
      'sku',
    ],
    ['库存价值', data.totalInventoryValue, '元 · 按日库存金额', 'sku'],
    ['近7日动销', data.sales7Coverage ? data.totalSales7 : null, '箱 · 保留当前库存范围', 'sku'],
    ['近30日动销', data.sales30Coverage ? data.totalSales30 : null, '箱 · 保留当前库存范围', 'sku'],
    [
      '平均覆盖',
      cover,
      data.sourceMode === 'direct'
        ? '同批有效库存 ÷ 同批日均动销；不使用其他范围的小计作分母。'
        : '天 · 按总览销量口径计算',
      'sku',
    ],
    ['客户数量', data.customerCount ?? data.customerSummaryTotal, '当前授权范围', 'customer'],
    ['门店数量', data.storeCount, '未接入时保持未知', 'customer'],
  ];
  const metricUnits: Record<string, string> = {
    库存总量: '箱',
    库存价值: '元',
    近7日动销: '箱',
    近30日动销: '箱',
    平均覆盖: '天',
  };
  const metricDetails: Record<string, Array<[string, string]>> = {
    库存健康分: [['数据状态', '待完善']],
    库存总量: [
      ['在仓库存', n(data.totalInventory)],
      ['在途库存', n(data.totalTransitInventory)],
    ],
    库存价值: [['统计范围', '日库存']],
    近7日动销: [['统计范围', '当前库存范围']],
    近30日动销: [['统计范围', '当前库存范围']],
    平均覆盖: [['计算依据', '总览销量口径']],
    客户数量: [['统计范围', '当前授权范围']],
    门店数量: [
      [
        '数据状态',
        typeof data.storeCount === 'number' && Number.isFinite(data.storeCount)
          ? '已提供'
          : '待完善',
      ],
    ],
  };
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
                <b
                  className={`${css.metricStatus} ${available ? css.metricCurrent : css.metricMissing}`}
                >
                  {available ? '当前值' : '待完善'}
                </b>
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
            查看对应库存明细
          </Button>
        }
      >
        <p>
          {String(metrics.find((r) => r[0] === detail)?.[2] ?? '')}。当前范围：{data.scopeLabel}
          ；库存日期：{data.inventoryDateLabel || data.snapshotDate || '未提供'}。
        </p>
        <dl className={css.metricDetails}>
          {(metricDetails[detail ?? ''] ?? []).map(([name, text]) => (
            <div key={name}>
              <dt>{name}</dt>
              <dd>{text}</dd>
            </div>
          ))}
        </dl>
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
