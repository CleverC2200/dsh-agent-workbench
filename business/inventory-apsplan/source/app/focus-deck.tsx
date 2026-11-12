import * as React from 'react';
import { useState, type ReactNode } from 'react';

type Item = {
  id: string;
  scope: string;
  metric: string;
  level?: string;
  gap?: string;
  trigger?: string;
  period?: string;
  range?: string;
  trend?: string;
  first?: string;
  diagnosis?: string;
  eventStatus?: string;
  pendingClose?: boolean;
};
export function FocusDeck({
  items,
  kind,
  renderCard,
  status,
  listItems,
  onHistory,
}: {
  items: Item[];
  listItems?: Item[];
  onHistory?: (item: Item) => void;
  kind: 'warning' | 'action';
  renderCard: (item: any) => ReactNode;
  status?: (item: any) => string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [warningPage, setWarningPage] = useState(0);
  const index = Math.max(
    0,
    items.findIndex((item) => item.id === selectedId),
  );
  const selected = items[index];
  const title = kind === 'warning' ? '预警' : '行动建议';
  const rows = kind === 'warning' ? listItems || items : items;
  const warningPageSize = 10;
  const warningPageCount = Math.max(1, Math.ceil(rows.length / warningPageSize));
  const visibleWarningPage = Math.min(warningPage, warningPageCount - 1);
  const warningRows = rows.slice(
    visibleWarningPage * warningPageSize,
    (visibleWarningPage + 1) * warningPageSize,
  );
  return (
    <div className={`focus-deck focus-deck-${kind}`}>
      <section className={`focus-stage ${!selected ? 'is-empty' : ''}`} aria-label={`${title}卡片`}>
        {selected && (
          <div className="focus-navigation">
            <button
              aria-label={`上一条${title}`}
              disabled={!selected || index === 0}
              onClick={() => setSelectedId(items[index - 1].id)}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path
                  d="m14 6-6 6 6 6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <span>
              {title}卡片{' '}
              <b aria-live="polite">
                {selected ? index + 1 : 0} / {items.length}
              </b>
            </span>
            <button
              aria-label={`下一条${title}`}
              disabled={!selected || index === items.length - 1}
              onClick={() => setSelectedId(items[index + 1].id)}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path
                  d="m10 6 6 6-6 6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        )}
        <div
          className={`intelligent-action-list focus-card-stack ${items.length > 1 ? 'has-reserve' : ''} ${kind === 'warning' ? 'warning-insight-list' : 'action-focus-list'}`}
        >
          {selected ? (
            renderCard(selected)
          ) : (
            <div className="warning-empty-state">
              <strong>{kind === 'warning' ? '当前没有待处理预警' : '暂无行动建议'}</strong>
              <p>
                {kind === 'warning'
                  ? '检测发现异常后将在此展示，已关闭记录可在下方查看。'
                  : '生成行动建议后，可在这里查看分析和处置方案。'}
              </p>
            </div>
          )}
        </div>
      </section>
      <section className="focus-list" aria-label={`${title}列表`}>
        <header>
          <strong>{title}列表</strong>
          <span>
            共 {rows.length} 条{kind === 'warning' ? ' · 点击查看详情' : ' · 点击切换卡片'}
          </span>
        </header>
        {kind === 'warning' ? (
          <>
            <div
              className="warning-table-scroll"
              role="region"
              aria-label="预警清单，可横向滚动"
              tabIndex={0}
            >
              <table className="warning-summary-table">
                <thead>
                  <tr>
                    <th scope="col">异常对象</th>
                    <th scope="col">状态</th>
                    <th scope="col">当前指标</th>
                    <th scope="col">目标偏差</th>
                    <th scope="col">触发区间</th>
                    <th scope="col">变化趋势</th>
                    <th scope="col">首次触发</th>
                    <th scope="col">分析线索</th>
                  </tr>
                </thead>
                <tbody>
                  {warningRows.length ? (
                    warningRows.map((item) => (
                      <tr
                        key={item.id}
                        className={selected?.id === item.id ? 'selected' : ''}
                        onClick={(event) => {
                          if (!(event.target as HTMLElement).closest('details,button')) {
                            if (items.some((x) => x.id === item.id)) setSelectedId(item.id);
                            else onHistory?.(item);
                          }
                        }}
                      >
                        <th scope="row">
                          <div className="warning-object-cell">
                            <button
                              type="button"
                              className="warning-table-select"
                              aria-pressed={selected?.id === item.id}
                              onClick={() => {
                                if (items.some((x) => x.id === item.id)) setSelectedId(item.id);
                                else onHistory?.(item);
                              }}
                            >
                              {item.scope}
                            </button>
                            <span
                              className={`focus-row-status ${item.level === '严重' ? 'severe' : 'warning'}`}
                            >
                              {item.level || '预警'}
                            </span>
                          </div>
                        </th>
                        <td>
                          {item.eventStatus === '已关闭'
                            ? '已关闭'
                            : item.eventStatus === '已恢复'
                              ? item.pendingClose
                                ? '已恢复·待关闭'
                                : '已恢复'
                              : '展示中'}
                        </td>
                        <td>{item.metric}</td>
                        <td className="warning-table-gap">{item.gap || '—'}</td>
                        <td>{item.range || '—'}</td>
                        <td>{item.trend || '暂无对比'}</td>
                        <td>{item.first || '—'}</td>
                        <td>
                          {item.diagnosis && item.diagnosis.length > 38 ? (
                            <details className="warning-table-analysis">
                              <summary>{item.diagnosis.slice(0, 38)}…</summary>
                              <p>{item.diagnosis}</p>
                            </details>
                          ) : (
                            item.diagnosis || '暂无分析线索'
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="warning-table-empty">
                        暂无预警记录
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {rows.length > 0 && (
              <nav className="warning-pagination" aria-label="预警列表分页">
                <span>
                  共 {rows.length} 条 · 每页 {warningPageSize} 条
                </span>
                <div>
                  <button
                    type="button"
                    disabled={visibleWarningPage === 0}
                    onClick={() => setWarningPage(visibleWarningPage - 1)}
                  >
                    上一页
                  </button>
                  <span aria-live="polite">
                    {visibleWarningPage + 1} / {warningPageCount}
                  </span>
                  <button
                    type="button"
                    disabled={visibleWarningPage >= warningPageCount - 1}
                    onClick={() => setWarningPage(visibleWarningPage + 1)}
                  >
                    下一页
                  </button>
                </div>
              </nav>
            )}
          </>
        ) : (
          <div className="focus-list-rows">
            {items.length ? (
              items.map((item, rowIndex) => (
                <button
                  key={item.id}
                  className={`focus-list-row ${selected?.id === item.id ? 'selected' : ''}`}
                  aria-pressed={selected?.id === item.id}
                  onClick={() => setSelectedId(item.id)}
                >
                  <span className="focus-row-index">{String(rowIndex + 1).padStart(2, '0')}</span>
                  <span className="focus-row-content">
                    <strong>{item.scope}</strong>
                    <small>
                      {item.metric}
                      {kind === 'warning' && item.period ? ` · ${item.period}` : ''}
                    </small>
                  </span>
                  <span
                    className={`focus-row-status ${kind === 'warning' ? (item.level === '严重' ? 'severe' : 'warning') : ''}`}
                  >
                    {kind === 'warning' ? item.level || '预警' : status?.(item) || '待决策'}
                  </span>
                  <span className="focus-row-chevron" aria-hidden="true">
                    ›
                  </span>
                </button>
              ))
            ) : (
              <p className="focus-list-empty">
                {kind === 'warning' ? '暂无活跃预警记录' : '暂无行动建议记录'}
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
