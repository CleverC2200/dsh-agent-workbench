/** Read-only actual GEA domain response contract used by the Native page. */
export interface NativeBusinessStatus {
  environment: 'production' | 'test';
  environments: string[];
  authenticated: boolean;
  pageScope: string | null;
  resubmitConnected: boolean;
  loginState: string;
  permissionCodes?: string[];
  roles?: any[];
  user: { name?: string; tenantId?: string; id: string; username: string; avatar?: string } | null;
  source: string;
  provider: string;
  model: string;
  discoveredModels: string[];
  mode: string;
  runId: string;
  modules?: Array<{
    id: string;
    label: string;
    surface?: string;
    consumerCode?: string;
    pageIds: string[];
  }>;
}
export interface NativePreview {
  previewId: string;
  snapshotHash: string;
  bytes: number;
  limitBytes: number;
  snapshot: object;
  prompt: string;
}
