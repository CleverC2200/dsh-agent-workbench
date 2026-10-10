import React, { useEffect, useRef, useState } from 'react';
import type { BusinessAccount } from './account.ts';
import type { CopyKey } from './locales.ts';
import logo from '../workbench/gea-logo.png';

type LoginPresentation =
  | { state: 'preparing' }
  | { state: 'waiting'; image: string }
  | { state: 'expired'; image: string }
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
  useEffect(() => { if (presentation.state === 'preparing') close.current?.focus(); }, [presentation.state]);
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
          if (Date.now() >= expiresAt) { setPresentation({ state: 'expired', image: challenge.image }); return; }
          try {
            const authenticated = await account.pollLogin(challenge.loginId, controller.signal);
            if (controller.signal.aborted) return;
            if (authenticated) {
              // Only the subscribed Host identity can close the dialog as authenticated.
              timer = setTimeout(() => {
                if (!controller.signal.aborted) setPresentation({ state: 'expired', image: challenge.image });
              }, Math.max(0, expiresAt - Date.now()));
              return;
            }
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
  const image = presentation.state === 'waiting' || presentation.state === 'expired' ? presentation.image : undefined;
  return <div className="gea-account-login-backdrop gea-login-page" onClick={event => {
    if (event.target === event.currentTarget) onClose();
  }}>
    <section role="dialog" aria-modal="true" aria-label={t('login')}
      className="gea-account-login-dialog gea-login-card" onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); onClose(); }
        if (event.key === 'Tab') {
          const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
          const next = buttons[(buttons.indexOf(document.activeElement as HTMLButtonElement) + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length];
          event.preventDefault(); next?.focus();
        }
      }}>
      <button ref={close} type="button" className="gea-account-login-close" aria-label={t('close')} title={t('close')} onClick={onClose}>
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16"><path d="m4 4 8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
      </button>
      <img className="gea-login-logo" src={logo} alt="GEA" width="56" height="56" />
      <h2>{t('welcomeLogin')}</h2>
      <p>{t('scanInstructions')}</p>
      <div className={`gea-account-login-qr gea-login-qr${presentation.state === 'expired' ? ' is-expired' : ''}`} aria-busy={presentation.state === 'preparing'}>
        {image ? <img src={image} alt={t('login')} width="220" height="220" /> :
          <div className="gea-qr-placeholder" role="status">
            {presentation.state === 'preparing' && <span className="gea-wait-dots" aria-hidden="true"><i /><i /><i /></span>}
            <span>{t(presentation.state === 'error' ? 'qrUnavailable' : 'qrPreparing')}</span>
          </div>}
        {presentation.state === 'expired' && <div className="gea-qr-expired"><p>{t('qrExpired')}</p></div>}
      </div>
      <p className="gea-login-status" role="status" aria-live="polite">
        {presentation.state === 'waiting' && <span className="gea-ready-dot" aria-hidden="true" />}
        {presentation.state === 'waiting' ? t('qrWaiting') : presentation.state === 'expired' ? t('qrExpiredHint') : null}
      </p>
      <button type="button" className="gea-login-submit" disabled={presentation.state === 'preparing'} onClick={() => setRevision(value => value + 1)}>
        {t(presentation.state === 'preparing' ? 'qrPreparing' : 'refreshQr')}
      </button>
      {presentation.state === 'error' && <p role="alert">{presentation.message}</p>}
      <aside className="gea-login-tip"><strong>{t('loginTipTitle')}</strong><p>{t('loginTip')}</p></aside>
      <footer>{t('loginFooter')}</footer>
    </section>
  </div>;
}
