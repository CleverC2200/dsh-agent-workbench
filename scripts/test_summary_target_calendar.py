"""Use only visible batch metadata when a base account cannot see global calendar rows."""
import json,sqlite3,unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

class ScopedTargetCalendar(unittest.TestCase):
    def run_query(self,agent,rows,count=False):
        c=json.loads((ROOT/f'business/inventory-{agent}/sql.config.json').read_text())
        q=c['queries']['snapshot.calendar.target_versions'+('.count' if count else '')]
        with sqlite3.connect(':memory:') as db:
            db.row_factory=sqlite3.Row
            db.execute('CREATE TABLE agents_inv_base_sku_day (inv_batch_id TEXT, inv_variant_id TEXT, month TEXT, effective_version TEXT, version_source_rows INTEGER)')
            db.executemany('INSERT INTO agents_inv_base_sku_day VALUES(?,?,?,?,?)',rows)
            values=dict(q['request']['parameters'])
            for key,spec in q['parameterSpec'].items():
                if spec['name']=='summary_batch_id':values[key]='BATCH'
            return [dict(r) for r in db.execute(q['request']['sql'],values)]

    def test_visible_ready_markers_resolve_version_without_global_calendar(self):
        for agent in ['aqkc','fc','qll']:
            with self.subTest(agent=agent):
                rows=[('BATCH','__BASE_READY__','2026-11-01','月初',None)]*2
                self.assertEqual(self.run_query(agent,rows),[{'month':'2026-11-01','inventory_version':'月初','source_rows':0}])
                self.assertEqual(self.run_query(agent,rows,True),[{'total':1}])

    def test_authorized_global_history_counts_and_versions_remain_unchanged(self):
        rows=[('BATCH','TARGET_CALENDAR','2026-10-01','滚动',120),('BATCH','TARGET_CALENDAR','2026-11-01','月初',80),('BATCH','__BASE_READY__','2026-11-01','月初',None)]
        for agent in ['aqkc','fc','qll']:
            with self.subTest(agent=agent):
                result=self.run_query(agent,rows)
                self.assertEqual(result,[{'month':'2026-11-01','inventory_version':'月初','source_rows':80},{'month':'2026-10-01','inventory_version':'滚动','source_rows':120}])
                self.assertEqual(self.run_query(agent,rows,True),[{'total':2}])

    def test_absent_or_old_batch_metadata_does_not_invent_a_publication(self):
        rows=[('OLD','__BASE_READY__','2026-11-01','月初',None),('BATCH','__BASE_READY__','2026-11-01',None,None)]
        for agent in ['aqkc','fc','qll']:
            with self.subTest(agent=agent):
                self.assertEqual(self.run_query(agent,rows),[])

if __name__=='__main__':unittest.main()
