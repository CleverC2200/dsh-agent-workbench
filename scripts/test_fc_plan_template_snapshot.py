"""Compare real source and snapshot template queries with paging and conflicting rows."""
import json
from pathlib import Path
import sqlite3
import unittest
import sqlglot
from sqlglot import exp

ROOT=Path(__file__).resolve().parents[1]

class TemplateSnapshot(unittest.TestCase):
    def setUp(self):
        self.config=json.loads((ROOT/'business/inventory-fc/sql.config.json').read_text())
        self.db=sqlite3.connect(':memory:');self.db.row_factory=sqlite3.Row
        self.addCleanup(self.db.close)
        self.db.execute('CREATE TABLE agents_scm_warehouse_transfer_plan_data_d (warehouseid,material_code,warehouse_name,material_name,product_categ_name,warehouse_month_out_plan,warehouse_future30_qty,warehouse_month_transfer_plan,stat_month)')
        records=[('A110',f'S{i:02}','沈阳',f'产品{i}','汤圆',i,0,None,'202611') for i in range(13)]
        records += [('A110','S01','沈阳','冲突','汤圆',999,2,3,'202611'),('A110','S00','沈阳','产品0','汤圆',5,6,7,'202612'),('A020','OTHER','长沙','其他','水饺',1,2,3,'202611')]
        self.db.executemany('INSERT INTO agents_scm_warehouse_transfer_plan_data_d VALUES(?,?,?,?,?,?,?,?,?)',records)
        fields=set()
        for id in ['transfer_plan.template','transfer_plan.template.count','transfer_plan.template.atomic']:
            for column in sqlglot.parse_one(self.config['queries']['snapshot.'+id]['request']['sql'],read='postgres').find_all(exp.Column):
                if column.table=='m':fields.add(column.name)
        self.fields=sorted(fields)
        self.db.execute('CREATE TABLE agents_inv_branch_sku_day ('+','.join(self.fields)+')')
        q=self.config['queries']['transfer_plan.template']
        t=sqlglot.parse_one(q['request']['sql'],read='postgres')
        for attr in ['limit','offset','order']:t.set(attr,None)
        t.select('r.category AS category',append=True,copy=False)
        rows=self.execute(t.sql(dialect='postgres'),self.values(q,month='2026-11-01',next_month='2026-12-01'))
        for row in rows:
            record={**row,'warehouseid':row['warehouse_code'],'inv_batch_id':'fixture','inv_variant_id':'BRANCH_PLAN_TEMPLATE'}
            self.db.execute('INSERT INTO agents_inv_branch_sku_day ('+','.join(self.fields)+') VALUES ('+','.join('?' for _ in self.fields)+')',[record.get(x) for x in self.fields])

    def values(self,q,**overrides):
        return {key:overrides.get(spec['name'],q['request']['parameters'][key]) for key,spec in q['parameterSpec'].items()}

    def execute(self,sql,params):
        sqlite_sql=sqlglot.parse_one(sql,read='postgres').sql(dialect='sqlite')
        return [dict(row) for row in self.db.execute(sqlite_sql,params)]

    def read(self,id,summary=False,**values):
        q=self.config['queries'][('snapshot.' if summary else '')+id]
        return self.execute(q['request']['sql'],self.values(q,month='2026-11-01',next_month='2026-12-01',summary_batch_id='fixture',**values))

    def test_full_result_filter_and_each_page_match(self):
        for offset in [0,10,20]:
            with self.subTest(offset=offset):
                values={'page_size':10,'offset':offset,'warehouse_code_mode':'equal','warehouse_code':'A110'}
                for id in ['transfer_plan.template','transfer_plan.template.atomic','transfer_plan.template.count']:
                    self.assertEqual(self.read(id,**values),self.read(id,summary=True,**values))

    def test_duplicate_zero_null_and_next_month_preserve_source_semantics(self):
        rows=self.read('transfer_plan.template',summary=True,page_size=200,warehouse_code_mode='equal',warehouse_code='A110')
        first,conflict=rows[0],rows[1]
        self.assertEqual((first['month_out_plan'],first['future30_qty'],first['period_next_transfer']),(0,0,7))
        self.assertIsNone(first['warehouse_month_transfer_plan'])
        self.assertEqual(conflict['source_rows'],2)
        self.assertIsNone(conflict['month_out_plan']);self.assertIsNone(conflict['stat_month'])
        self.assertEqual(rows,self.read('transfer_plan.template',page_size=200,warehouse_code_mode='equal',warehouse_code='A110'))

    def test_snapshot_does_not_read_source_plan_or_other_tables(self):
        for id in ['transfer_plan.template','transfer_plan.template.atomic','transfer_plan.template.count']:
            tree=sqlglot.parse_one(self.config['queries']['snapshot.'+id]['request']['sql'],read='postgres')
            physical={t.name for t in tree.find_all(exp.Table) if t.name.startswith('agents_')}
            self.assertEqual(physical,{'agents_inv_branch_sku_day'})

if __name__=='__main__':unittest.main()
