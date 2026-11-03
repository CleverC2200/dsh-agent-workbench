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
    const editable =
      state.status === 'pending' &&
      capabilities.editable === true &&
      state.permissions?.canAct !== false;
    let page = 'order',
      search = '',
      category = '全部',
      subCategory = '全部';
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
        item.textContent =
          item.dataset.editorCount === 'cart'
            ? `已选 ${selected().length} 种`
            : item.dataset.editorCount === 'compact'
              ? `已选商品：${selected().length} 种`
              : countText();
      });
    }
    function renderLine(line) {
      const article = node('article');
      article.dataset.sku = line.sku;
      const image = node('div', undefined, 'editor-image');
      image.setAttribute('aria-hidden', 'true');
      image.append(node('span', '暂无图片'));
      const info = node('div', undefined, 'editor-item-info');
      const name = node('strong', line.name || '商品名称未提供', 'editor-product-name');
      name.title = line.name || '商品名称未提供';
      info.append(
        name,
        node('p', line.specification || '规格未提供', 'editor-spec'),
        node('small', 'SKU：' + line.sku, 'editor-sku'),
      );
      const shortage = number(line.shortage);
      const trading = node('div', undefined, 'editor-product-trading');
      const price = node('div', undefined, 'editor-price');
      price.append(node('strong', '¥ —'), node('small', '价格未提供'));
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
      trading.append(price, controls);
      info.append(trading);
      if (shortage !== null && shortage > 0)
        info.append(
          node('p', `库存不足：原订单缺货 ${display(shortage)} 箱`, 'editor-stock-warning'),
        );
      else if (shortage === null)
        info.append(node('p', '缺货数据未完整提供', 'editor-stock-warning'));
      info.append(
        node('small', `原订货：${quantityText(line.originalQuantity)}`, 'editor-original'),
      );
      article.append(image, info);
      return article;
    }
    function render() {
      root.replaceChildren();
      root.dataset.page = page;
      document.title = page === 'catalog' ? '商品增减' : '订单提交';
      const header = node('header');
      header.append(
        button(
          page === 'catalog' ? '返回订单' : '返回',
          () => {
            if (page === 'catalog') {
              page = 'order';
              render();
            } else window.close();
          },
          false,
          'editor-back',
        ),
        node('h1', page === 'catalog' ? '商品增减' : '订单提交'),
      );
      if (page === 'catalog') {
        const cart = button(
          `已选 ${selected().length} 种`,
          () => {
            page = 'order';
            render();
          },
          false,
          'editor-cart',
        );
        cart.dataset.editorCount = 'cart';
        header.append(cart);
      } else header.append(node('span'));
      const body = node('section', undefined, 'editor-body');
      if (!editable)
        body.append(node('p', '订单任务已结束或不可编辑，仅可查看商品。', 'editor-warning'));
      if (page === 'order') {
        const row = node('div', undefined, 'editor-toolbar'),
          count = node('span', `已选商品：${selected().length} 种`),
          label = node('label', undefined, 'editor-vehicle'),
          select = node('select');
        count.dataset.editorCount = 'compact';
        select.setAttribute('aria-label', '选择车型');
        select.disabled = true;
        select.title = '车型规则未接入';
        select.append(node('option', '选择车型（未接入）'));
        label.append(select);
        row.append(
          count,
          label,
          button(
            '+ 商品',
            () => {
              page = 'catalog';
              render();
            },
            false,
            'editor-add',
          ),
        );
        body.append(row);
      } else {
        const searchBar = node('div', undefined, 'editor-search-bar');
        searchBar.append(node('span', '⌕', 'editor-search-icon'));
        const input = node('input');
        input.type = 'search';
        input.className = 'editor-search';
        input.placeholder = '搜索商品名称或 SKU';
        input.value = search;
        input.setAttribute('aria-label', '商品搜索');
        searchBar.append(input);
        body.append(searchBar);
        const tabs = node('nav', undefined, 'editor-category-tabs');
        tabs.setAttribute('aria-label', '商品一级分类');
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
            subCategory = '全部';
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
      const catalog = node(
        'div',
        undefined,
        page === 'catalog' ? 'editor-catalog' : 'editor-order-products',
      );
      if (page === 'catalog') {
        const sidebar = node('nav', undefined, 'editor-subcategories');
        sidebar.setAttribute('aria-label', '商品二级分类');
        const names = [
          '全部',
          ...new Set(
            lines
              .filter((line) => category === '全部' || line.category === category)
              .map((line) => line.subCategory)
              .filter((value) => typeof value === 'string' && value.trim()),
          ),
        ];
        for (const name of names) {
          const tab = button(name === '全部' ? '全部商品' : name, () => {
            subCategory = name;
            render();
          });
          tab.setAttribute('aria-pressed', String(subCategory === name));
          sidebar.append(tab);
        }
        catalog.append(sidebar);
      }
      const products = node('section', undefined, 'editor-products');
      products.setAttribute('aria-label', page === 'catalog' ? '商品增减列表' : '订单商品');
      catalog.append(products);
      body.append(catalog);
      function renderProducts() {
        products.replaceChildren();
        const query = search.trim().toLocaleLowerCase();
        const values = (page === 'order' ? selected() : lines).filter(
          (line) =>
            page === 'order' ||
            ((category === '全部' || line.category === category) &&
              (subCategory === '全部' || line.subCategory === subCategory) &&
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
      if (page === 'order') {
        const delivery = node('section', undefined, 'editor-delivery-info');
        delivery.append(
          node('p', `提货基地：${snapshot.base || '—'}`),
          node('p', `客户：${snapshot.customer || '—'}`),
        );
        body.append(delivery);
      }
      const notes = node('details', undefined, 'editor-disclosure');
      notes.append(node('summary', '数据说明与处理限制'));
      notes.append(node('p', capabilities.dataBasis || '通知快照；实时库存尚未核验'));
      if (page === 'catalog')
        notes.append(
          node(
            'p',
            '当前仅展示原订单商品，可调整数量或将数量设为 0；尚未接入客户可售商品目录，不能新增其他 SKU。',
          ),
        );
      const reason = node(
        'p',
        capabilities.reason || '订单修改接口未接入，当前仅编辑草稿，原订单未变。',
        'editor-warning',
      );
      reason.id = 'editorSubmitReason';
      reason.setAttribute('role', 'status');
      notes.append(reason);
      body.append(notes);
      const footer = node('footer'),
        summary = node('div', undefined, 'editor-totals'),
        totals = node('strong', countText());
      totals.dataset.editorCount = '';
      summary.append(
        totals,
        node(
          'p',
          `原订单满足率：${display(snapshot.satisfactionRate)}% · 调整后待核算`,
          'editor-rate',
        ),
        node('p', `订单号：${snapshot.orderNo || '—'}`, 'editor-order-number'),
      );
      const checkout = node('div', undefined, 'editor-checkout');
      if (page === 'order') checkout.append(node('span', '金额 —', 'editor-amount'));
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
      checkout.append(submit);
      footer.append(summary, checkout);
      footer.append(
        node(
          'p',
          state.previewOnly === true
            ? '模拟预览 · 不保存、不发货、不改单。'
            : '仅本窗口草稿，原订单不变；订单提交接口尚未接入。',
          'editor-draft-note',
        ),
      );
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

'use strict';
const element = (id) => document.getElementById(id);
const navigation = new URLSearchParams(location.search);
const requestedMode = navigation.get('view') ?? navigation.get('mode');
//update-begin---author:Codex ---date:2026-11-02 for：【订单履约缺货订单处理】订单处理与商品增减共享原订单验证窗口-----------
const mode = ['confirm', 'defer', 'details', 'list', 'edit'].includes(requestedMode)
  ? requestedMode
  : 'details';
//update-end---author:Codex ---date:2026-11-02 for：【订单履约缺货订单处理】订单处理与商品增减共享原订单验证窗口-----------
const nonce = crypto.randomUUID();
let state,
  inflight = false,
  submitted,
  pageNo = 1;
//update-begin---author:Codex ---date:2026-10-30 for：【订单履约正式确认链路本地联调】缺失数量及满足率不转换成零-----------
const knownNumber = (value) =>
  (typeof value === 'number' || typeof value === 'string') &&
  String(value).trim() !== '' &&
  Number.isFinite(Number(value))
    ? Number(value)
    : null;
const rateReady = (value) => {
  const rate = knownNumber(value);
  return rate !== null && rate >= 90 && rate <= 100;
};
const quantityText = (value) => (knownNumber(value) === null ? '—' : value + ' 箱');
//update-end---author:Codex ---date:2026-10-30 for：【订单履约正式确认链路本地联调】缺失数量及满足率不转换成零-----------
async function request(path, options = {}) {
  const response = await fetch(location.pathname + path, {
    cache: 'no-store',
    credentials: 'same-origin',
    ...options,
  });
  const data = await response.json();
  if (!response.ok) throw Error(data.message || '会话已过期，请从飞书卡片重新打开');
  return data;
}
function status() {
  const pending = state?.status === 'pending' && state?.permissions?.canAct !== false;
  element('submit').hidden = mode === 'details' || mode === 'list' || !pending;
  element('submit').disabled =
    inflight ||
    !pending ||
    (mode === 'defer' && !element('days').value) ||
    (mode === 'confirm' && !rateReady(state?.snapshot.satisfactionRate));
  //update-begin---author:Codex ---date:2026-11-02 for：【订单履约缺货订单处理】本机预览可查看延期页面但不写入处理决定-----------
  if (state?.previewOnly === true) {
    element('submit').disabled = true;
    element('submit').textContent = '本地预览，不保存';
    element('notice').textContent = '仅查看界面效果，不执行真实延期、发货或改单。';
  }
  //update-end---author:Codex ---date:2026-11-02 for：【订单履约缺货订单处理】本机预览可查看延期页面但不写入处理决定-----------
  if (state?.status !== 'pending' && mode !== 'list') {
    const d = state?.decisions?.[0];
    element('result').hidden = false;
    element('result').textContent =
      d?.action_id === 'defer_shipment'
        ? '已保存暂缓决定，截止：' + d.deferred_until
        : d?.action_id === 'confirm_shipment'
          ? '已保存销售确认决定'
          : state?.status === 'processing'
            ? '正在处理，请稍后刷新'
            : '该订单确认任务已结束';
  }
}
async function load() {
  state = await request('/data?includeRelated=' + (mode === 'list') + '&pageNo=' + pageNo);
  //update-begin---author:Codex ---date:2026-11-02 for：【订单履约缺货订单处理】仅在认证读取成功后渲染草稿，关闭原确认按钮-----------
  if (state.permissions?.canAct !== false && mode === 'edit') {
    window.OrderShortageEditor.mount(document, {
      ...state,
      editor: state.editor ?? {
        editable: state.status === 'pending',
        canSubmit: false,
        catalogAvailable: false,
        vehicleRulesAvailable: false,
        dataBasis: '通知生成时的订单快照，不代表实时可用库存',
        reason:
          '订单修改接口尚未接入，当前调整仅为本窗口草稿，未修改原订单；可售商品及车型规则待提供。',
      },
    });
    element('windowLoading').hidden = true;
    element('submit').hidden = true;
    return;
  }
  //update-end---author:Codex ---date:2026-11-02 for：【订单履约缺货订单处理】仅在认证读取成功后渲染草稿，关闭原确认按钮-----------
  if (mode === 'list') {
    element('title').textContent = '最近 8 天的订单确认记录';
    element('summary').textContent = '仅展示分派给你的订单';
    element('quantity').textContent = '';
    element('defer').hidden = true;
    element('items').hidden = false;
    element('items').replaceChildren();
    for (const row of state.related.items) {
      const item = document.createElement('article'),
        link = document.createElement('a'),
        info = document.createElement('p');
      link.textContent = row.snapshot.orderNo;
      link.href = row.entryUrl + '&view=details';
      info.textContent =
        row.snapshot.customer + '；' + (row.status === 'pending' ? '待处理' : '已处理');
      item.append(link, info);
      if (row.status === 'pending')
        for (const [action, title] of [
          ['confirm', '确认发货'],
          ['defer', '暂缓发货'],
        ]) {
          if (action === 'confirm' && !rateReady(row.snapshot.satisfactionRate)) continue;
          const button = document.createElement('a');
          button.textContent = title;
          button.href = row.entryUrl + '&view=' + action;
          button.style.marginRight = '16px';
          item.append(button);
        }
      //update-begin---author:Codex ---date:2026-11-02 for：【订单履约缺货订单处理】列表缺货订单提供相同处理入口-----------
      if (
        row.status === 'pending' &&
        (!rateReady(row.snapshot.satisfactionRate) ||
          (row.snapshot.lines || []).some((line) => knownNumber(line.shortage) > 0))
      ) {
        const edit = document.createElement('a');
        edit.textContent = '订单处理';
        edit.href = row.entryUrl + '&view=edit';
        item.append(edit);
      }
      //update-end---author:Codex ---date:2026-11-02 for：【订单履约缺货订单处理】列表缺货订单提供相同处理入口-----------
      element('items').append(item);
    }
    element('pages').hidden = false;
    element('previous').disabled = pageNo === 1;
    element('next').disabled = pageNo * 20 >= state.related.total;
    element('pageLabel').textContent = '第 ' + pageNo + ' 页，共 ' + state.related.total + ' 笔';
    element('cancel').textContent = '返回';
    status();
    document.title = '订单确认记录';
    element('confirmationMain').hidden = false;
    element('windowLoading').hidden = true;
    return;
  }
  const p = state.snapshot;
  const process = element('process');
  process.hidden =
    mode !== 'details' ||
    state.status !== 'pending' ||
    state.permissions?.canAct === false ||
    (rateReady(p.satisfactionRate) &&
      !(p.lines || []).some((line) => knownNumber(line.shortage) > 0));
  const editUrl = new URL(location.href);
  editUrl.searchParams.set('view', 'edit');
  editUrl.searchParams.delete('mode');
  process.href = editUrl.href;
  if (state.permissions?.canAct === false)
    element('notice').textContent = '你可以查看此订单；处理操作由指定销售执行。';
  element('title').textContent =
    state.permissions?.canAct === false
      ? '订单明细'
      : { confirm: '确认开单？', defer: '暂缓发货', details: '订单明细' }[mode];
  element('summary').textContent =
    '订单号：' +
    p.orderNo +
    '\n客户：' +
    p.customer +
    '\n基地：' +
    p.base +
    '\n订单满足率：' +
    (knownNumber(p.satisfactionRate) === null ? '—' : Number(p.satisfactionRate).toFixed(1) + '%');
  element('quantity').textContent = '总数量：' + quantityText(p.quantity);
  element('defer').hidden = mode !== 'defer' || state.permissions?.canAct === false;
  element('items').hidden = mode !== 'details' && state.permissions?.canAct !== false;
  element('items').replaceChildren();
  for (const line of p.lines || []) {
    const item = document.createElement('article'),
      name = document.createElement('strong'),
      detail = document.createElement('p');
    name.textContent = line.name + ' / ' + line.sku;
    detail.textContent =
      '订货：' + quantityText(line.quantity) + '；缺货：' + quantityText(line.shortage);
    item.append(name, detail);
    element('items').append(item);
  }
  element('cancel').textContent = '返回';
  status();
  document.title = element('title').textContent;
  element('confirmationMain').hidden = false;
  element('windowLoading').hidden = true;
}
element('cancel').onclick = () => {
  window.close();
};
for (const [id, delta] of [
  ['previous', -1],
  ['next', 1],
])
  element(id).onclick = async () => {
    if (inflight) return;
    inflight = true;
    pageNo += delta;
    try {
      await load();
    } catch (error) {
      pageNo -= delta;
      element('notice').textContent = error.message;
    } finally {
      inflight = false;
    }
  };
element('days').onchange = () => {
  if (!inflight) {
    submitted = undefined;
    status();
  }
};
element('submit').onclick = async () => {
  if (inflight || element('submit').disabled) return;
  inflight = true;
  element('notice').textContent = '正在保存…';
  status();
  submitted ??= {
    actionId: mode === 'confirm' ? 'confirm_shipment' : 'defer_shipment',
    expectedVersion: state.version,
    nonce,
    input: mode === 'defer' ? { deferDays: Number(element('days').value) } : {},
  };
  try {
    const receipt = await request('/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': state.csrf },
      body: JSON.stringify(submitted),
    });
    if (!['accepted', 'already_resolved'].includes(receipt.status))
      throw Error('处理状态：' + receipt.status + '，请重新核对订单后操作');
    element('notice').textContent = '';
    await load();
  } catch (error) {
    element('notice').textContent = error.message;
  } finally {
    inflight = false;
    status();
  }
};
load().catch((error) => {
  element('windowLoading').hidden = true;
  element('orderEditor').hidden = true;
  element('confirmationMain').hidden = false;
  element('title').textContent = '订单加载失败';
  document.title = '订单加载失败';
  element('submit').hidden = true;
  element('process').hidden = true;
  element('notice').textContent = error.message;
});
