import { refreshConfiguredQueries } from '../../../../../shared/query-cache';
import { QueryErrors } from '../../../../../shared/query-errors';
import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import Page from '@business-page';
import { mountBusinessFetch, clearBusinessCache } from './api';
import { action, ready } from '../channel.js';
import { updateContext, clearContext } from './context';
import '@business-style';

class Boundary extends React.Component<any, { error: string }> {
  state = { error: '' };
  static getDerivedStateFromError(e: Error) {
    return { error: e.message };
  }
  render() {
    return this.state.error ? (
      <section role="alert">
        <p>页面暂不可用，请重新读取。</p>
        <button type="button" onClick={() => refreshPage()}>
          重新读取
        </button>
      </section>
    ) : (
      this.props.children
    );
  }
}
let refreshPage = () => {};
function App() {
  const [revision, bump] = useState(0),
    [warnings, setWarnings] = useState<string[]>([]);
  useEffect(() => {
    const warn = (event: any) => {
      setWarnings((values) => [...new Set([...values, event.detail.message])]);
      updateContext('queryFailure', {
        message: event.detail.message,
        coverage: '部分或全部查询未成功，不能用缺失数据推断零值',
      });
    };
    window.addEventListener('gea-query-warning', warn);
    return () => window.removeEventListener('gea-query-warning', warn);
  }, []);
  refreshPage = () => {
    clearBusinessCache();
    clearContext();
    setWarnings([]);
    window.dispatchEvent(new Event('light-refresh'));
    bump((n) => n + 1);
  };
  return (
    <>
      <QueryErrors errors={warnings} scope="inventory-aqkc" />
      <Boundary key={revision}>
        <Page />
      </Boundary>
    </>
  );
}
type ConnectionState = { status: 'connecting' } | { status: 'connected' } | { status: 'error' };
function ConnectedApp() {
  const [attempt, retry] = useState(0);
  const [connection, setConnection] = useState<ConnectionState>({ status: 'connecting' });
  useEffect(() => {
    let active = true;
    setConnection({ status: 'connecting' });
    const timer = setTimeout(() => {
      if (active) setConnection({ status: 'error' });
    }, 20000);
    void ready
      .then(async () => {
        if (!active) return;
        await mountBusinessFetch();
        if (active) {
          clearTimeout(timer);
          setConnection({ status: 'connected' });
        }
      })
      .catch(() => {
        if (active) {
          clearTimeout(timer);
          setConnection({ status: 'error' });
        }
      });
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [attempt]);
  if (connection.status === 'connected') return <App />;
  return (
    <section role={connection.status === 'error' ? 'alert' : 'status'} style={{ padding: 24 }}>
      <p>
        {connection.status === 'error'
          ? '基地工作台连接未完成，请重试连接。'
          : '正在连接基地工作台…'}
      </p>
      {connection.status === 'error' && (
        <button type="button" onClick={() => retry((value) => value + 1)}>
          重试连接
        </button>
      )}
    </section>
  );
}
function mount() {
  const element = document.getElementById('app');
  if (!element) throw Error('PAGE_ROOT_MISSING');
  createRoot(element).render(<ConnectedApp />);
  window.addEventListener('gea-page-refresh', () => refreshPage());
  window.addEventListener('gea-session-changed', () => refreshPage());
  action('refresh', '清除本页快照并重新查询 GEA', () => {
    refreshConfiguredQueries();
    refreshPage();
    return { refreshing: true };
  });
  window.addEventListener('gea-session-changing', () => refreshPage());
  window.addEventListener('gea-identity-changed', () => {
    clearBusinessCache(true);
    clearContext();
    refreshPage();
  });
}
mount();
