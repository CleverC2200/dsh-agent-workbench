export interface MonitorEvent { id: string; scope: string; metric: string; range: string; gap: string; diagnosis: string; evidence: string; trend: string; first?: string; cutoff?: string; eventStatus?: string; }
export function openAlertManagement(events: MonitorEvent[], onEvent: (event: MonitorEvent) => void, startNew?: boolean): void;
