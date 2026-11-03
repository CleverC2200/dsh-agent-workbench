import styles from './drill-branch-loading.module.css';

export function DrillBranchLoading({
  label,
  depth,
  metricCount,
  periodMetric,
  hasRows = false,
}: {
  label: string;
  depth: number;
  metricCount: number;
  periodMetric: boolean;
  hasRows?: boolean;
}) {
  const columns = periodMetric ? 11 : metricCount + 4;
  if (hasRows) return null;
  return (
    <div className={styles.branch} role="status" aria-live="polite" aria-label={label}>
      <div className={styles.caption} style={{ paddingInlineStart: 28 + depth * 16 }}>
        <i aria-hidden="true" data-loading-dot />
        {label}
      </div>
      <div aria-hidden="true">
        {[0, 1, 2].map((row) => (
          <div
            key={row}
            className={`category-drill-row ${periodMetric ? 'period-metric' : ''} ${styles.row}`}
          >
            {Array.from({ length: columns }, (_, column) => (
              <span
                key={column}
                className={styles.cell}
                style={column === 0 ? { paddingInlineStart: 14 + depth * 16 } : undefined}
              >
                <i
                  data-skeleton-bar
                  className={styles.bar}
                  style={{
                    width: column === 0 ? [104, 88, 116][row] : [44, 56, 36][(row + column) % 3],
                  }}
                />
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
