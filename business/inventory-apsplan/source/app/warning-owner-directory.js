const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const bases=['华东','华南','西南','遂平','郑州'];
const categories=['汤圆','饺子','调理肉制品','面点','休闲','馄饨','饼类','火锅','其余'];

export async function renderOwnerDirectory(main,api) {
  main.classList.remove('am-editing');
  main.classList.add('am-owner-page');
  const view=document.createElement('section');
  view.className='am-owner-view';
  main.replaceChildren(view);
  let owners=[],revision=0,filter='',keyword='',busy=false;
  const active=()=>main.contains(view);
  async function load(){
    view.innerHTML='<p role="status">正在加载责任人清单…</p>';
    try{const result=await api({op:'owner-directory'});if(!active())return;owners=result.owners;revision=result.revision;render();}
    catch(error){if(!active())return;view.innerHTML='<p role="alert">'+escape(error.message)+'</p><button data-retry>重新加载</button>';view.querySelector('[data-retry]').onclick=load;}
  }
  async function save(next){
    if(busy)return false;
    busy=true;view.querySelectorAll('button').forEach(button=>button.disabled=true);
    try{const result=await api({op:'owner-directory-save',revision,owners:next});if(!active())return false;owners=result.owners;revision=result.revision;return true;}
    catch(error){if(active())view.querySelector('[data-status]').textContent=error.message;return false;}
    finally{busy=false;if(active())view.querySelectorAll('button').forEach(button=>button.disabled=false);}
  }
  function render(){
    view.innerHTML='<div class="am-toolbar"><div><h3>责任人清单</h3><p>用于当前账号的自动预警推送，修改后从下次检测生效。</p></div><button class="am-primary" data-add>＋ 新增责任人</button></div><div class="am-owner-guide">组合专属负责人优先；未配置时匹配基地及品类负责人。同次检测中，同一人收到一条汇总消息。</div><div class="am-owner-filters"><label>责任类型<select data-filter><option value="">全部类型</option><option>基地</option><option>品类</option><option>基地×品类</option></select></label><label>搜索<input data-search type="search" placeholder="范围、姓名或工号"></label><button data-refresh>刷新</button></div><p data-status role="status"></p><div class="am-table am-owner-table"><table><thead><tr><th>责任类型</th><th>责任范围</th><th>责任人</th><th>工号</th><th>操作</th></tr></thead><tbody></tbody></table></div><p data-count class="am-owner-count"></p>';
    view.querySelector('[data-filter]').value=filter;
    view.querySelector('[data-search]').value=keyword;
    const rows=()=>{
      const selected=owners.map((row,index)=>({row,index})).filter(({row})=>(!filter||row.type===filter)&&(!keyword||[row.scope,row.name,row.employeeNo].some(value=>value.includes(keyword))));
      view.querySelector('tbody').innerHTML=selected.map(({row,index})=>'<tr><td>'+escape(row.type)+'</td><td>'+escape(row.scope)+'</td><td>'+escape(row.name)+'</td><td>'+escape(row.employeeNo)+'</td><td><div class="am-owner-actions"><button data-edit="'+index+'">修改</button><button data-remove="'+index+'">删除</button></div></td></tr>').join('')||'<tr><td colspan="5" class="am-empty">暂无匹配的责任关系</td></tr>';
      view.querySelector('[data-count]').textContent='当前 '+selected.length+' 条 · 共 '+owners.length+' 条责任关系';
      view.querySelectorAll('[data-edit]').forEach(button=>button.onclick=()=>edit(Number(button.dataset.edit)));
      view.querySelectorAll('[data-remove]').forEach(button=>button.onclick=async()=>{const index=Number(button.dataset.remove),row=owners[index];if(!confirm('删除“'+row.scope+' · '+row.name+'”责任关系？后续检测将重新匹配接收人。'))return;if(await save(owners.filter((_,i)=>i!==index)))render();});
    };
    view.querySelector('[data-filter]').onchange=event=>{filter=event.target.value;rows();};
    view.querySelector('[data-search]').oninput=event=>{keyword=event.target.value.trim();rows();};
    view.querySelector('[data-add]').onclick=()=>edit(-1);
    view.querySelector('[data-refresh]').onclick=load;
    rows();
  }
  function edit(index){
    const row=owners[index];
    view.innerHTML='<div class="am-toolbar"><h3>'+(row?'修改责任关系':'新增责任关系')+'</h3></div><form class="am-owner-form"><label>责任类型<select name="type"><option>基地</option><option>品类</option><option>基地×品类</option></select></label><label data-base>基地<select name="base">'+bases.map(value=>'<option>'+value+'</option>').join('')+'</select></label><label data-category>品类<select name="category">'+categories.map(value=>'<option>'+value+'</option>').join('')+'</select></label><label>责任人姓名<input name="name" maxlength="80" required placeholder="与飞书登记姓名一致"></label><label>工号<input name="employeeNo" inputmode="numeric" pattern="[0-9]{5,20}" maxlength="20" required placeholder="输入员工工号"></label><p class="am-owner-hint">保存时核验新增或变更的工号与飞书姓名。相同范围可以配置多位责任人。</p><p data-status role="alert"></p><footer><button type="button" data-cancel>取消</button><button class="am-primary" type="submit">保存责任关系</button></footer></form>';
    const form=view.querySelector('form');
    if(row){form.elements.type.value=row.type;form.elements.name.value=row.name;form.elements.employeeNo.value=row.employeeNo;if(row.type==='基地')form.elements.base.value=row.scope;else if(row.type==='品类')form.elements.category.value=row.scope;else{const parts=row.scope.split(' × ');form.elements.base.value=parts[0];form.elements.category.value=parts[1];}}
    const sync=()=>{view.querySelector('[data-base]').hidden=form.elements.type.value==='品类';view.querySelector('[data-category]').hidden=form.elements.type.value==='基地';};
    form.elements.type.onchange=sync;sync();
    view.querySelector('[data-cancel]').onclick=render;
    form.onsubmit=async event=>{event.preventDefault();if(busy||!form.reportValidity())return;const type=form.elements.type.value;const value={type,scope:type==='基地'?form.elements.base.value:type==='品类'?form.elements.category.value:form.elements.base.value+' × '+form.elements.category.value,name:form.elements.name.value.trim(),employeeNo:form.elements.employeeNo.value.trim()};const next=owners.slice();if(index<0)next.push(value);else next[index]=value;view.querySelector('[data-status]').textContent='正在核验并保存…';if(await save(next))render();};
  }
  await load();
}
