import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
test('未配置的预警后台不会初始化数据库、调度器或创建原型目录', () => {
  const child = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import {installDetection} from './src/detection-backend.mjs';try{await installDetection({effect(){throw Error('must not start effects')}});process.exitCode=1}catch(e){if(e.code!=='DETECTION_NOT_CONFIGURED')throw e;}`,
    ],
    { cwd: process.cwd(), env: { ...process.env, GEA_WARNING_HOME: '' }, encoding: 'utf8' },
  );
  assert.equal(child.status, 0, child.stderr);
});
