import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Home from './workbench-app';
import { ready } from '../../../shared/channel.js';

document.documentElement.classList.add('aps-plugin-host');

let lastModalState: boolean | undefined;
const reportModalState = () => {
  const open = Array.from(document.querySelectorAll('[role="dialog"][aria-modal="true"]')).some(
    (el) => el.getClientRects().length > 0,
  );
  if (open === lastModalState) return;
  lastModalState = open;
  window.parent.postMessage({ protocol: 'gea-page-modal-v1', open }, '*');
};
new MutationObserver(reportModalState).observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['hidden', 'style', 'class', 'aria-modal'],
});
window.addEventListener('pagehide', () =>
  window.parent.postMessage({ protocol: 'gea-page-modal-v1', open: false }, '*'),
);
reportModalState();
const root = document.getElementById('root');
if (!root) throw new Error('APS_PLUGIN_ROOT_MISSING');

class PageBoundary extends React.Component<React.PropsWithChildren, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <section role="alert" style={{ padding: 24 }}>
        <p>页面暂不可用，请重新打开看板。</p>
        <button type="button" onClick={() => this.setState({ failed: false })}>
          重新打开看板
        </button>
      </section>
    ) : (
      this.props.children
    );
  }
}

function ConnectedPage() {
  const [status, setStatus] = useState<'connecting' | 'ready' | 'failed'>('connecting');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setStatus('connecting');
    const timeout = setTimeout(() => {
      if (active) setStatus('failed');
    }, 20000);
    void ready.then(
      () => {
        if (active) {
          clearTimeout(timeout);
          setStatus('ready');
        }
      },
      () => {
        if (active) {
          clearTimeout(timeout);
          setStatus('failed');
        }
      },
    );
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [attempt]);
  if (status !== 'ready')
    return (
      <section role={status === 'failed' ? 'alert' : 'status'} style={{ padding: 24 }}>
        <p>{status === 'failed' ? '页面连接暂未完成，请重试。' : '正在连接产销协同看板…'}</p>
        {status === 'failed' && (
          <button type="button" onClick={() => setAttempt((value) => value + 1)}>
            重试连接
          </button>
        )}
      </section>
    );
  return (
    <PageBoundary>
      {APS_MOCK && (
        <div role="status" style={{ padding: 8 }}>
          APS 固定模拟数据 · 未真实读取或回写
        </div>
      )}
      <Home initialWorkspace="intelligent" embedMode liveData />
    </PageBoundary>
  );
}

const renderer = createRoot(root);
renderer.render(<ConnectedPage />);
window.addEventListener(
  'gea-identity-changed',
  () => {
    renderer.unmount();
    root.textContent = '登录身份已变化，请重新打开产销页面';
  },
  { once: true },
);
