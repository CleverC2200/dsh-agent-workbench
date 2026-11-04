import React, { useEffect, useRef, useState } from 'react';
import type { BusinessAccount, BusinessEnvironment, PasswordLoginChallenge } from './account.ts';

export type PasswordLoginCopyKey = keyof typeof import('./locales.ts').passwordLoginCopy | 'login';

type Presentation =
  | { state: 'preparing' | 'unavailable' | 'expired' }
  | { state: 'ready' | 'submitting'; challenge: PasswordLoginChallenge };

export function PasswordLoginForm({
  account,
  environment,
  t,
}: {
  account: Pick<BusinessAccount, 'preparePasswordLogin' | 'loginWithPassword'>;
  environment: BusinessEnvironment;
  t: (key: PasswordLoginCopyKey) => string;
}) {
  const [presentation, setPresentation] = useState<Presentation>({ state: 'preparing' });
  const [revision, setRevision] = useState(0);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [captcha, setCaptcha] = useState('');
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<PasswordLoginCopyKey>();
  const pending = useRef<AbortController>();
  const expiresAt = useRef(0);
  const busy = presentation.state === 'submitting';

  useEffect(() => {
    const controller = new AbortController();
    pending.current = controller;
    let timer: ReturnType<typeof setTimeout>;
    setPresentation({ state: 'preparing' });
    setCaptcha('');
    const prepare = async () => {
      try {
        const challenge = await account.preparePasswordLogin(controller.signal, environment);
        if (controller.signal.aborted) return;
        expiresAt.current = Date.now() + challenge.expiresIn * 1000;
        setPresentation({ state: 'ready', challenge });
        timer = setTimeout(() => {
          if (!controller.signal.aborted)
            setPresentation((current) =>
              current.state === 'ready' ? { state: 'expired' } : current,
            );
        }, challenge.expiresIn * 1000);
      } catch (failure) {
        if (!controller.signal.aborted) {
          setError(loginFailure(failure));
          setPresentation({ state: 'unavailable' });
        }
      }
    };
    void prepare();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [account, environment, revision]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (presentation.state !== 'ready' || !pending.current || pending.current.signal.aborted)
      return;
    if (Date.now() >= expiresAt.current) {
      setPresentation({ state: 'expired' });
      return;
    }
    const controller = pending.current;
    setError(undefined);
    setPresentation({ state: 'submitting', challenge: presentation.challenge });
    try {
      await account.loginWithPassword(
        {
          challengeId: presentation.challenge.challengeId,
          username,
          password,
          captcha,
        },
        controller.signal,
      );
      if (!controller.signal.aborted) setPassword('');
    } catch (failure) {
      if (!controller.signal.aborted) {
        setPassword('');
        setError(loginFailure(failure));
        setPresentation({ state: 'unavailable' });
        if (!['GEA_LOGIN_RATE_LIMITED', 'GEA_LOGIN_UNAVAILABLE'].includes(failureCode(failure)))
          setRevision((value) => value + 1);
      }
    }
  };
  const challenge = 'challenge' in presentation ? presentation.challenge : undefined;
  return (
    <form className="gea-password-form" onSubmit={(event) => void submit(event)}>
      <fieldset disabled={busy}>
        <label>
          {t('username')}
          <input
            name="username"
            autoComplete="username"
            required
            maxLength={256}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </label>
        <label>
          {t('password')}
          <span className="gea-password-input">
            <input
              name="password"
              type={visible ? 'text' : 'password'}
              autoComplete="current-password"
              required
              maxLength={4096}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button
              type="button"
              aria-pressed={visible}
              onClick={() => setVisible((value) => !value)}
            >
              {t(visible ? 'hidePassword' : 'showPassword')}
            </button>
          </span>
        </label>
        <label>
          {t('captcha')}
          <input
            name="captcha"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            required
            pattern="[A-Za-z0-9]{4}"
            maxLength={4}
            value={captcha}
            onChange={(event) => setCaptcha(event.target.value)}
          />
        </label>
        <div className="gea-captcha-row">
          {challenge ? (
            <button
              type="button"
              className="gea-captcha-image"
              aria-label={t('refreshCaptcha')}
              onClick={() => {
                setError(undefined);
                setRevision((value) => value + 1);
              }}
            >
              <img src={challenge.image} alt={t('captcha')} />
            </button>
          ) : (
            <span role="status">
              {t(
                presentation.state === 'expired'
                  ? 'captchaExpired'
                  : presentation.state === 'preparing'
                    ? 'captchaPreparing'
                    : 'captchaUnavailable',
              )}
            </span>
          )}
          <button
            type="button"
            disabled={presentation.state === 'preparing'}
            onClick={() => {
              setError(undefined);
              setRevision((value) => value + 1);
            }}
          >
            {t('refreshCaptcha')}
          </button>
        </div>
        <button
          type="submit"
          className="gea-login-submit"
          disabled={
            presentation.state !== 'ready' ||
            !username.trim() ||
            !password ||
            !/^[A-Za-z0-9]{4}$/.test(captcha)
          }
        >
          {t(busy ? 'signingIn' : 'login')}
        </button>
      </fieldset>
      {error && <p role="alert">{t(error)}</p>}
    </form>
  );
}

function failureCode(failure: unknown): string {
  return failure instanceof Error && 'code' in failure
    ? String(failure.code)
    : failure instanceof Error
      ? failure.message
      : '';
}

function loginFailure(failure: unknown): PasswordLoginCopyKey {
  switch (failureCode(failure)) {
    case 'GEA_LOGIN_CAPTCHA_INVALID':
      return 'captchaInvalid';
    case 'GEA_LOGIN_REJECTED':
      return 'loginRejected';
    case 'GEA_LOGIN_RATE_LIMITED':
      return 'loginLimited';
    case 'GEA_LOGIN_UNAVAILABLE':
      return 'loginUnavailable';
    case 'GEA_NETWORK_ERROR':
      return 'loginNetworkError';
    case 'GEA_REQUEST_TIMEOUT':
      return 'loginTimeout';
    default:
      return 'loginUnavailable';
  }
}
