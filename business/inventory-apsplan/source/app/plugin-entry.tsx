import { createRoot } from 'react-dom/client';
import Home from './workbench-app';
import { ready } from '../../../shared/channel.js';
document.documentElement.classList.add('aps-plugin-host');
const root = document.getElementById('root');
if (!root) throw new Error('APS_PLUGIN_ROOT_MISSING');
// Open the intelligent workspace first; the board remains available in the workspace tabs.
void ready
  .then(() => {
    const renderer = createRoot(root);
    renderer.render(
      <>
        {APS_MOCK && (
          <div role="status" style={{ padding: 8 }}>
            APS 固定模拟数据 · 未真实读取或回写
          </div>
        )}
        <Home initialWorkspace="intelligent" embedMode liveData />
      </>,
    );
    window.addEventListener(
      'gea-identity-changed',
      () => {
        renderer.unmount();
        root.textContent = '登录身份已变化，请重新打开产销页面';
      },
      { once: true },
    );
  })
  .catch((error) => {
    root.textContent = String(error);
  });
