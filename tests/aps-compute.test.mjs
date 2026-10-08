import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const manage = resolve('../dsh-agent-manage');
const manifest = JSON.parse(await readFile(resolve(manage, 'package.json'), 'utf8'));
const exported = manifest.exports['./aps-compute/*'];
test('APS公开计算保留原库存、加权订单满足率和未知值', async () => {
  assert.equal(exported?.source, './src/aps-compute/*.ts');
  const result = await build({stdin:{contents:"export * from 'dsh-agent-manage/aps-compute/adapter';",resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'manage-public-compute',setup(api){api.onResolve({filter:/^dsh-agent-manage\/aps-compute\/[a-z-]+$/},({path})=>({path:resolve(manage,exported.source.replace('*',path.split('/').at(-1)))}));}}]});
  const {metricValues}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
  const data={start:'2026-09-01',end:'2026-09-21',granularity:'month',sections:[{id:'stock',status:'ready',rows:[{base:'华东',inventory:20000},{base:'华南',inventory:10000}]},{id:'orders',status:'ready',rows:[{base:'华东',demand:100,shortage:10,invalid:0},{base:'华南',demand:900,shortage:0,invalid:0}]}]};
  assert.equal(metricValues(data)['库存量'],3);
  assert.equal(metricValues(data)['订单满足率'],99);
  assert.equal(metricValues(data,{base:'华东'})['订单满足率'],90);
  assert.ok(Number.isNaN(metricValues(data)['需求预测准确率']));
});
