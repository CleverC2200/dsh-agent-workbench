import React from 'react';
import type { BusinessAccount } from './account.ts';
import type { CopyKey } from './locales.ts';
/** Presentation only; the GEA Host owns the QR challenge and authenticated identity. */
export declare function LoginDialog({ account, t, onClose }: {
    account: BusinessAccount;
    t: (key: CopyKey) => string;
    onClose: () => void;
}): React.JSX.Element;
