import { useEffect, useRef, useState } from 'react';
import config from '../../../../sql.config.json';
import { readConfiguredHistory } from '../../../../../shared/configured-history';
import { TrendChart } from '../dsh-ui/chart';
import { Button } from '../dsh-ui/controls';
import { ownContextPart } from '../native/context';
import styles from './qll/components/full-chain-workbench.module.css';
export function ConfiguredTrends({ date }: { date: string }) {
  const [data, setData] = useState<any[] | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const request = useRef<AbortController>();
  useEffect(() => {
    request.current?.abort();
    setData(null);
    setError('');
    setBusy(false);
    return () => request.current?.abort();
  }, [date]);
  useEffect(
    () =>
      ownContextPart('trendView', {
        state: busy ? 'loading' : error ? 'error' : data ? 'ready' : 'idle',
        date,
        data,
        unit: '箱',
        scope: '基地本月历史库存；分仓、客户、订单和平均货龄趋势未接入',
      }),
    [date, data, busy, error],
  );
  const load = async () => {
    request.current?.abort();
    const task = new AbortController();
    request.current = task;
    setData(null);
    setError('');
    setBusy(true);
    try {
      const result = await readConfiguredHistory(config, date, { signal: task.signal });
      if (!task.signal.aborted) setData(result);
    } catch (e) {
      if (!task.signal.aborted) setError((e as Error).message);
    } finally {
      if (request.current === task) setBusy(false);
    }
  };
  return (
    <section className={styles.chartBlock} aria-label="全链库存趋势与缺口">
      <div className={styles.chartHeader}>
        <strong>趋势与缺口</strong>
        <label>
          指标{' '}
          <select aria-label="趋势指标">
            <option value="inventory">库存趋势</option>
            <option value="orders" disabled>
              订单缺口趋势
            </option>
            <option value="aging" disabled>
              货龄趋势
            </option>
          </select>
        </label>
        <Button disabled={busy} onClick={() => void load()}>
          查询趋势
        </Button>
        {busy && (
          <Button
            onClick={() => {
              request.current?.abort();
              setBusy(false);
            }}
          >
            取消查询
          </Button>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      {data ? (
        <>
          <TrendChart
            data={data}
            series={[{ key: 'base', name: '基地库存/箱', color: 'var(--ui-accent)' }]}
          />
        </>
      ) : (
        <p role="status">{busy ? '趋势查询中…' : '选择当前范围后查询趋势。'}</p>
      )}
    </section>
  );
}
