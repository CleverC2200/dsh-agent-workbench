/** 独立的同源业务文档；会话仍由 DSH 拥有和管理。 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { WorkbenchHostProvider } from './workbench/original/bridge.ts';
import { WorkbenchPage, workbenchHost } from './workbench/page.tsx';
import { zh, en, type CopyKey } from './client/locales.ts';

const language = new URLSearchParams(window.location.search).get('locale') ?? navigator.language;
const dictionary = language.startsWith('zh') ? zh : en;
document.documentElement.lang = language.startsWith('zh') ? 'zh-CN' : 'en';
const t = (key: CopyKey) => dictionary[key];
const root = document.getElementById('gea-workbench');
if (!root) throw new Error('GEA_WORKBENCH_ROOT_MISSING');
createRoot(root).render(
  <WorkbenchHostProvider value={workbenchHost}>
    <WorkbenchPage t={t} />
  </WorkbenchHostProvider>,
);

window.addEventListener('message', (event) => {
  if (
    event.source === window.parent &&
    event.origin === window.location.origin &&
    event.data?.protocol === 'gea-toolbar-layout'
  ) {
    document.documentElement.toggleAttribute(
      'data-shared-workbench-toolbar',
      event.data.shared === true,
    );
  }
});
window.parent.postMessage({ protocol: 'gea-toolbar-layout-ready' }, window.location.origin);

window.addEventListener('message', (event) => {
  if (
    event.source !== window.parent ||
    event.origin !== window.location.origin ||
    event.data?.protocol !== 'agent-workbench-theme'
  )
    return;
  const dark = event.data.dark === true;
  document.body.toggleAttribute('data-ds-dark-theme', dark);
  document.body.setAttribute('arco-theme', dark ? 'dark' : 'light');
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  if (Number.isFinite(event.data.fontSize))
    document.documentElement.style.setProperty(
      '--dsh-content-font-size',
      `${event.data.fontSize}px`,
    );
});
