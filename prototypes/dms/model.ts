/** 内存 DMS 验收模型；生产 Host 永远不会导入。 */
import {
  buildDmsMockPackets,
  type DmsMockPlan,
  type DmsMockPacket,
} from 'dsh-agent-manage/inventory-compute/dms-mock-packets';
export type {
  DmsMockSku,
  DmsMockPlan,
  DmsMockPacket,
} from 'dsh-agent-manage/inventory-compute/dms-mock-packets';
import {
  salesPlanWorkflow,
  SALES_PLAN_WORKFLOW_ROWS,
  type SalesPlanWorkflowRow,
} from '../../src/workbench/original/salesPlanWorkflow.ts';

export type DmsMockReceipt = {
  key: string;
  sourcePlanId: string;
  sourceVersionId: string;
  dmsId: string;
  syncedAt: string;
};
export type DmsMockOutcome = 'success' | 'failure' | 'timeout-before' | 'lost-receipt' | 'partial';
type SyncStatus = 'NOT_STARTED' | 'PENDING' | 'FAILED' | 'UNKNOWN' | 'SYNCED';
type Log = {
  action: string;
  at: string;
  status: number;
  syncStatus: SyncStatus;
  detail: string;
};

/** Public mock command validates the existing workflow projection before packet calculation. */
export function mockDmsPackets(plan: DmsMockPlan): DmsMockPacket[] {
  if (plan.status !== 5) throw new Error('MOCK_DMS_REQUIRES_STATUS_5');
  if (!salesPlanWorkflow(plan.typeCode, SALES_PLAN_WORKFLOW_ROWS).rolesKnown)
    throw new Error('MOCK_INVALID_PLAN');
  return buildDmsMockPackets(plan);
}

/** 确定性的 mock 接收方和本地回读；远端效果只保存在当前实例内存中。 */
export class MockDmsWriteback {
  private plan: DmsMockPlan;
  private syncStatus: SyncStatus = 'NOT_STARTED';
  private finishedAt: string | null = null;
  private packets: DmsMockPacket[] = [];
  private readonly remote = new Map<string, DmsMockReceipt>();
  private readonly accepted = new Map<string, DmsMockReceipt>();
  private readonly logs: Log[] = [];
  private attempts = 0;

