import {
  replaceSalesPlanWorkflowRows,
  type SalesPlanWorkflowRow,
} from './original/salesPlanWorkflow.ts';

export function createWorkflowPeriodLoader(
  readWorkflow: (signal: AbortSignal) => Promise<SalesPlanWorkflowRow[]>,
) {
  let active: AbortController | undefined;
  replaceSalesPlanWorkflowRows([]);
  return async <T>(readPeriods: (signal: AbortSignal) => Promise<T>, caller?: AbortSignal) => {
    const request = new AbortController();
    const signal = caller ? AbortSignal.any([caller, request.signal]) : request.signal;
    signal.throwIfAborted();
    active?.abort();
    active = request;
    replaceSalesPlanWorkflowRows([]);
    try {
      const [rows, periods] = await Promise.all([readWorkflow(signal), readPeriods(signal)]);
      signal.throwIfAborted();
      replaceSalesPlanWorkflowRows(rows);
      return periods;
    } catch (error) {
      request.abort();
      throw error;
    } finally {
      if (active === request) active = undefined;
    }
  };
}
