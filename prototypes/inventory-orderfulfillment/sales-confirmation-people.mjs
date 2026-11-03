/** Only selects people returned by the authenticated GEA directory; grants remain server-owned. */
export function mountSalesConfirmationPeople(document, formal, alive, changed) {
  const node = (tag, text) => {
    const value = document.createElement(tag);
    if (text != null) value.textContent = text;
    return value;
  };
  const element = node('section');
  element.setAttribute('aria-label', '飞书收件人与处理人');
  const modeLabel = node('p', '正在读取发卡模式…');
  const query = node('input');
  query.type = 'search';
  query.maxLength = 80;
  query.placeholder = '按姓名查找已授权人员';
  query.setAttribute('aria-label', '查找收件人');
  const search = node('button', '查找');
  search.type = 'button';
  const recipients = node('select');
  recipients.multiple = true;
  recipients.size = 4;
  recipients.setAttribute('aria-label', '被艾特人员');
  const handler = node('select');
  handler.setAttribute('aria-label', '确认与暂缓处理人');
  const notice = node('p');
  notice.role = 'status';
  const hint = node(
    'p',
    '人员需在 GEA「用户能力授权」中获授对应能力。被艾特可查看，只有指定处理人可保存确认／暂缓决定。',
  );
  const recipientLabel = node('label', '被艾特人员（最多 10 人，可多选）');
  recipientLabel.append(recipients);
  const handlerLabel = node('label', '确认与暂缓处理人');
  handlerLabel.append(handler);
  element.append(modeLabel, query, search, recipientLabel, handlerLabel, hint, notice);
  let mode,
    loading = false,
    searchGeneration = 0,
    edited = false,
    visible = [];
  const people = new Map(),
    selected = new Set();
  function render() {
    recipients.replaceChildren();
    for (const id of new Set([...selected, ...visible])) {
      const person = people.get(id);
      if (!person) continue;
      const option = node(
        'option',
        person.displayName + (person.canProcess ? '（可处理）' : '（仅查看）'),
      );
      option.value = id;
      option.selected = selected.has(id);
      recipients.append(option);
    }
    const previous = handler.value;
    handler.replaceChildren();
    if (mode === 'sales') {
      const option = node('option', '订单对应销售（由后台确定）');
      option.value = '';
      handler.append(option);
      handler.disabled = true;
    } else {
      handler.disabled = false;
      for (const id of selected)
        if (people.get(id)?.canProcess) {
          const option = node('option', people.get(id).displayName);
          option.value = id;
          handler.append(option);
        }
      if ([...handler.options].some((option) => option.value === previous))
        handler.value = previous;
    }
    modeLabel.textContent =
      mode === 'test'
        ? '发卡模式：测试联调（不执行 OMS）'
        : '发卡模式：按订单销售分派（OMS 尚未接入）';
    changed();
  }
  async function load() {
    const current = ++searchGeneration;
    loading = true;
    search.disabled = true;
    changed();
    notice.textContent = '正在读取已授权人员…';
    try {
      const result = await formal.participants(query.value.trim());
      if (!alive() || current !== searchGeneration) return;
      if (!['test', 'sales'].includes(result.mode) || !Array.isArray(result.participants))
        throw Error('后台未返回有效的人员目录，请核对接口版本');
      mode = result.mode;
      visible = [];
      for (const person of result.participants) {
        if (
          typeof person.userId !== 'string' ||
          typeof person.displayName !== 'string' ||
          typeof person.canProcess !== 'boolean'
        )
          throw Error('人员目录响应无效');
        people.set(person.userId, { ...person });
        visible.push(person.userId);
      }
      if (!edited && !selected.size && visible.includes(result.currentUserId))
        selected.add(result.currentUserId);
      notice.textContent = visible.length
        ? '仅显示当前应用内已有映射且已授权的人员。'
        : '未找到可接收卡片的人员，请先在 GEA 后台配置查看、处理及测试联调授权。';
      if (result.hasMore) notice.textContent += ' 请缩小姓名范围继续查找。';
      render();
    } catch (error) {
      if (alive() && current === searchGeneration) {
        mode = undefined;
        notice.textContent = error.message;
      }
    } finally {
      if (alive() && current === searchGeneration) {
        loading = false;
        search.disabled = false;
        changed();
      }
    }
  }
  recipients.onchange = () => {
    edited = true;
    selected.clear();
    for (const option of recipients.selectedOptions) selected.add(option.value);
    render();
  };
  handler.onchange = changed;
  search.onclick = () => void load();
  query.onkeydown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void load();
    }
  };
  const valid = () =>
    !loading &&
    ['test', 'sales'].includes(mode) &&
    selected.size <= 10 &&
    (mode === 'sales' ||
      (selected.size > 0 &&
        selected.has(handler.value) &&
        people.get(handler.value)?.canProcess === true));
  return {
    element,
    load,
    valid,
    delivery() {
      if (!valid()) throw Error('请选择已授权的收件人与处理人');
      return {
        recipientUserIds: [...selected],
        ...(mode === 'test' ? { handlerUserId: handler.value } : {}),
      };
    },
  };
}
