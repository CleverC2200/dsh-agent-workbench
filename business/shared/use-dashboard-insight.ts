import { useEffect, useState } from 'react';
import { call, ready } from './channel.js';
import { z } from 'zod';
import { configuredQueryFreshAfter } from './query-cache';

type InsightState =
  | { key: string; status: 'loading' | 'error' }
  | { key: string; status: 'ready'; answer: string };
const insightResponse = z.object({ answer: z.string().trim().min(1) });
/** Only the insight awaits the model; metrics and tables keep their own loading lifetimes. */
export function useDashboardInsight(evidence: unknown, enabled: boolean): InsightState {
  const [sessionEpoch, setSessionEpoch] = useState(0);
  useEffect(() => {
    const change = () => setSessionEpoch((value) => value + 1);
    window.addEventListener('gea-session-changing', change);
    window.addEventListener('gea-session-changed', change);
    return () => {
      window.removeEventListener('gea-session-changing', change);
      window.removeEventListener('gea-session-changed', change);
    };
  }, []);
  const payload = enabled
    ? JSON.stringify({ evidence, freshAfter: configuredQueryFreshAfter() })
    : '';
  const key = `${sessionEpoch}:${payload}`;
  const [state, setState] = useState<InsightState>({ key: '', status: 'loading' });
  useEffect(() => {
    if (!payload) return;
    const controller = new AbortController();
    const deadline = setTimeout(() => {
      setState({ key, status: 'error' });
      controller.abort();
    }, 90000);
    setState({ key, status: 'loading' });
    // Coalesce progressive overview updates before spending a model request.
    const timer = setTimeout(() => {
      void ready
        .then(async () => {
          controller.signal.throwIfAborted();
          const result = insightResponse.parse(
            await call('insight', JSON.parse(payload), { signal: controller.signal }),
          );
          if (!controller.signal.aborted) {
            clearTimeout(deadline);
            setState({ key, status: 'ready', answer: result.answer });
          }
        })
        .catch(() => {
          clearTimeout(deadline);
          if (!controller.signal.aborted) setState({ key, status: 'error' });
        });
    }, 500);
    return () => {
      clearTimeout(timer);
      clearTimeout(deadline);
      controller.abort();
    };
  }, [key, payload]);
  return state.key === key ? state : { key, status: 'loading' as const };
}
