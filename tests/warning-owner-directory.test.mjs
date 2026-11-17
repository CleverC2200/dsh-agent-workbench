import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateOwnerDirectory,createOwnerDirectoryStore} from '../src/warning-owner-directory.mjs';
import {matchWarningOwners,warningOwnerDirectory} from '../src/warning-recipient-routing.mjs';

test('清单维护校验与组合专属优先',()=>{
  const owners=warningOwnerDirectory();
  owners.push({type:'基地×品类',scope:'遂平 × 饺子',name:'刘壮壮',employeeNo:'10008447'});
  assert.equal(validateOwnerDirectory(owners).length,15);
  assert.deepEqual(matchWarningOwners('品类*基地','遂平-水饺（A01）',owners),['gea:10008447']);
  assert.deepEqual(matchWarningOwners('品类*基地','遂平 × 面点',owners),['gea:10007538']);
  assert.deepEqual(matchWarningOwners('基地','华东',[]),[]);
  assert.throws(()=>validateOwnerDirectory([...owners,owners[0]]),/重复/);
  assert.throws(()=>validateOwnerDirectory([{...owners[0],employeeNo:'bad'}]),/有效/);
  assert.throws(()=>validateOwnerDirectory([{...owners[0],scope:'未知'}]),/有效/);
});

test('空清单持久化、用户隔离与过期版本保护',async()=>{
  const values=new Map();
  const pool={async query(sql,args){
    if(sql.startsWith('CREATE'))return {rows:[]};
    const key=args[0],old=values.get(key);
    if(sql.startsWith('SELECT'))return {rows:old?[old]:[]};
    if(sql.startsWith('INSERT')){if(old)return {rows:[]};values.set(key,{revision:1,payload:JSON.parse(args[1])});}
    else{if(!old||old.revision!==args[1])return {rows:[]};values.set(key,{revision:old.revision+1,payload:JSON.parse(args[2])});}
    return {rows:[values.get(key)]};
  }};
  const store=createOwnerDirectoryStore(pool);
  assert.equal((await store.load('one')).owners.length,14);
  await store.save('one',0,[]);
  assert.deepEqual((await store.load('one')).owners,[]);
  assert.equal((await store.load('two')).owners.length,14);
  await assert.rejects(store.save('one',0,warningOwnerDirectory()),/其他窗口/);
  await store.save('one',1,warningOwnerDirectory());
  await assert.rejects(store.save('one',1,[]),/其他窗口/);
  await assert.rejects(store.load(''),/所属用户/);
});
