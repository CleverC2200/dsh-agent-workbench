import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  mountOrganizationFilter,
  organizationSelection,
} from '../prototypes/inventory-orderfulfillment/organization-filter.js';
test('province and sales group selection preserves siblings after filtered updates and resets on identity change', () => {
  const dom = new JSDOM('<select id="org"><option value="">全部</option></select>');
  const d = dom.window.document,
    s = d.getElementById('org'),
    picker = mountOrganizationFilter(s);
  const rows = [
    { province_region_name: '华南省区', sales_group_name: '广州组' },
    { province_region_name: '华南省区', sales_group_name: '深圳组' },
    { province_region_name: '华北省区', sales_group_name: '北京组' },
  ];
  picker.update(rows);
  const trigger = d.querySelector('.fulfillment-org-trigger');
  trigger.click();
  const menu = d.querySelector('.fulfillment-org-menu');
  const click = (text) => {
    const b = [...menu.querySelectorAll('button')].find((b) => b.textContent === text);
    assert.ok(b, text);
    b.click();
  };
  click('华南省区 ›');
  assert.equal(menu.hidden, false);
  assert.ok(menu.textContent.includes('广州组'));
  assert.ok(!menu.querySelector('div:nth-child(2)').textContent.includes('北京组'));
  let changes = 0;
  s.addEventListener('change', () => changes++);
  click('深圳组');
  assert.deepEqual(organizationSelection(s.value), { province: '华南省区', sales_group: '深圳组' });
  assert.equal(changes, 1);
  assert.equal(menu.hidden, true);
  picker.update([rows[1]]);
  trigger.click();
  assert.ok(menu.textContent.includes('华北省区'));
  click('华北省区 ›');
  click('该省区全部销售组');
  assert.equal(s.value, 'province:华北省区');
  trigger.click();
  click('全部省区');
  assert.equal(s.value, '');
  picker.reset();
  trigger.click();
  assert.ok(!menu.textContent.includes('华南省区'));
  dom.window.close();
});
test('legacy province and sales group values remain compatible', () => {
  assert.deepEqual(organizationSelection('province:河南'), { province: '河南', sales_group: null });
  assert.deepEqual(organizationSelection('org:郑州组'), { province: null, sales_group: '郑州组' });
});

test('a province without sales groups applies directly without an empty column or arrow', () => {
  const dom = new JSDOM('<select><option value="">全部</option></select>'),
    d = dom.window.document,
    s = d.querySelector('select'),
    p = mountOrganizationFilter(s);
  p.update([{ province_region_name: '河南省区', sales_group_name: null }]);
  d.querySelector('.fulfillment-org-trigger').click();
  const menu = d.querySelector('.fulfillment-org-menu');
  assert.equal(menu.lastElementChild.hidden, true);
  assert.ok(!menu.textContent.includes('未提供'));
  const b = [...menu.querySelectorAll('button')].find((x) => x.textContent === '河南省区');
  assert.ok(b);
  b.click();
  assert.equal(s.value, 'province:河南省区');
  assert.equal(menu.hidden, true);
  dom.window.close();
});
