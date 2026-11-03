"""Read actual plan snapshot SQL under warehouse/category filters and SQL paging."""
import json,sqlite3,unittest
from pathlib import Path
import sqlglot
from sqlglot import exp
ROOT=Path(__file__).resolve().parents[1]

class PlanDetailSnapshot(unittest.TestCase):
 def setUp(self):
  self.c=json.loads((ROOT/'business/inventory-fc/sql.config.json').read_text())
  self.db=sqlite3.connect(':memory:');self.db.row_factory=sqlite3.Row;self.addCleanup(self.db.close)
  self.q=self.c['queries']['snapshot.transfer_plan.detail.atomic']
  fields=sorted({col.name for col in sqlglot.parse_one(self.q['request']['sql'],read='postgres').find_all(exp.Column) if col.table=='m'})
  self.db.execute('CREATE TABLE agents_inv_branch_sku_day ('+','.join(fields)+')')
  for warehouse in ['A110','A020']:
   for i in range(13):
    row={x:None for x in fields};row.update(inv_batch_id='fixture',inv_variant_id='BRANCH_PLAN_DETAIL',warehouseid=warehouse,sku=f'S{i:02}',warehouse_name='沈阳' if warehouse=='A110' else '长沙',material_name=f'产品{i}',category='汤圆' if i<11 else '水饺',daily_movement=(i+0.125 if i else 0),month_out_plan=i*30,future30_qty=0,source_rows=1,period_next_transfer=None)
    self.db.execute('INSERT INTO agents_inv_branch_sku_day ('+','.join(fields)+') VALUES ('+','.join('?' for _ in fields)+')',[row[x] for x in fields])

 def read(self,id='snapshot.transfer_plan.detail.atomic',**overrides):
  q=self.c['queries'][id];params={key:overrides.get(v['name'],q['request']['parameters'][key]) for key,v in q['parameterSpec'].items()};params['gea_p90001']='fixture'
  sql=sqlglot.parse_one(q['request']['sql'],read='postgres').sql(dialect='sqlite')
  return [dict(r) for r in self.db.execute(sql,params)]

 def test_filter_before_page_count_preserves_complete_scope(self):
  filters={'warehouse_code_mode':'equal','warehouse_code':'A110','category_mode':'equal','category':'汤圆','page_size':10}
  first=self.read(**filters);last=self.read(**filters,offset=10)
  self.assertEqual((len(first),len(last)),(10,1));self.assertEqual(last[0]['sku'],'S10')
  self.assertTrue(all(r['page_scope_total']==11 and r['warehouse_code']=='A110' for r in first+last))
  self.assertEqual(self.read('snapshot.transfer_plan.count',**filters),[{'total':11}])

 def test_sort_and_empty_page_do_not_turn_unknown_transfer_into_zero(self):
  rows=self.read(warehouse_code_mode='equal',warehouse_code='A110',sort_by='daily_plan',sort_direction='desc',page_size=2)
  self.assertEqual([r['sku'] for r in rows],['S12','S11'])
  self.assertEqual(rows[0]['daily_plan'],12.125)
  self.assertTrue(all(r['period_next_transfer'] is None for r in rows))
  self.assertTrue(all(r['future30_qty']==0 for r in rows))
  empty=self.read(warehouse_code_mode='equal',warehouse_code='ABSENT')
  self.assertEqual(len(empty),1);self.assertEqual(empty[0]['page_scope_total'],0);self.assertIsNone(empty[0]['page_row_present'])

 def test_runtime_snapshot_uses_only_the_existing_branch_summary(self):
  for id in ['snapshot.transfer_plan.detail','snapshot.transfer_plan.count','snapshot.transfer_plan.detail.atomic']:
   physical={t.name for t in sqlglot.parse_one(self.c['queries'][id]['request']['sql'],read='postgres').find_all(exp.Table) if t.name.startswith('agents_')}
   self.assertEqual(physical,{'agents_inv_branch_sku_day'})

if __name__=='__main__':unittest.main()
