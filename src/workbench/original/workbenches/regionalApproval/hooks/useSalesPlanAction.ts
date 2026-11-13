import { useWorkbenchHost, type GeaSalesPlanActionReceipt } from '../../../bridge.ts';
import { useCallback, useRef, useState } from 'react';
import {
  SalesPlanActionAttempt,
  classifySalesPlanActionError,
  type SalesPlanActionClient,
  type SalesPlanActionError,
  type SalesPlanActionInput,
} from '../models/salesPlanActionModel.ts';

export type SalesPlanActionState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; receipt: GeaSalesPlanActionReceipt }
  | { status: 'error'; error: SalesPlanActionError };

export const useSalesPlanAction = ({
  client: suppliedClient,
}: {
  client?: SalesPlanActionClient;
}) => {
  const host = useWorkbenchHost();
  const client = suppliedClient ?? host.salesPlan;

  const attempt = useRef(new SalesPlanActionAttempt(client));
  const renewAttempt = useRef(false);
  const operation = useRef(0);
  const [state, setState] = useState<SalesPlanActionState>({ status: 'idle' });

  const settle = useCallback(async (promise: Promise<GeaSalesPlanActionReceipt>) => {
    const current = ++operation.current;
    setState({ status: 'loading' });
    try {
      const receipt = await promise;
      if (operation.current === current) {
        renewAttempt.current = false;
        setState({ status: 'success', receipt });
      }
      return receipt;
    } catch (error) {
      const classified = classifySalesPlanActionError(error);
      if (operation.current === current) {
        renewAttempt.current = !classified.retrySameIntent;
        setState({ status: 'error', error: classified });
      }
      throw classified;
    }
  }, []);

  return {
    state,
    execute: (input: SalesPlanActionInput) => {
      try {
        if (renewAttempt.current) {
          renewAttempt.current = false;
          attempt.current = new SalesPlanActionAttempt(client);
        }
        return settle(attempt.current.submit(input));
      } catch (error) {
        return settle(Promise.reject(error));
      }
    },
    retry: () => settle(attempt.current.retry()),
  };
};
