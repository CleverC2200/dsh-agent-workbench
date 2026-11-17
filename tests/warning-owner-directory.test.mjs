import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateOwnerDirectory } from '../src/warning-owner-directory.mjs';
import { matchWarningOwners, warningOwnerDirectory } from '../src/warning-recipient-routing.mjs';

test('清单维护校验与组合专属优先', () => {
  assert.deepEqual(warningOwnerDirectory(), []);
  const owners = [
    { type: '基地', scope: '遂平', name: '测试一', employeeNo: '10000001' },
    { type: '品类', scope: '面点', name: '测试一', employeeNo: '10000001' },
  ];
  owners.push({ type: '基地×品类', scope: '遂平 × 饺子', name: '刘壮壮', employeeNo: '10008447' });
  assert.equal(validateOwnerDirectory(owners).length, 3);
  assert.deepEqual(matchWarningOwners('品类*基地', '遂平-水饺（A01）', owners), ['gea:10008447']);
  assert.deepEqual(matchWarningOwners('品类*基地', '遂平 × 面点', owners), ['gea:10000001']);
  assert.deepEqual(matchWarningOwners('基地', '华东', []), []);
  assert.throws(() => validateOwnerDirectory([...owners, owners[0]]), /重复/);
  assert.throws(() => validateOwnerDirectory([{ ...owners[0], employeeNo: 'bad' }]), /有效/);
  assert.throws(() => validateOwnerDirectory([{ ...owners[0], scope: '未知' }]), /有效/);
});
