import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveBusinessMenu } from '../src/company/navigation.ts';
import { zh } from '../src/company/locales.ts';

test('planning menu removes the requested entries without moving them into fallback groups', () => {
  for (const domains of [
    { kind: 'available', items: [{ value: 'market', text: '市场', description: null }] },
    { kind: 'unavailable', message: '暂不可用' },
  ]) {
    const groups = resolveBusinessMenu(
      {
        domains,
        agents: [
          { id: 'category', agentCode: '04', agentName: '品类计划Agent', businessDomain: 'market' },
          {
            id: 'regional',
            agentCode: 'area_plan',
            agentName: '区域计划Agent',
            businessDomain: 'market',
          },
          {
            id: 'production',
            agentCode: '02',
            agentName: '品类与生产计划Agent',
            businessDomain: null,
          },
          { id: 'mps', agentCode: 'mps', agentName: '主生产计划Agent', businessDomain: 'market' },
          {
            id: 'unknown',
            agentCode: 'future',
            agentName: '未来业务Agent',
            businessDomain: 'market',
          },
        ],
      },
      new Map([['plan-category-production', 'MPS']]),
      (key) => zh[key],
    );
    const entries = groups.flatMap((group) => group.entries);
    assert.equal(entries.find((entry) => entry.id === 'category').title, '计划管理工作台');
    assert.equal(
      entries.find((entry) => entry.id === 'regional'),
      undefined,
    );
    assert.equal(
      entries.find((entry) => entry.id === 'production'),
      undefined,
    );
    assert.equal(entries.find((entry) => entry.id === 'mps').pageId, 'plan-category-production');
    assert.equal(entries.find((entry) => entry.id === 'mps').disabled, false);
    assert.equal(entries.find((entry) => entry.id === 'unknown').title, '未来业务');
  }
});
