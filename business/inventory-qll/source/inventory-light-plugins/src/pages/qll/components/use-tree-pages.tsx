import { ownContextPart } from '../../../native/context';
import { useEffect, useRef, useState } from 'react';
import { Alert, Button, DataPagination } from '../../../dsh-ui/controls';
import { DashboardTableSkeleton } from '../../../dsh-ui/workbench-loading';
import { appPath } from '../../../../../qll/src/lib/app-path';
import { workspaceViewKey } from '../../../../../qll/src/lib/workspace-stream';
export function useTreePages(workspace: any, kind: 'structure' | 'aging' | 'orders') {
  const [pages, setPages] = useState<Record<string, any>>({});
  const controllers = useRef(new Map<string, AbortController>());
  const releases = useRef(new Map<string, () => void>());
  const viewKey = workspaceViewKey(workspace);
  useEffect(() => {
    setPages({});
    return () => {
      controllers.current.forEach((c) => c.abort());
      controllers.current.clear();
      releases.current.forEach((release) => release());
      releases.current.clear();
    };
  }, [viewKey]);
  const filters = (row: any) =>
    kind !== 'structure'
      ? row.filters
      : row.key === `group:${row.layer}`
        ? {}
        : {
            ...(row.layer === 'base'
              ? { base: row.objectName }
              : row.layer === 'branch'
                ? { branch: row.objectName }
                : { customerId: row.objectId }),
            ...(row.category !== '全部品类' ? { category: row.category } : {}),
            ...(row.sku !== '全部SKU' ? { sku: row.sku } : {}),
          };
  const expandable = (row: any) => (kind === 'structure' ? row.sku === '全部SKU' : row.expandable);
  const load = async (row: any, pageNo = 1, pageSize = 10) => {
    if (!workspace || !expandable(row)) return;
    releases.current.get(row.key)?.();
    releases.current.delete(row.key);
    controllers.current.get(row.key)?.abort();
    const controller = new AbortController();
    controllers.current.set(row.key, controller);
    setPages((p) => ({ ...p, [row.key]: { ...p[row.key], loading: true, error: null } }));
    try {
      const response = await fetch(appPath('/api/workspace/details'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          workspaceId: workspace.workspaceId,
          kind,
          layer: row.layer,
          filters: filters(row),
          pageNo,
          pageSize,
        }),
        signal: controller.signal,
      });
      const value = await response.json();
      if (!response.ok || !Array.isArray(value.rows)) throw Error(value.error ?? '明细加载失败');
      controller.signal.throwIfAborted();
      releases.current.set(
        row.key,
        ownContextPart('detail', {
          state: 'ready',
          workspaceId: workspace.workspaceId,
          scope: workspace.scope,
          kind,
          layer: row.layer,
          filters: { ...workspace.filters, ...filters(row) },
          ...value,
          coverage: '当前授权范围的明细分页，不能据此重算全量汇总',
        }),
      );
      setPages((p) => ({ ...p, [row.key]: { ...value, loading: false } }));
    } catch (error) {
      if (!controller.signal.aborted)
        setPages((p) => ({
          ...p,
          [row.key]: {
            ...p[row.key],
            loading: false,
            error: error instanceof Error ? error.message : '明细加载失败',
            retry: { pageNo, pageSize },
          },
        }));
    } finally {
      if (controllers.current.get(row.key) === controller) controllers.current.delete(row.key);
    }
  };
  const retain = (visibleKeys: readonly (string | number)[]) => {
    const visible = new Set(visibleKeys);
    for (const [key, release] of releases.current)
      if (!visible.has(key)) {
        release();
        releases.current.delete(key);
      }
    for (const [key, controller] of controllers.current)
      if (!visible.has(key)) {
        controller.abort();
        controllers.current.delete(key);
      }
  };
  // A stored child expansion key is not visible when its ancestor is collapsed
  // or when its parent's current page no longer contains that child.
  const retainVisible = (roots: readonly any[], expanded: readonly (string | number)[]) => {
    const activeKeys: (string | number)[] = [],
      open = new Set(expanded);
    const visit = (row: any) => {
      if (!open.has(row.key)) return;
      activeKeys.push(row.key);
      row.children?.forEach(visit);
    };
    roots.forEach(visit);
    retain(activeKeys);
  };
  const activate = (row: any) => {
    const page = pages[row.key];
    if (!page?.rows || page.loading || page.error) {
      void load(row);
      return;
    }
    releases.current.get(row.key)?.();
    releases.current.set(
      row.key,
      ownContextPart('detail', {
        state: 'ready',
        workspaceId: workspace.workspaceId,
        scope: workspace.scope,
        kind,
        layer: row.layer,
        filters: { ...workspace.filters, ...filters(row) },
        ...page,
        coverage: '当前授权范围的明细分页，不能据此重算全量汇总',
      }),
    );
  };
  const attach = (row: any): any => ({
    ...row,
    children: expandable(row) ? (pages[row.key]?.rows ?? []).map(attach) : undefined,
  });
  const footer = (row: any) => {
    const page = pages[row.key];
    if (!page) return null;
    return (
      <div aria-busy={!!page.loading} onClick={(event) => event.stopPropagation()}>
        {page.loading && <DashboardTableSkeleton label="明细加载中" />}
        {page.error && (
          <Alert
            type="error"
            content={page.error}
            action={
              <Button
                onClick={() => void load(row, page.retry?.pageNo ?? 1, page.retry?.pageSize ?? 10)}
              >
                重试
              </Button>
            }
          />
        )}
        {page.total !== undefined && (
          <DataPagination
            ariaLabel={`${row.objectName ?? row.label}明细分页`}
            pageNumber={page.pageNo}
            pageSize={page.pageSize}
            totalCount={page.total}
            disabled={page.loading}
            onPageChange={(n: number) => void load(row, n, page.pageSize)}
            onPageSizeChange={(size: number) => void load(row, 1, size)}
          />
        )}
      </div>
    );
  };
  return {
    attach,
    footer,
    load,
    activate,
    retainVisible,
    has: (row: any) =>
      Boolean(pages[row.key]?.rows && !pages[row.key]?.loading && !pages[row.key]?.error),
    filters,
  };
}
