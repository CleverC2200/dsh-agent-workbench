import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { resolve } from 'node:path';

for (const agent of ['fc', 'aqkc', 'qll']) {
  test(`${agent}: reconnect renews the page lease without invalidating a completed query cache`, async (t) => {
    const built = await build({
      entryPoints: [
        `business/inventory-${agent}/source/inventory-light-plugins/src/native/entry.tsx`,
      ],
      bundle: true,
      write: false,
      format: 'iife',
      platform: 'browser',
      alias: {
        react: resolve('node_modules/react'),
        'react-dom': resolve('node_modules/react-dom'),
      },
      define: { PLUGIN_ID: JSON.stringify(agent), 'process.env.NODE_ENV': '"test"' },
      loader: { '.css': 'empty' },
      plugins: [
        {
          name: 'page-lifecycle-seam',
          setup(b) {
            b.onResolve({ filter: /^@business-page$|configured-workbench$/ }, () => ({
              path: 'page',
              namespace: 'fixture',
            }));
            b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
              contents: `import React from 'react';import{configuredQueryFreshAfter}from '${process.cwd()}/business/shared/query-cache.ts';export default function Page(){window.mounts=(window.mounts||0)+1;window.freshness=configuredQueryFreshAfter;return React.createElement('div',{'data-fixture-page':true},'ready')}`,
              loader: 'tsx',
              resolveDir: process.cwd(),
            }));
            b.onResolve({ filter: /^@business-style$/ }, () => ({
              path: 'style',
              namespace: 'empty',
            }));
            b.onLoad({ filter: /.*/, namespace: 'empty' }, () => ({ contents: '' }));
            b.onLoad({ filter: /[/\\]native[/\\]api\.ts$/ }, () => ({
              contents:
                'export async function mountBusinessFetch(){};export function clearBusinessCache(){}',
            }));
            b.onLoad({ filter: /[/\\]channel\.js$/ }, () => ({
              contents:
                'export const ready=Promise.resolve();export function action(){};export async function call(){}',
            }));
            b.onLoad({ filter: /[/\\]native[/\\]context\.ts$/ }, () => ({
              contents:
                'export function updateContext(){};export function clearContext(){};export function removeContextPart(){}',
            }));
          },
        },
      ],
    });
    const dom = new JSDOM('<main id="app"></main>', {
      url: 'http://fixture.test',
      runScripts: 'dangerously',
      pretendToBeVisual: true,
    });
    t.after(() => dom.window.close());
    dom.window.eval(built.outputFiles[0].text);
    const until = async (fn) => {
      for (let i = 0; i < 100; i++) {
        if (fn()) return;
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      throw Error('page did not mount');
    };
    await until(() => dom.window.document.querySelector('[data-fixture-page]'));
    const before = dom.window.freshness();
    const mounts = dom.window.mounts;
    dom.window.dispatchEvent(new dom.window.Event('gea-session-changing'));
    dom.window.dispatchEvent(new dom.window.Event('gea-session-changed'));
    await until(() => dom.window.mounts > mounts);
    assert.equal(
      dom.window.freshness(),
      before,
      'ordinary reconnect must preserve the Host cache freshness boundary',
    );
    const reconnected = dom.window.mounts;
    dom.window.dispatchEvent(new dom.window.Event('gea-page-refresh'));
    await until(() => dom.window.mounts > reconnected);
    assert.ok(dom.window.freshness() > before, 'explicit refresh must bypass completed caches');
  });
}
