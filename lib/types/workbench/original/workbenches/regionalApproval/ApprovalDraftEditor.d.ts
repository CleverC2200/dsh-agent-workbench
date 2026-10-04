import React from 'react';
import type { TFunction } from 'i18next';
import { type GeaSalesPlanDetail } from '../../bridge.ts';
export declare function ApprovalDraftEditor({ detail, t, onClose }: {
    detail: GeaSalesPlanDetail;
    t: TFunction;
    onClose: () => void;
}): React.JSX.Element;
