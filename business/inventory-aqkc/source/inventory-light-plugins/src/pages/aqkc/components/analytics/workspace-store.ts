'use client';

import { useSyncExternalStore } from 'react';

import { normalizeWorkspaceState, type WorkspaceState } from './workspace-normalizer.ts';

export type {
  WorkspaceAction,
  WorkspaceComparison,
  WorkspaceKpi,
  WorkspaceRecord,
  WorkspaceSurfaceBlock,
  WorkspaceState,
  WorkspaceTable,
  TargetStockAnalysisReport,
  TargetStockReportAnalysisPoint,
  TargetStockReportMetricRow,
  WorkspaceVersionSummary,
} from './workspace-normalizer';
export { normalizeWorkspaceState } from './workspace-normalizer';

let currentWorkspace: WorkspaceState | null = null;
const listeners = new Set<() => void>();

function emitChange() {
  listeners.forEach((listener) => listener());
}

export function setDashboardWorkspace(workspace: unknown) {
  currentWorkspace = normalizeWorkspaceState(workspace);
  emitChange();
}

export function resetDashboardWorkspace() {
  currentWorkspace = null;
  emitChange();
}

export function getDashboardWorkspace() {
  return currentWorkspace;
}

export function useDashboardWorkspace() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => currentWorkspace,
    () => currentWorkspace,
  );
}
