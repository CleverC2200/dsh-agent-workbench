import styles from "./workbench-loading.module.css";
const SKELETON_TABLE_COLUMNS = [
  "base",
  "warning",
  "current",
  "target",
  "gap",
  "turnover",
  "age",
  "orders",
] as const;

const SKELETON_TABLE_ROWS = [
  "row-1",
  "row-2",
  "row-3",
  "row-4",
  "row-5",
] as const;

export function DashboardOverviewSkeleton({
  cards = 5,
  compact = false,
}: { cards?: number; compact?: boolean } = {}) {
  return (
    <section
      className={styles.dashboardSkeleton}
      role="status"
      aria-live="polite"
      aria-label="工作台加载中"
    >
      <div className={styles.loadingStatus}>
        <span className={styles.loadingDot} aria-hidden="true" />
        工作台加载中
      </div>
      <div
        className={`${styles.kpiGrid} ${cards === 8 ? styles.wideMetrics : ""} ${compact ? styles.compactMetrics : ""}`}
        aria-hidden="true"
      >
        {Array.from({ length: cards }, (_, key) => key).map((key) => (
          <article
            className={`${styles.kpiCard} ${styles.skeletonCard}`}
            key={key}
          >
            <div>
              <span
                className={`${styles.skeletonBlock} ${styles.skeletonLabel}`}
              />
              <span
                className={`${styles.skeletonBlock} ${styles.skeletonPill}`}
              />
            </div>
            <span
              className={`${styles.skeletonBlock} ${styles.skeletonValue}`}
            />
            <div className={styles.skeletonHelpers}>
              <span className={styles.skeletonBlock} />
              <span className={styles.skeletonBlock} />
            </div>
          </article>
        ))}
      </div>
      <div
        className={`${styles.summaryBox} ${styles.skeletonSummary}`}
        aria-hidden="true"
      >
        <span
          className={`${styles.skeletonBlock} ${styles.skeletonSummaryTitle}`}
        />
        <span className={styles.skeletonBlock} />
        <span
          className={`${styles.skeletonBlock} ${styles.skeletonSummaryLine}`}
        />
      </div>
    </section>
  );
}

export function DashboardTableSkeleton({ label }: { label: string }) {
  return (
    <div
      className={`${styles.tableCard} ${styles.tableSkeleton}`}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className={styles.loadingStatus}>
        <span className={styles.loadingDot} aria-hidden="true" />
        {label}
      </div>
      <table aria-hidden="true">
        <thead>
          <tr>
            {SKELETON_TABLE_COLUMNS.map((column) => (
              <th key={column}>
                <span
                  className={`${styles.skeletonBlock} ${styles.skeletonTableHeading}`}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SKELETON_TABLE_ROWS.map((row) => (
            <tr key={row}>
              {SKELETON_TABLE_COLUMNS.map((column, index) => (
                <td key={column}>
                  <span
                    className={`${styles.skeletonBlock} ${index === 0 ? styles.skeletonTablePrimary : styles.skeletonTableCell}`}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Shared safety-stock loading treatment; owns presentation only. */
export function WorkbenchLoading({
  title,
  cards = 5,
  compact = false,
  embedded = false,
}: {
  title?: string;
  cards?: number;
  compact?: boolean;
  embedded?: boolean;
}) {
  return (
    <section
      className={`${styles.workbench} ${embedded ? styles.embedded : ""}`}
      aria-busy="true"
    >
      {title && (
        <header className={styles.header}>
          <h2>{title}</h2>
        </header>
      )}
      <div className={styles.content}>
        <DashboardOverviewSkeleton cards={cards} compact={compact} />
        <DashboardTableSkeleton label="正在读取明细" />
      </div>
    </section>
  );
}
