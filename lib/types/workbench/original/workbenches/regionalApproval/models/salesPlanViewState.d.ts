/** 改编自 AionUi（Apache-2.0）：已替换为本地导入并使用显式 DSH Host 适配器，见 SOURCE.md。 */
export type SalesPlanViewState = {
    /** Unsent UI text, partitioned by the actual Core Session, plan, version and role. */
    liveInputs?: Record<string, Record<string, string>>;
};
export declare const liveInputKey: (sessionId: string, planId: string, versionId: string, role: string | undefined) => string;
