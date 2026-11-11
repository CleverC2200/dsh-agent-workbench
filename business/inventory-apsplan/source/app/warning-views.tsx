import { useState } from 'react';
import { ArrowRight, Check, ChevronDown, LayoutGrid, List } from 'lucide-react';
import './warning-views.css';

export type WarningEvent = {
  id: string;
  scope: string;
  metric: string;
  metricName?: string;
  value?: number;
  unit?: string;
  target?: string;
  level?: string;
  eventStatus?: string;
  pendingClose?: boolean;
  first?: string;
  closedAt?: string;
  gap?: string;
  period?: string;
  cutoff?: string;
  range?: string;
  evidence?: string;
};

const pageSize = 12;
const statusOptions = [
  ['all', '全部状态'],
  ['active', '异常中'],
  ['recovered', '已恢复待关闭'],
  ['closed', '已关闭（含历史恢复）'],
] as const;

function metricValue(item: WarningEvent) {
  if (!item.metricName || typeof item.value !== 'number' || !Number.isFinite(item.value)) {
    return item.metric;
  }
  const value = item.value.toLocaleString('zh-CN', {
    minimumFractionDigits: item.unit === '%' ? 2 : 0,
    maximumFractionDigits: 2,
  });
  return item.unit ? value + (item.unit === '%' ? '' : ' ') + item.unit : value;
}

function warningStatus(item: WarningEvent) {
  if (item.eventStatus === '已恢复' && item.pendingClose) return 'recovered';
  if (item.eventStatus === '已关闭' || item.eventStatus === '已恢复') return 'closed';
  return 'active';
}

function WarningBadge({ item }: { item: WarningEvent }) {
  const status = warningStatus(item);
  const recovered = status === 'recovered';
  const closed = status === 'closed';
  return (
    <span className="warning-view-badge" data-tone={closed ? 'neutral' : recovered ? 'healthy' : item.level === '严重' ? 'severe' : 'warning'}>
      {closed ? (item.eventStatus === '已恢复' ? '已恢复 · 历史' : '已关闭') : recovered ? '已恢复 · 待关闭' : `活跃 · ${item.level || '预警'}`}
    </span>
  );
}

type View = 'tiles' | 'list';

export function OperationsViewSwitch({ label, view, onChange }: { label: string; view: View; onChange: (view: View) => void }) {
  return (
    <div className="operations-layout-switch" role="group" aria-label={label}>
      <button type="button" aria-pressed={view === 'tiles'} onClick={() => onChange('tiles')}>
        <LayoutGrid aria-hidden="true" />平铺
      </button>
      <button type="button" aria-pressed={view === 'list'} onClick={() => onChange('list')}>
        <List aria-hidden="true" />列表
      </button>
    </div>
  );
}

export function WarningViews({ items, openCount, onDetail }: { items: WarningEvent[]; openCount: number; onDetail: (item: WarningEvent) => void }) {
  const [view, setView] = useState<'tiles' | 'list'>('tiles');
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState('active');
  const filteredItems = filter === 'all' ? items : items.filter(item => warningStatus(item) === filter);
  const pageCount = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleItems = filteredItems.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const detail = (item: WarningEvent) => (
    <button type="button" className="warning-view-detail" aria-haspopup="dialog"
      aria-label={`查看预警详情：${item.metricName || item.metric} · ${item.scope}`} onClick={() => onDetail(item)}>
      详情 <ArrowRight aria-hidden="true" />
    </button>
  );

  return (
    <div className="warning-views">
      <div className="warning-views-toolbar">
        <span aria-live="polite">{filter === 'all' ? `共 ${items.length} 条 · 未关闭 ${openCount} 条` : `筛选结果 ${filteredItems.length} 条 · 全部 ${items.length} 条`}</span>
        <div className="warning-views-controls">
          <span>状态</span>
          <details className="warning-status-filter"
            onBlur={event => {
              if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
            }}
            onKeyDown={event => {
              if (event.key !== 'Escape' || !event.currentTarget.open) return;
              event.stopPropagation();
              event.currentTarget.open = false;
              event.currentTarget.querySelector('summary')?.focus();
            }}>
            <summary aria-label={`预警状态：${statusOptions.find(([value]) => value === filter)?.[1]}`}>
              {statusOptions.find(([value]) => value === filter)?.[1]} <ChevronDown aria-hidden="true" />
            </summary>
            <div className="warning-status-options" role="group" aria-label="预警状态选项">
              {statusOptions.map(([value, label]) => (
                <button key={value} type="button" aria-pressed={filter === value} onClick={event => {
                  setFilter(value);
                  setPage(0);
                  const menu = event.currentTarget.closest('details');
                  if (menu) {
                    menu.open = false;
                    menu.querySelector('summary')?.focus();
                  }
                }}>
                  {label}{filter === value && <Check aria-hidden="true" />}
                </button>
              ))}
            </div>
          </details>
          <OperationsViewSwitch label="预警展示方式" view={view} onChange={setView} />
        </div>
      </div>
      {!filteredItems.length ? (
        <div className="warning-empty-state">
          <strong>{items.length ? '该状态下暂无预警' : '暂无预警记录'}</strong>
          <p>{items.length ? '切换状态可查看其他记录。' : '检测发现异常后将在此展示。'}</p>
        </div>
      ) : view === 'tiles' ? (
        <div className="warning-tiles" aria-label="预警卡片">
          {visibleItems.map((item) => (
            <article key={item.id} className="warning-tile"
              data-context-id={`intelligent-warning-${item.id}`} data-context-scope="事件预警"
              data-context-label={`${item.scope} · ${item.metric}`} data-context-summary={item.gap}>
              <div className="warning-tile-heading">
                <div><strong>{item.metricName || item.metric}</strong><small>{item.scope}</small></div>
                <WarningBadge item={item} />
              </div>
              <div className="warning-tile-value">{metricValue(item)}</div>
              <small>{item.target ? `目标 ${item.target}` : item.gap || '暂无目标值'}</small>
              {item.first && <small>首次触发 {item.first}</small>}
              <footer>{detail(item)}</footer>
            </article>
          ))}
        </div>
      ) : (
        <div className="warning-view-table-wrap" role="region" aria-label="预警列表" tabIndex={0}>
          <table className="warning-view-table">
            <thead><tr><th scope="col">指标 / 对象</th><th scope="col">当前值</th><th scope="col">预警状态</th><th scope="col">操作</th></tr></thead>
            <tbody>{visibleItems.map((item) => (
              <tr key={item.id}>
                <th scope="row">{item.metricName || item.metric}<small>{item.scope}{item.first ? ` · ${item.first}` : ''}</small></th>
                <td><strong>{metricValue(item)}</strong><small>{item.target ? `目标 ${item.target}` : item.gap || '—'}</small></td>
                <td><WarningBadge item={item} /></td>
                <td>{detail(item)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {filteredItems.length > 0 && (
        <nav className="warning-pagination" aria-label="预警分页">
          <span>每页 {pageSize} 条</span>
          <div>
            <button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>上一页</button>
            <span aria-live="polite">{currentPage + 1} / {pageCount}</span>
            <button type="button" disabled={currentPage === pageCount - 1} onClick={() => setPage(currentPage + 1)}>下一页</button>
          </div>
        </nav>
      )}
    </div>
  );
}
