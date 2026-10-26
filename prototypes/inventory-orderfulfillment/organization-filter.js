export function organizationSelection(value) {
  if(value.startsWith('group:')) { try { const [province,sales_group]=JSON.parse(value.slice(6)); return {province:province||null,sales_group:sales_group||null}; } catch { return {}; } }
  return {province:value.startsWith('province:')?value.slice(9):null,sales_group:value.startsWith('org:')?value.slice(4):null};
}
export function mountOrganizationFilter(select) {
  const doc=select.ownerDocument, pairs=new Map(); let active='';
  const box=doc.createElement('div'); box.className='fulfillment-org-picker delivery-filter-only';
  const trigger=doc.createElement('button'); trigger.type='button';trigger.className='fulfillment-org-trigger';trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-label','选择省区 / 销售组');
  const menu=doc.createElement('div');menu.className='fulfillment-org-menu';menu.hidden=true;
  const provinces=doc.createElement('div'),groups=doc.createElement('div');menu.append(provinces,groups);box.append(trigger,menu);select.after(box);select.classList.add('fulfillment-org-source');select.tabIndex=-1;select.setAttribute('aria-hidden','true');
  const sorted=values=>[...new Set(values)].sort((a,b)=>a.localeCompare(b,'zh-CN'));
  function close(){menu.hidden=true;trigger.setAttribute('aria-expanded','false');}
  function choose(value,label){if(![...select.options].some(x=>x.value===value))select.append(new doc.defaultView.Option(label,value));select.value=value;close();sync();select.dispatchEvent(new doc.defaultView.Event('change',{bubbles:true}));}
  function button(parent,label,selected,fn){const b=doc.createElement('button');b.type='button';b.textContent=label;b.classList.toggle('active',selected);b.addEventListener('click',fn);parent.append(b);return b;}
  function heading(parent,text){const h=doc.createElement('div');h.className='fulfillment-org-heading';h.textContent=text;parent.append(h);}
  function position(){const rect=trigger.getBoundingClientRect(),viewport=doc.documentElement.clientWidth,width=Math.min(groups.hidden?300:420,Math.max(200,viewport-24));Object.assign(menu.style,{position:'fixed',width:width+'px',left:Math.max(12,Math.min(rect.left,viewport-width-12))+'px',right:'auto',top:(rect.bottom+6)+'px'});}
  function render(){
    provinces.replaceChildren();groups.replaceChildren();heading(provinces,'省区');heading(groups,'销售组');
    button(provinces,'全部省区',!active,()=>{active='';choose('','全部');});
    for(const p of sorted([...pairs.values()].map(x=>x[0]).filter(Boolean))){const hasGroups=[...pairs.values()].some(([province,group])=>province===p&&group);button(provinces,p+(hasGroups?' ›':''),active===p,()=>{if(!hasGroups){choose('province:'+p,p);return;}active=p;render();position();});}
    button(groups,active?'该省区全部销售组':'全部销售组',!organizationSelection(select.value).sales_group,()=>choose(active?'province:'+active:'',active||'全部'));
    const names=sorted([...pairs.values()].filter(([p])=>!active||p===active).map(x=>x[1]).filter(Boolean));
    for(const g of names){const value=active?'group:'+JSON.stringify([active,g]):'org:'+g;button(groups,g,select.value===value,()=>choose(value,active?active+' / '+g:g));}
    groups.hidden=!names.length;menu.classList.toggle('single-column',groups.hidden);
  }
  function sync(){const selection=organizationSelection(select.value);trigger.textContent=selection.sales_group?[selection.province,selection.sales_group].filter(Boolean).join(' / '):selection.province||select.selectedOptions[0]?.textContent||'选择省区 / 销售组';if(!select.value)trigger.textContent=[...pairs.values()].some(([,group])=>group)?'选择省区 / 销售组':'全部省区';}
  trigger.addEventListener('click',()=>{menu.hidden=!menu.hidden;trigger.setAttribute('aria-expanded',String(!menu.hidden));if(!menu.hidden){active=organizationSelection(select.value).province||'';render();position();}});
  doc.defaultView.addEventListener('resize',close);
  doc.addEventListener('click',event=>{if(!event.composedPath().includes(box))close();});box.addEventListener('keydown',event=>{if(event.key==='Escape'){close();trigger.focus();}});select.addEventListener('change',sync);sync();
  return {update(rows){for(const row of rows){const pair=[row.province_region_name||'',row.sales_group_name||''];if(pair.some(Boolean))pairs.set(JSON.stringify(pair),pair);}sync();if(!menu.hidden){render();position();}},sync,reset(){pairs.clear();active='';select.value='';close();sync();}};
}
