'use strict';
//update-begin---author:Codex ---date:2026-11-02 for：【订单履约缺货订单处理】草稿与订单快照隔离，未知值保留横线，未接改单禁止提交-----------
window.OrderShortageEditor = (() => {
  const number = (value) =>
    (typeof value === 'number' || typeof value === 'string') &&
    String(value).trim() !== '' &&
    Number.isFinite(Number(value)) &&
    Number(value) >= 0
      ? Number(value)
      : null;
  const display = (value) =>
    number(value) === null
      ? '—'
      : new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 6 }).format(Number(value));
  const quantityText = (value) => (number(value) === null ? '—' : display(value) + ' 箱');
  function mount(document, state) {
    const root = document.getElementById('orderEditor');
    const snapshot = state.snapshot || {},
      capabilities = state.editor || {};
    const original = Array.isArray(snapshot.lines) ? snapshot.lines : [];
    if (
      original.length > 200 ||
      original.some((line) => !line.sku) ||
      new Set(original.map((line) => String(line.sku))).size !== original.length
    )
      throw Error('订单商品数据不完整，无法打开处理页');
    const lines = original.map((line) => ({
      ...line,
      sku: String(line.sku),
      originalQuantity: number(line.quantity),
      draftQuantity: number(line.quantity),
    }));
    const editable = state.status === 'pending' && capabilities.editable === true;
    let page = 'order',
      search = '',
      category = '全部';
    function node(tag, text, className) {
      const item = document.createElement(tag);
      if (text !== undefined) item.textContent = text;
      if (className) item.className = className;
      return item;
    }
    function button(label, action, disabled = false, className) {
      const item = node('button', label, className);
      item.type = 'button';
      item.disabled = disabled;
      item.addEventListener('click', action);
      return item;
    }
    function selected() {
      return lines.filter((line) => line.draftQuantity === null || line.draftQuantity > 0);
    }
    function total() {
      const values = selected();
      return values.some((line) => line.draftQuantity === null)
        ? null
        : values.reduce((sum, line) => sum + line.draftQuantity, 0);
    }
    function countText() {
      return `已选商品：${selected().length} 种 · 数量：${quantityText(total())}`;
    }
    function updateTotals() {
      root.querySelectorAll('[data-editor-count]').forEach((item) => {
        item.textContent = countText();
      });
    }
    function renderLine(line) {
      const article = node('article');
      article.dataset.sku = line.sku;
      const image = node('div', '商品', 'editor-image');
      image.setAttribute('aria-hidden', 'true');
      const info = node('div', undefined, 'editor-item-info');
      info.append(node('strong', line.name || '商品名称未提供'), node('small', 'SKU：' + line.sku));
      const shortage = number(line.shortage);
      if (shortage !== null && shortage > 0)
        info.append(node('p', `库存不足：原订单缺货 ${display(shortage)} 箱`, 'editor-warning'));
      else if (shortage === null)
        info.append(node('p', '库存是否充足：—（缺货数据未完整提供）', 'editor-note'));
      info.append(
        node('p', `原订货：${quantityText(line.originalQuantity)}；价格：—`, 'editor-note'),
      );
      const controls = node('div', undefined, 'editor-quantity');
      const input = node('input');
      input.type = 'number';
      input.min = '0';
      input.step = 'any';
      input.value = line.draftQuantity === null ? '' : String(line.draftQuantity);
      input.placeholder = '—';
      input.setAttribute('aria-label', `${line.sku} 数量`);
      input.disabled = !editable || line.originalQuantity === null;
      if (line.originalQuantity === null) input.title = '原始订货数量未完整提供，不能擅自补成 0';
      const apply = (value) => {
        if (!editable || line.originalQuantity === null) return;
        const quantity = number(value);
        if (quantity === null) {
          input.setCustomValidity('请输入非负有效数量');
          input.value = String(line.draftQuantity);
          return;
        }
        input.setCustomValidity('');
        line.draftQuantity = quantity;
        input.value = String(quantity);
        updateTotals();
      };
      const minus = button(
        '−',
        () => {
          apply(Math.max(0, line.draftQuantity - 1));
          minus.disabled = !editable || line.draftQuantity === 0;
        },
        !editable || line.draftQuantity === null || line.draftQuantity === 0,
      );
      minus.setAttribute('aria-label', `${line.sku} 减少`);
      const plus = button(
        '+',
        () => {
          apply(line.draftQuantity + 1);
          minus.disabled = !editable || line.draftQuantity === 0;
        },
        !editable || line.draftQuantity === null,
      );
      plus.setAttribute('aria-label', `${line.sku} 增加`);
      input.addEventListener('change', () => {
        apply(input.value);
        minus.disabled = !editable || line.draftQuantity === 0;
      });
      controls.append(minus, input, plus, node('span', '箱'));
      info.append(controls);
      article.append(image, info);
      return article;
    }
    function render() {
      root.replaceChildren();
      const header = node('header');
      header.append(
        button(page === 'catalog' ? '返回订单' : '返回', () => {
          if (page === 'catalog') {
            page = 'order';
            render();
          } else window.close();
        }),
        node('h1', page === 'catalog' ? '商品增减' : '订单提交'),
      );
      if (page === 'order')
        header.append(
          button('+ 商品', () => {
            page = 'catalog';
            render();
          }),
        );
      const body = node('section', undefined, 'editor-body');
      body.append(
        node('p', `订单号：${snapshot.orderNo || '—'}；客户：${snapshot.customer || '—'}`),
        node('p', `基地：${snapshot.base || '—'}`, 'editor-note'),
      );
      const count = node('p', countText());
      count.dataset.editorCount = '';
      body.append(count);
      body.append(node('p', capabilities.dataBasis || '通知快照；实时库存尚未核验', 'editor-note'));
      if (!editable)
        body.append(node('p', '订单任务已结束或不可编辑，仅可查看商品。', 'editor-warning'));
      if (page === 'order') {
        const row = node('div', undefined, 'editor-toolbar'),
          label = node('label', '选择车型：'),
          select = node('select');
        select.setAttribute('aria-label', '选择车型');
        select.disabled = true;
        select.append(node('option', '车型规则未接入'));
        label.append(select);
        row.append(label);
        body.append(row);
      } else {
        body.append(
          node(
            'p',
            '当前仅展示原订单商品，可调整数量或将数量设为 0；尚未接入客户可售商品目录，不能新增其他 SKU。',
            'editor-note',
          ),
        );
        const input = node('input');
        input.type = 'search';
        input.className = 'editor-search';
        input.placeholder = '搜索商品名称或 SKU';
        input.value = search;
        input.setAttribute('aria-label', '商品搜索');
        body.append(input);
        const tabs = node('div', undefined, 'editor-toolbar');
        for (const name of [
          '全部',
          ...new Set(
            lines
              .map((line) => line.category)
              .filter((value) => typeof value === 'string' && value.trim()),
          ),
        ]) {
          const tab = button(name, () => {
            category = name;
            render();
          });
          tab.setAttribute('aria-pressed', String(category === name));
          tabs.append(tab);
        }
        body.append(tabs);
        input.addEventListener('input', () => {
          search = input.value;
          renderProducts();
        });
      }
      const products = node('section');
      products.setAttribute('aria-label', page === 'catalog' ? '商品增减列表' : '订单商品');
      body.append(products);
      function renderProducts() {
        products.replaceChildren();
        const query = search.trim().toLocaleLowerCase();
        const values = (page === 'order' ? selected() : lines).filter(
          (line) =>
            page === 'order' ||
            ((category === '全部' || line.category === category) &&
              `${line.sku} ${line.name || ''}`.toLocaleLowerCase().includes(query)),
        );
        for (const line of values) products.append(renderLine(line));
        if (!values.length)
          products.append(
            node(
              'p',
              page === 'order' ? '尚未选择商品，请通过“+ 商品”恢复订单商品。' : '没有匹配的商品',
              'editor-empty',
            ),
          );
      }
      renderProducts();
      const reason = node(
        'p',
        capabilities.reason || '订单修改接口未接入，当前仅编辑草稿，原订单未变。',
        'editor-warning',
      );
      reason.id = 'editorSubmitReason';
      reason.setAttribute('role', 'status');
      body.append(reason);
      const footer = node('footer'),
        summary = node('div', undefined, 'editor-totals'),
        totals = node('strong', countText());
      totals.dataset.editorCount = '';
      summary.append(
        totals,
        node(
          'p',
          `原订单满足率：${display(snapshot.satisfactionRate)}%；调整后满足率及车型达标情况待真实接口核算。`,
          'editor-note',
        ),
      );
      const submit = button(
        page === 'catalog' ? '完成选品' : '提交订单（未接入）',
        () => {
          if (page === 'catalog') {
            page = 'order';
            render();
          }
        },
        page !== 'catalog',
        'editor-primary',
      );
      if (page !== 'catalog') {
        submit.setAttribute('aria-describedby', reason.id);
        submit.title = reason.textContent;
      }
      footer.append(summary, submit);
      root.append(header, body, footer);
    }
    document.getElementById('confirmationMain').hidden = true;
    root.hidden = false;
    render();
    return {
      getDraft: () => lines.map((line) => ({ sku: line.sku, quantity: line.draftQuantity })),
      getPage: () => page,
    };
  }
  return { mount };
})();
//update-end---author:Codex ---date:2026-11-02 for：【订单履约缺货订单处理】草稿与订单快照隔离，未知值保留横线，未接改单禁止提交-----------
