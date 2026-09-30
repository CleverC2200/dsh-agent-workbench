import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
globalThis.window = {innerWidth: 1440};
const {outputFiles} = await build({stdin: {contents: 'export {createLayoutStore} from "./src/stores.ts"; export {LayoutController} from "./src/service.ts";', resolveDir: process.cwd(), loader: 'ts'}, bundle:true, write:false, format:'esm', platform:'node', alias: {'@deepseek-ai/dsh-client-store': fileURLToPath(new URL('../../deepseek-harness/packages/client/store/lib/index.js', import.meta.url))}});
const {createLayoutStore, LayoutController} = await import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64'));
function fixture() {
  const state = createLayoutStore().create();
  const layout = new LayoutController(state.actions, id => id === 'page',
    {getSnapshot: () => state.getSnapshot().panelInfo, subscribe: listener => state.subscribe(listener)},
    {getSnapshot: () => state.getSnapshot().shellPresentation, subscribe: listener => state.subscribe(listener)});
  return {state, layout};
}
test('presentation changes keep the selected business panel and geometry preference', () => {
  const {state, layout} = fixture();
  layout.selectPanel('page');
  state.actions.setConversationWidth(360);
  for (const view of ['center', 'chat', 'split']) {
    layout.setConversationView(view);
    assert.equal(state.getSnapshot().panelInfo.activePanelId, 'page');
    assert.equal(state.getSnapshot().layoutInfo.conversationWidth, 360);
    assert.equal(layout.shellPresentation.getSnapshot().conversationView, view);
  }
});
test('fullscreen claims and fixed title release only their own registration', () => {
  const {state, layout} = fixture();
  const first = layout.registerFullscreenPanel('page');
  const second = layout.registerFullscreenPanel('page');
  first(); first();
  assert.deepEqual(state.getSnapshot().fullscreenPanelIds, ['page']);
  second();
  assert.deepEqual(state.getSnapshot().fullscreenPanelIds, []);
  assert.throws(() => layout.registerFullscreenPanel('missing'), /UNKNOWN_FULLSCREEN_PANEL/);
  const title = layout.registerDocumentTitle('GEA');
  assert.equal(layout.shellPresentation.getSnapshot().documentTitle, 'GEA');
  assert.throws(() => layout.registerDocumentTitle('another'), /ALREADY_REGISTERED/);
  title(); title();
  assert.equal(layout.shellPresentation.getSnapshot().documentTitle, undefined);
});
test('expand is idempotent and disposal clears transient presentation claims', () => {
  const {state, layout} = fixture();
  layout.toggleSidebar();
  layout.expandSidebar();
  const width = state.getSnapshot().layoutInfo.sidebar;
  layout.expandSidebar();
  assert.equal(state.getSnapshot().layoutInfo.sidebar, width);
  layout.registerFullscreenPanel('page');
  layout.registerDocumentTitle('GEA');
  layout.dispose();
  assert.deepEqual(state.getSnapshot().fullscreenPanelIds, []);
  assert.equal(layout.shellPresentation.getSnapshot().documentTitle, undefined);
});
