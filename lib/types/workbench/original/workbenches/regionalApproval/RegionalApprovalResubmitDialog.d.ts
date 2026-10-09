import React from "react";
import type { TFunction } from "i18next";
import type { GeaSalesPlanPeriod } from "../../contracts.ts";
import { type SalesPlanSubmitClient } from "./models/salesPlanSubmitModel.ts";
/** 编辑刚读取的退回版本；只有已连接的 Host 可以提交。 */
export declare function RegionalApprovalResubmitDialog({ planId, versionId, period, client, connected, t, onClose, onSucceeded, }: {
    planId: string;
    versionId: string;
    period: GeaSalesPlanPeriod;
    client: SalesPlanSubmitClient;
    connected: boolean;
    t: TFunction;
    onClose: () => void;
    onSucceeded: () => void;
}): React.JSX.Element;
