import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { customerCardStatusLabel } from '../prototypes/inventory-customer/card-display.js';

test('only unassessed card labels become current scope', () => {
  assert.equal(customerCardStatusLabel('unassessed', '判定标准未定义'), '当前范围');
  for (const label of ['数据不足', '高风险', '大日期风险', '需关注', '暂不评分']) {
    assert.equal(customerCardStatusLabel('other', label), label);
  }
});

test('scope wording is card-only and the removed list scope row stays absent', async () => {
  const source = await readFile(new URL('../prototypes/inventory-customer/application.js', import.meta.url), 'utf8');
  assert.ok(source.includes('Z.default.createElement(Ev,{status:z[N.key],card:true})'));
  assert.ok(source.includes('card?customerCardStatusLabel(r,zv[r].label):zv[r].label'));
  assert.ok(!source.includes('customer-list-scope'));
  assert.ok(!source.includes('顶部卡片按角色及组织范围汇总'));
});