  constructor(
    plan: DmsMockPlan,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {
    this.plan = structuredClone(plan);
    if (plan.status === 5) {
      this.packets = mockDmsPackets(plan);
      this.syncStatus = 'PENDING';
    }
  }

  /** 使用与工作台相同的工作流投影模拟品类审批。 */
  approve(rows: readonly SalesPlanWorkflowRow[] = SALES_PLAN_WORKFLOW_ROWS): void {
    const flow = salesPlanWorkflow(this.plan.typeCode, rows);
    if (
      flow.actor(this.plan.status) !== 'category' ||
      flow.transition(this.plan.status, 'APPROVE') !== 5
    )
      throw new Error('MOCK_NOT_CATEGORY_APPROVAL');
    const next = { ...this.plan, status: 5 };
    const packets = mockDmsPackets(next);
    this.plan = next;
    this.packets = packets;
    this.syncStatus = 'PENDING';
    this.log('CATEGORY_APPROVE', '4 → 5');
  }

  /** 使用原报文键重试已确认失败；未知结果必须先回读对账。 */
  deliver(outcome: DmsMockOutcome): void {
    if (this.syncStatus === 'SYNCED') {
      this.log('REPLAY', '已完成，不重复投递');
      return;
    }
    if (this.plan.status !== 5) throw new Error('MOCK_DMS_REQUIRES_STATUS_5');
    if (this.syncStatus === 'UNKNOWN') throw new Error('MOCK_RECONCILE_FIRST');
    if (outcome === 'partial' && this.packets.length < 2)
      throw new Error('MOCK_PARTIAL_REQUIRES_Z');
    this.attempts++;
    this.log('SEND', `同版本原幂等键，第 ${this.attempts} 次尝试`);
    if (outcome === 'failure') {
      this.syncStatus = 'FAILED';
      this.log('FAILED', '模拟接收方明确拒绝，可原键重试');
      return;
    }
    if (outcome !== 'timeout-before') {
      const packets = outcome === 'partial' ? this.packets.slice(0, 1) : this.packets;
      for (const packet of packets)
        if (!this.remote.has(packet.key))
          this.remote.set(packet.key, {
            key: packet.key,
            sourcePlanId: packet.PLANE_NUM,
            sourceVersionId: packet.sourceVersionId,
            dmsId: `mock-dms-${this.remote.size + 1}`,
            syncedAt: this.now(),
          });
    }
    if (outcome !== 'success') {
      this.syncStatus = 'UNKNOWN';
      this.log('UNKNOWN', '结果未知，保持 5；先查询模拟接收方');
      return;
    }
    this.acceptReceipts([...this.remote.values()]);
  }

  /** 查询 mock 接收方而不重发；只有回读后才能把缺失环节标记为可重试。 */
  reconcile(): void {
    if (this.plan.status !== 5 && this.plan.status !== 10) throw new Error('MOCK_DMS_NOT_STARTED');
    this.log('RECONCILE', '只读查询模拟接收方');
    this.acceptReceipts([...this.remote.values()]);
    if (this.syncStatus !== 'SYNCED') {
      this.syncStatus = 'FAILED';
      this.log('RECONCILED_MISSING', '确认存在未接收报文，可使用原键补齐');
    }
  }

  /** 应用前先校验完整回执批次；重复回执不能改变完成时间。 */
  acceptReceipts(receipts: readonly DmsMockReceipt[]): void {
    if (this.plan.status !== 5 && this.plan.status !== 10) throw new Error('MOCK_DMS_NOT_STARTED');
    const candidate = new Map(this.accepted);
    for (const receipt of receipts) {
      const packet = this.packets.find((row) => row.key === receipt.key);
      const previous = candidate.get(receipt.key);
      if (
        !packet ||
        receipt.sourcePlanId !== packet.PLANE_NUM ||
        receipt.sourceVersionId !== packet.sourceVersionId ||
        !receipt.dmsId ||
        !Number.isFinite(Date.parse(receipt.syncedAt))
      )
        throw new Error('MOCK_INVALID_RECEIPT');
      if (previous && JSON.stringify(previous) !== JSON.stringify(receipt))
        throw new Error('MOCK_CONFLICTING_RECEIPT');
      candidate.set(receipt.key, structuredClone(receipt));
    }
    if (new Set([...candidate.values()].map((row) => row.dmsId)).size !== candidate.size)
      throw new Error('MOCK_DUPLICATE_DMS_ID');
    for (const [key, receipt] of candidate) this.accepted.set(key, receipt);
    if (this.syncStatus === 'SYNCED') {
      this.log('DUPLICATE_RECEIPT', '忽略相同回执，完成时间不变');
      return;
    }
    if (this.packets.length && this.packets.every((packet) => this.accepted.has(packet.key))) {
      this.plan.status = 10;
      this.syncStatus = 'SYNCED';
      this.finishedAt = this.now();
      this.log('DMS_SYNC', '全部报文回执齐全：5 → 10');
    }
  }

  /** 返回供演示和断言使用的脱离视图；外部修改不会触及模拟器。 */
  read() {
    return structuredClone({
      plan: this.plan,
      syncStatus: this.syncStatus,
      finishedAt: this.finishedAt,
      packets: this.packets,
      receipts: [...this.accepted.values()],
      logs: this.logs,
      attempts: this.attempts,
      remoteDeliveries: this.remote.size,
    });
  }

  private log(action: string, detail: string): void {
    this.logs.push({
      action,
      detail,
      at: this.now(),
      status: this.plan.status,
      syncStatus: this.syncStatus,
    });
  }
}
