"""Read the delivered branch order pages from the pending-receipt ASN cohort."""
import json,sqlite3,unittest
from pathlib import Path
import test_fc_upstream_orders as upstream
ROOT=Path(__file__).resolve().parents[1]
class BranchCurrentOrders(unittest.TestCase):
 def setUp(self):
  self.fixture=upstream.UpstreamOrders();self.fixture.setUp();self.addCleanup(self.fixture.doCleanups)
  self.db=self.fixture.db;self.config=json.loads((ROOT/'business/inventory-fc/sql.config.json').read_text())
 def read(self,key='branch-current-orders.page',**values):
  q=self.config['queries'][key];params=q['request']['parameters'].copy()
  values={'warehouse_code':'BR1',**values}
  for k,spec in q['parameterSpec'].items():
   if spec['name'] in values:params[k]=values[spec['name']]
  return [dict(r) for r in self.db.execute(q['request']['sql'],params)]
 def test_prepared_and_unprepared_unreceived_asns_belong_to_receiving_branch(self):
  rows=self.read();self.assertEqual({r['order_no'] for r in rows},{'O1','O3'})
  self.assertEqual(sum(r['demand'] for r in rows),120)
  self.assertEqual(sum(r['shortage'] for r in rows),20)
  self.assertEqual(self.read(warehouse_code='BR2')[0]['shortage'],40)
 def test_closed_and_cancelled_asns_are_excluded_without_using_dealer_orders(self):
  self.db.execute("UPDATE agents_scm_asn_detail_d SET asnstatus='99' WHERE asnreference1='O1'")
  self.db.execute("UPDATE agents_scm_asn_detail_d SET asnstatus='90' WHERE asnreference1='O3'")
  self.assertEqual(self.read()[0]['page_scope_total'],0)
  self.assertIsNone(self.read()[0]['page_row_present'])
 def test_unknown_link_does_not_become_zero_allocation_or_hide_the_order(self):
  self.db.execute("DELETE FROM agents_scm_execute_detail_hourly_d WHERE fromorderno='O1'")
  row=next(r for r in self.read() if r['order_no']=='O1')
  self.assertEqual(row['demand'],70);self.assertIsNone(row['allocated']);self.assertIsNone(row['shortage'])
 def test_paging_search_and_expanded_lines_preserve_the_same_asn_pool(self):
  first=self.read(page_size=1);second=self.read(page_size=1,offset=1)
  self.assertEqual(first[0]['page_scope_total'],2);self.assertNotEqual(first[0]['order_no'],second[0]['order_no'])
  rows=self.read(search_pattern='%O1%');self.assertEqual(rows[0]['page_scope_total'],1)
  line=self.read('branch-current-orders.lines',order_no='O1',customer_code='基地甲')[0]
  self.assertEqual((line['demand'],line['allocated'],line['shortage']),(70,20,0))
if __name__=='__main__':unittest.main()
