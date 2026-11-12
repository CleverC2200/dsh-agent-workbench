export function showRunContext(run: unknown): void;
import type { WarningEvent } from './warning-views';
export function combineWarnings(
  board: unknown[],
  events: WarningEvent[],
  range: string,
): WarningEvent[];
export function openWarningList(
  board: unknown[],
  context: { period: string; cutoff: string },
): Promise<void>;
