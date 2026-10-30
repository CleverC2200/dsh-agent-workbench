"""Preserve all FC list sort options with one numeric/text key and bounded atomic pages."""
import json,re
from pathlib import Path
w=Path(__file__).resolve().parents[1];p=w/'business/inventory-fc/sql.config.json';c=json.loads(p.read_text())
def end_cte(s,name):
 m=re.search(r'\b'+name+r' AS\s*\(',s);i=m.end();n=1;quote=False
 while n:
  if s[i]=="'":
   if quote and s[i+1:i+2]=="'":i+=2;continue
   quote=not quote
  if not quote:
   if s[i]=='(':n+=1
   elif s[i]==')':n-=1
  i+=1
 return i
ordinary=c['queries']['replenishment.detail'];fields=ordinary['resultColumns'];sorts=ordinary['parameterSpec']['gea_p4101']['enum'];texts={'warehouse_code','warehouse_name','sku','material_name','category','material_group','plan_source','calculation_status','stat_month','last_ship_date','stock_date'}
number="CASE :gea_p4101 "+' '.join("WHEN '"+f+"' THEN f."+f for f in sorts if f!='key' and f not in texts)+' END'
text="CASE :gea_p4101 "+' '.join("WHEN '"+f+"' THEN CAST(f."+f+" AS VARCHAR(500))" for f in sorts if f in texts)+' END'
def ordering(a):
 return f"{a}.sort_missing ASC, CASE WHEN :gea_p4102='asc' THEN {a}.sort_number END ASC, CASE WHEN :gea_p4102='desc' THEN {a}.sort_number END DESC, CASE WHEN :gea_p4102='asc' THEN {a}.sort_text END ASC, CASE WHEN :gea_p4102='desc' THEN {a}.sort_text END DESC, {a}.warehouse_code,{a}.sku"
for k in ['replenishment.detail','replenishment.detail.atomic']:
 q=c['queries'][k];s=q['request']['sql'];prefix=s[:end_cte(s,'list_filtered')]
 prefix+=', list_sort_values AS (SELECT '+', '.join('f.'+f+' AS '+f for f in fields)+', '+number+' AS sort_number, '+text+' AS sort_text FROM list_filtered AS f)'
 prefix+=', list_sorted AS (SELECT '+', '.join('v.'+f+' AS '+f for f in fields)+', v.sort_number AS sort_number,v.sort_text AS sort_text,CASE WHEN v.sort_number IS NULL AND v.sort_text IS NULL THEN 1 ELSE 0 END AS sort_missing FROM list_sort_values AS v)'
 if k.endswith('.atomic'):
  prefix+=", scope_count AS (SELECT COUNT(*) AS page_scope_total,CASE WHEN COUNT(NULLIF(TRIM(f.material_group),''))>0 THEN 1 ELSE 0 END AS page_scope_has_material_group FROM list_filtered AS f), page_rows AS (SELECT "+', '.join('r.'+f+' AS '+f for f in fields)+',r.sort_number AS sort_number,r.sort_text AS sort_text,r.sort_missing AS sort_missing,1 AS page_row_present FROM list_sorted AS r ORDER BY '+ordering('r')+' LIMIT :gea_p8 OFFSET :gea_p9)'
  sql=prefix+' SELECT '+', '.join('p.'+f+' AS '+f for f in fields)+',s.page_scope_total AS page_scope_total,p.page_row_present AS page_row_present,s.page_scope_has_material_group AS page_scope_has_material_group FROM scope_count AS s LEFT JOIN page_rows AS p ON TRUE ORDER BY '+ordering('p')+' LIMIT :gea_p8'
 else:sql=prefix+' SELECT '+', '.join('r.'+f+' AS '+f for f in fields)+' FROM list_sorted AS r ORDER BY '+ordering('r')+' LIMIT :gea_p8 OFFSET :gea_p9'
 q['request']['sql']=sql
 print(k,len(s),'->',len(sql))
p.write_text(json.dumps(c,ensure_ascii=False,indent=2)+'\n')
