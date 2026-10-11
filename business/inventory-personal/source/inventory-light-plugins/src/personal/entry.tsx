import React from 'react';
import { createRoot } from 'react-dom/client';
import Page from './page';
import { createPageViewState } from '../../../../../shared/view-state.js';
import { ready } from '../../../../../shared/channel.js';
import { reset } from './data';
import { clearContext } from '../native/context';
import '../dsh-ui/base.css';
void ready
  .then(() => {
    const app = document.getElementById('app')!,
      root = createRoot(app);
    let revision = 0;
    const view = createPageViewState('inventory-personal');
    root.render(<Page view={view} />);
    const sessionChanging = () => {
      reset();
      clearContext();
    };
    const sessionChanged = () => {
      root.render(<Page key={++revision} view={view} />);
    };
    const identityChanged = () => {
      reset();
      clearContext();
      root.render(<p role="alert">登录身份已变化，请重新打开工作台</p>);
    };
    window.addEventListener('gea-session-changing', sessionChanging);
    window.addEventListener('gea-session-changed', sessionChanged);
    window.addEventListener('gea-identity-changed', identityChanged);
    window.addEventListener(
      'pagehide',
      () => {
        reset();
        clearContext();
        root.unmount();
        window.removeEventListener('gea-session-changing', sessionChanging);
        window.removeEventListener('gea-session-changed', sessionChanged);
        window.removeEventListener('gea-identity-changed', identityChanged);
      },
      { once: true },
    );
  })
  .catch((error) => {
    document.getElementById('app')!.textContent = error.message;
  });
