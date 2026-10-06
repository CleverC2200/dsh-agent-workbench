import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const { outputFiles } = await build({
  stdin: {
    contents: `export {ReferenceMessage,mountReferenceMessages} from './src/page-interaction/reference-message.tsx';export {createElement,act} from 'react';export {createRoot} from ${JSON.stringify(require.resolve('react-dom/client'))};`,
    resolveDir: process.cwd(),
  },
  jsx: 'automatic',
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  external: ['react'],
  alias: { 'react-dom': resolve('node_modules/react-dom') },
  loader: { '.css': 'text', '.module.css': 'text', '.png': 'dataurl' },
});
const module = { exports: {} };
new Function('module', 'exports', 'require', outputFiles[0].text)(module, module.exports, require);
const { ReferenceMessage, mountReferenceMessages, createElement, createRoot, act } = module.exports;
const translate = (key, data) =>
  key === 'message.referenceSummary' ? `References: ${data.labels}` : key;

test('mixed reference node projects display only, preserves attachments and copies original text once', async (t) => {
  const dom = new JSDOM('<main></main>', { url: 'https://host.example', pretendToBeVisual: true });
  const values = {
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const saved = Object.keys(values).map((key) => [
    key,
    Object.getOwnPropertyDescriptor(globalThis, key),
  ]);
  for (const [key, value] of Object.entries(values))
    Object.defineProperty(globalThis, key, { configurable: true, value });
  const copied = [];
  Object.defineProperty(dom.window.navigator, 'clipboard', {
    value: { writeText: async (text) => copied.push(text) },
  });
  const raw = '[客户甲](dsh-page:R123456abcdef) 分析库存 /stock @/workspace/proof.txt @Recall';
  const content = [
    { type: 'text', text: raw },
    { type: 'image', attachment: { id: 'image-1', mime: 'image/png' } },
    { type: 'file', attachment: { id: 'file-1', name: 'proof.txt', bytes: 32 } },
    { type: 'fixture-extra', value: 'preserved extra block' },
  ];
  const original = structuredClone(content);
  const openedFiles = [],
    openedSkills = [];
  const props = {
    node: {
      kind: 'user',
      data: { content, time: 1700000000000, referenceLabels: ['Recall'], skillNames: ['stock'] },
    },
    t: translate,
    renderMessageImages: ({ images, align, compact }) =>
      createElement(
        'div',
        { 'data-image-slot': true, 'data-align': align, 'data-compact': compact },
        JSON.stringify(images),
      ),
    openFile: (path) => openedFiles.push(path),
    openSkill: (name) => openedSkills.push(name),
  };
  const root = createRoot(dom.window.document.querySelector('main'));
  t.after(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of saved)
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
  });
  await act(async () => root.render(createElement(ReferenceMessage, props)));
  const main = dom.window.document.querySelector('main');
  assert.equal(main.textContent.includes('dsh-page:'), false);
  assert.ok(main.textContent.includes('客户甲 分析库存'));
  assert.equal(main.querySelectorAll('[data-message-attachments]').length, 1);
  assert.equal(main.querySelectorAll('[data-image-slot]').length, 1);
  assert.equal(main.querySelector('[data-image-slot]').dataset.compact, 'true');
  assert.equal(main.querySelector('[data-image-slot]').dataset.align, 'end');
  assert.ok(main.textContent.includes('proof.txt'));
  await act(async () =>
    [...main.querySelectorAll('button')]
      .find((button) => button.textContent.includes('message.extraBlock'))
      .click(),
  );
  assert.ok(main.textContent.includes('preserved extra block'));
  assert.ok(main.textContent.includes('Recall'));
  await act(async () => {
    main.querySelector('button[data-ref-chip="skill"]').click();
    main.querySelector('button[data-ref-chip="file"]').click();
  });
  assert.deepEqual(openedSkills, ['stock']);
  assert.deepEqual(openedFiles, ['/workspace/proof.txt']);
  const actions = main.querySelectorAll('[data-clock="start"]');
  assert.equal(actions.length, 1);
  assert.equal(actions[0].querySelectorAll('button[aria-label="copy"]').length, 1);
  assert.equal(actions[0].children.length, 2, 'one time label and one copy tooltip');
  await act(async () => {
    actions[0].querySelector('button').click();
    await Promise.resolve();
  });
  assert.deepEqual(copied, [raw]);
  assert.deepEqual(content, original, 'wire and model blocks remain untouched');
  await act(async () =>
    root.render(
      createElement(ReferenceMessage, {
        ...props,
        node: {
          kind: 'steering',
          data: { content: [{ type: 'text', text: '普通消息' }], time: 1700000000000 },
        },
      }),
    ),
  );
  assert.equal(
    main.querySelectorAll('[data-page-reference-message]').length,
    0,
    'ordinary nodes keep the Core renderer',
  );
  assert.ok(main.textContent.includes('普通消息'));
  assert.equal(main.querySelectorAll('[data-clock="start"]').length, 1);
});

test('reference contribution shadows the Core keyed renderer explicitly at the public seat', () => {
  const entries = [];
  mountReferenceMessages({
    slots: {
      inject: (name, register) => {
        assert.equal(name, 'conversation.chat.node');
        return register();
      },
      register: (options, component) => {
        entries.push(options);
        assert.equal(component, ReferenceMessage);
        return () => {};
      },
    },
  });
  assert.deepEqual(
    entries,
    ['user', 'steering'].map((key) => ({
      name: 'conversation.chat.node',
      key,
      priority: -1,
      locale: 'chat',
    })),
  );
});
