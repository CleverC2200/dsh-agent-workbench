import React from 'react';
import type { BusinessAccount } from './account.ts';
import type { CopyKey } from './locales.ts';
type LoginCopyKey = Extract<CopyKey, 'close' | 'login' | 'welcomeLogin' | 'scanInstructions' | 'qrUnavailable' | 'qrPreparing' | 'qrExpired' | 'qrWaiting' | 'qrExpiredHint' | 'environment' | 'production' | 'test' | 'refreshQr' | 'failure' | 'loginTipTitle' | 'loginTip' | 'loginFooter'>;
/** Presentation only; the GEA Host owns the QR challenge and authenticated identity. */
export declare function LoginDialog({ account, t, onClose, }: {
    account: BusinessAccount;
    t: (key: CopyKey) => string;
    onClose: () => void;
}): React.JSX.Element;
export declare function LoginSurface({ account, identity, t, onClose, }: {
    account: Pick<BusinessAccount, 'startLogin' | 'pollLogin'>;
    identity: ReturnType<BusinessAccount['getSnapshot']>;
    t: (key: LoginCopyKey) => string;
    onClose?: () => void;
}): React.JSX.Element;
export {};
