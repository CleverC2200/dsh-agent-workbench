'use client';
import { QueryErrors } from '../../../../../../../shared/query-errors';
import { useEffect, useState } from 'react';
import type {
  BaseResource,
  WarehouseId,
  WarehouseSnapshot,
} from '../../../../../fc/src/lib/domain';
import type { ReplenishmentDetail } from '../../../../../fc/src/lib/replenishment-detail';
import { appPath } from '../../../../../fc/src/lib/app-path';
import { fetchWorkbenchSnapshot } from '../../../../../fc/src/lib/workbench-request';
import { BaseResourcesTable } from './base-resources-table';

type Input = {
  warehouseId: WarehouseId;
  sku: string;
  version: string;
  enabled: boolean;
  kind: ReplenishmentDetail['kind'];
  baseName?: string;
};
const quantity = (value: number | null | undefined) =>
  value == null ? '待核实' : value.toLocaleString('zh-CN', { maximumFractionDigits: 3 });
function useDetail(input: Input) {
  const [revision, setRevision] = useState(0);
  const key = JSON.stringify([input, revision]);
  const [state, setState] = useState<{ key: string; snapshot?: WarehouseSnapshot; error?: string }>(
    { key: '' },
  );
  useEffect(() => {
    if (!input.enabled) return;
    const controller = new AbortController();
    void fetchWorkbenchSnapshot(appPath('/api/replenishment-detail'), input.warehouseId, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        ...(revision ? { 'cache-control': 'no-cache' } : {}),
      },
      body: JSON.stringify({
        warehouseId: input.warehouseId,
        sku: input.sku,
        kind: input.kind,
        ...(input.baseName ? { baseName: input.baseName } : {}),
      }),
    })
      .then((snapshot) => {
        if (
          snapshot.replenishmentDetail?.sku !== input.sku ||
          snapshot.replenishmentDetail.kind !== input.kind ||
          (input.kind === 'batches' && snapshot.replenishmentDetail.baseName !== input.baseName)
        )
          throw new Error('明细范围不匹配，请重试');
        if (!controller.signal.aborted) setState({ key, snapshot });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setState({ key, error: error instanceof Error ? error.message : '明细读取失败' });
      });
    return () => controller.abort();
  }, [key]); // key includes every request field and the explicit retry revision.
  return { ...(state.key === key ? state : {}), retry: () => setRevision((value) => value + 1) };
}
function DetailState({
  enabled,
  error,
  retry,
}: {
  enabled: boolean;
  error?: string;
  retry: () => void;
}) {
  return !enabled ? (
    <p>当前演示或历史快照未保存该项明细。</p>
  ) : error ? (
    <div>
      <QueryErrors errors={[error]} scope="inventory-fc-replenishment" />
      <button className="secondary-button" onClick={retry}>
        重试读取明细
      </button>
    </div>
  ) : (
    <p role="status">正在读取商品明细…</p>
  );
}
export function ReplenishmentSkuResources({
  warehouseId,
  sku,
  version,
  enabled,
  onAvailableClick,
}: Omit<Input, 'kind' | 'baseName'> & { onAvailableClick: (base: BaseResource) => void }) {
  const { snapshot, error, retry } = useDetail({
    warehouseId,
    sku,
    version,
    enabled,
    kind: 'bases',
  });
  if (!snapshot) return <DetailState enabled={enabled} error={error} retry={retry} />;
  return (
    <BaseResourcesTable
      listOnly
      rows={snapshot.baseResources}
      dates={snapshot.baseResourceQuery?.dates ?? []}
      sku={sku}
      onAvailableClick={onAvailableClick}
    />
  );
}
export function ReplenishmentDetailContent(input: Input) {
  const { snapshot, error, retry } = useDetail(input);
  if (!snapshot) return <DetailState enabled={input.enabled} error={error} retry={retry} />;
  const detail = snapshot.replenishmentDetail!;
  return (
    <>
      <p>
        SKU {input.sku}
        {input.baseName ? ` · ${input.baseName}` : ''} · 数量单位：件
      </p>
      <p>
        库存汇总{detail.summaryDate ? `（${detail.summaryDate}）` : ''}：
        {quantity(detail.expectedQty)} · 批次合计：{quantity(detail.detailQty)}
        {detail.sourceDate ? ` · 数据时间：${detail.sourceDate}` : ''}
      </p>
      <QueryErrors
        errors={detail.notice ? [detail.notice] : []}
        scope="inventory-fc-replenishment"
      />
      <div className="table-scroll">
        <table className="data-table detail-quantity-table">
          <thead>
            <tr>
              {(input.kind === 'transfers'
                ? ['调拨订单编号', '订单状态', '需求量', '占用量', '发货量', '未发量', '已发未收量']
                : ['仓库', '在库量', '可用量', '生产日期', '货龄（天）']
              ).map((label) => (
                <th key={label}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {input.kind === 'transfers'
              ? detail.transfers?.map((row, index) => (
                  <tr key={`${row.orderNo}:${row.status}:${index}`}>
                    <td>{row.orderNo}</td>
                    <td>{row.status}</td>
                    <td>{quantity(row.demandQty)}</td>
                    <td>{quantity(row.allocatedQty)}</td>
                    <td>{quantity(row.shippedQty)}</td>
                    <td>{quantity(row.pendingQty)}</td>
                    <td>{quantity(row.inTransitQty)}</td>
                  </tr>
                ))
              : detail.batches?.map((row, index) => (
                  <tr key={`${row.warehouseName}:${row.productionDate}:${index}`}>
                    <td>{row.warehouseName}</td>
                    <td>{quantity(row.quantity)}</td>
                    <td>{quantity(row.availableQty)}</td>
                    <td>{row.productionDate ?? '待核实'}</td>
                    <td>{quantity(row.ageDays)}</td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      {!(input.kind === 'transfers' ? detail.transfers?.length : detail.batches?.length) && (
        <p>当前范围暂无明细记录。</p>
      )}
    </>
  );
}
