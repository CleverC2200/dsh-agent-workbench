import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { OperationsViewSwitch } from './warning-views';

type Suggestion = {
  id: string;
  scope: string;
  metric: string;
  action: string;
};

export function ActionSuggestionViews<T extends Suggestion>({
  items,
  status,
  renderCard,
}: {
  items: T[];
  status: (item: T) => string;
  renderCard: (item: T) => ReactNode;
}) {
  const [view, setView] = useState<'tiles' | 'list'>('tiles');
  const [selectedId, setSelectedId] = useState<string>();
  const detailRef = useRef<HTMLElement>(null);
  const selected = items.find((item) => item.id === selectedId);
  useEffect(() => {
    if (selectedId) detailRef.current?.focus();
  }, [selectedId]);

  const badge = (item: T) => (
    <span className="warning-view-badge" data-tone="neutral">
      {status(item)}
    </span>
  );
  const detail = (item: T) => (
    <button
      type="button"
      className="warning-view-detail"
      aria-label={`查看行动建议：${item.scope}`}
      aria-expanded={selected?.id === item.id}
      onClick={() => setSelectedId(selected?.id === item.id ? undefined : item.id)}
    >
      {selected?.id === item.id ? '收起' : '详情'} <ArrowRight aria-hidden="true" />
    </button>
  );

  return (
    <div className="warning-views">
      <div className="warning-views-toolbar">
        <span>共 {items.length} 条</span>
        <OperationsViewSwitch label="行动建议展示方式" view={view} onChange={setView} />
      </div>
      {!items.length ? (
        <div className="warning-empty-state">
          <strong>暂无行动建议</strong>
        </div>
      ) : view === 'tiles' ? (
        <div className="warning-tiles" aria-label="行动建议卡片">
          {items.map((item) => (
            <article key={item.id} className="warning-tile suggestion-tile">
              <div className="warning-tile-heading">
                <div>
                  <strong>{item.scope}</strong>
                  <small>{item.metric}</small>
                </div>
                {badge(item)}
              </div>
              <p className="suggestion-preview">{item.action}</p>
              <footer>{detail(item)}</footer>
            </article>
          ))}
        </div>
      ) : (
        <div
          className="warning-view-table-wrap"
          role="region"
          aria-label="行动建议列表"
          tabIndex={0}
        >
          <table className="warning-view-table suggestion-view-table">
            <thead>
              <tr>
                <th scope="col">对象 / 指标</th>
                <th scope="col">建议方案</th>
                <th scope="col">决策状态</th>
                <th scope="col">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <th scope="row">
                    {item.scope}
                    <small>{item.metric}</small>
                  </th>
                  <td>{item.action}</td>
                  <td>{badge(item)}</td>
                  <td>{detail(item)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selected && (
        <section
          ref={detailRef}
          tabIndex={-1}
          aria-label={`行动建议详情：${selected.scope}`}
          className="focus-deck suggestion-view-detail"
        >
          <div className="intelligent-action-list action-focus-list">{renderCard(selected)}</div>
        </section>
      )}
    </div>
  );
}
