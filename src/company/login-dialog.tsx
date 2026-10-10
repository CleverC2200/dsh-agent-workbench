import React, { useEffect, useRef, useState } from 'react';
import type { BusinessAccount } from './account.ts';
import type { CopyKey } from './locales.ts';

type LoginPresentation =
  | { state: 'preparing' }
  | { state: 'waiting'; image: string }
  | { state: 'expired' }
  | { state: 'error'; message: string };

/** Presentation only; the GEA Host owns the QR challenge and authenticated identity. */
export function LoginDialog({ account, t, onClose }: {
  account: BusinessAccount;
  t: (key: CopyKey) => string;
  onClose: () => void;
}) {
  const [presentation, setPresentation] = useState<LoginPresentation>({ state: 'preparing' });
  const [revision, setRevision] = useState(0);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => { close.current?.focus(); }, []);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    setPresentation({ state: 'preparing' });
    const start = async () => {
      try {
        const challenge = await account.startLogin(controller.signal);
        if (controller.signal.aborted) return;
        const expiresAt = Date.now() + challenge.expiresIn * 1000;
        setPresentation({ state: 'waiting', image: challenge.image });
        const poll = async () => {
          if (controller.signal.aborted) return;
          if (Date.now() >= expiresAt) { setPresentation({ state: 'expired' }); return; }
          try {
            const authenticated = await account.pollLogin(challenge.loginId, controller.signal);
            if (controller.signal.aborted) return;
            if (authenticated) { onClose(); return; }
            timer = setTimeout(poll, 1000);
          } catch (failure) {
            if (!controller.signal.aborted)
              setPresentation({ state: 'error', message: failure instanceof Error ? failure.message : t('failure') });
          }
        };
        timer = setTimeout(poll, 500);
      } catch (failure) {
        if (!controller.signal.aborted)
          setPresentation({ state: 'error', message: failure instanceof Error ? failure.message : t('failure') });
      }
    };
    void start();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [account, revision, onClose, t]);
  return <div className="gea-account-login-backdrop" onClick={event => {
    if (event.target === event.currentTarget) onClose();
  }}>
    <section role="dialog" aria-modal="true" aria-label={t('login')}
      className="gea-account-login-dialog" onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); onClose(); }
        if (event.key === 'Tab') {
          const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'));
          const next = buttons[(buttons.indexOf(document.activeElement as HTMLButtonElement) + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length];
          event.preventDefault(); next?.focus();
        }
      }}>
      <button ref={close} type="button" className="gea-account-login-close" onClick={onClose}>{t('close')}</button>
      <h2>{t('login')}</h2>
      <p>{t('scanInstructions')}</p>
      <div className="gea-account-login-qr" aria-busy={presentation.state === 'preparing'}>
        {presentation.state === 'waiting' ? <img src={presentation.image} alt={t('login')} width="220" height="220" /> :
          <p role="status">{t(presentation.state === 'expired' ? 'qrExpired' : presentation.state === 'error' ? 'qrUnavailable' : 'qrPreparing')}</p>}
      </div>
      {presentation.state === 'error' ? <p role="alert">{presentation.message}</p> :
        <p role="status">{t(presentation.state === 'expired' ? 'qrExpiredHint' : 'pending')}</p>}
      <button type="button" onClick={() => setRevision(value => value + 1)}>{t('refreshQr')}</button>
      <p>{t('loginTip')}</p>
    </section>
  </div>;
}
