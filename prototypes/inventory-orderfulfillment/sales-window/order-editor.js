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
  const identifiers = (snapshot) => ({
    execution: snapshot.executionOrderNo || '—',
    dms: snapshot.dmsOrderNo || snapshot.orderNo || '—',
  });
  const route = (snapshot) =>
    snapshot.credit?.status === 'insufficient'
      ? 'credit'
      : number(snapshot.satisfactionRate) !== null &&
          number(snapshot.satisfactionRate) >= 90 &&
          number(snapshot.satisfactionRate) <= 100
        ? 'order'
        : 'catalog';
  function mount(document, state) {
    const root = document.getElementById('orderEditor'),
      snapshot = state.snapshot || {},
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
      state.permissions?.canAct === true;
    const supplied =
      capabilities.recommendationsAvailable === true && Array.isArray(capabilities.recommendations)
        ? capabilities.recommendations
        : [];
    const recommendations = supplied
      .filter(
        (line, index) => line?.sku && supplied.findIndex((item) => item.sku === line.sku) === index,
      )
      .slice(0, 50);
    const recommendationDrafts = recommendations.map((line) => ({
      ...line,
      sku: String(line.sku),
      originalQuantity: 0,
      draftQuantity: 0,
    }));
    let page = state.view === 'details' ? 'details' : route(snapshot),
      search = '',
      category = '全部',
      subCategory = '全部';
    let deliveryDate = snapshot.deliveryDate || '',
      modal = false,
      saving = false,
      notice = '';
    const ids = identifiers(snapshot);
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
    const selected = () =>
      (page === 'recommendations' ? recommendationDrafts : lines).filter(
        (line) => line.draftQuantity === null || line.draftQuantity > 0,
      );
    const total = () =>
      selected().some((line) => line.draftQuantity === null)
        ? null
        : selected().reduce((sum, line) => sum + line.draftQuantity, 0);
    const changed = () =>
      lines.some((line) => line.draftQuantity !== line.originalQuantity) ||
      deliveryDate !== (snapshot.deliveryDate || '');
    const amount = () =>
      selected().some((line) => number(line.unitPrice) === null || line.draftQuantity === null)
        ? '—'
        : display(
            selected().reduce((sum, line) => sum + Number(line.unitPrice) * line.draftQuantity, 0),
          );
    function reason() {
      if (!editable) return '此任务已结束或仅有查看权限。';
      if (snapshot.credit?.status === 'insufficient') return '信用额度不足，需先补充并经后台核验。';
      if (route(snapshot) !== 'order') return '订单满足率未达到90%或未完整提供，请先处理商品。';
      if (!selected().length) return '尚未选择商品，请先核对订单商品。';
      if (selected().some((line) => line.draftQuantity === null)) return '商品数量尚未完整提供。';
      if (
        selected().some(
          (line) =>
            (number(line.minimumOrderQuantity) !== null &&
              line.draftQuantity < number(line.minimumOrderQuantity)) ||
            (number(line.orderMultiple) > 0 &&
              Math.abs(
                line.draftQuantity / number(line.orderMultiple) -
                  Math.round(line.draftQuantity / number(line.orderMultiple)),
              ) > 1e-8),
        )
      )
        return '请核对商品起订量和订货倍数。';
      if (changed()) return '商品或交货日期已调整；订单修改接口未接入，当前只能保留窗口草稿。';
      if (state.previewOnly === true) return '本地模拟预览，不保存决定、不发货、不改单。';
      if (typeof state.onConfirm !== 'function') return '订单提交接口尚未接入。';
      return '';
    }
    function updateTotals() {
      root.querySelectorAll('[data-editor-count]').forEach((item) => {
        item.textContent =
          item.dataset.editorCount === 'cart'
            ? `已选 ${selected().length} 种`
            : `共 ${quantityText(total())} · ${selected().length} 种商品`;
      });
      const price = root.querySelector('[data-editor-amount]');
      if (price) price.textContent = '¥ ' + amount();
      const hint = root.querySelector('#editorSubmitReason');
      if (hint) hint.textContent = reason() || '提交仅保存销售确认决定，不执行OMS。';
      const rate = root.querySelector('.editor-rate');
      if (rate)
        rate.textContent = changed()
          ? '调整后满足率：待重新核算'
          : `订单满足率：${display(snapshot.satisfactionRate)}%`;
    }
    function renderLine(line, readOnly = false) {
      const article = node('article');
      article.dataset.sku = line.sku;
      const image = node('div', undefined, 'editor-image');
      image.setAttribute('aria-hidden', 'true');
      image.append(node('span', '暂无图片'));
      const info = node('div', undefined, 'editor-item-info'),
        name = node('strong', line.name || '商品名称未提供', 'editor-product-name');
      name.title = line.name || '商品名称未提供';
      info.append(
        name,
        node('p', line.specification || '规格未提供', 'editor-spec'),
        node('small', 'SKU：' + line.sku, 'editor-sku'),
      );
      info.append(
        node(
          'p',
          `起订量：${quantityText(line.minimumOrderQuantity)} ｜ 订货倍数：${quantityText(line.orderMultiple)}`,
          'editor-order-rules',
        ),
      );
      const trading = node('div', undefined, 'editor-product-trading'),
        price = node('div', undefined, 'editor-price');
      price.append(node('strong', '¥ ' + display(line.unitPrice)));
      if (number(line.unitPrice) === null) price.append(node('small', '暂无价格'));
      trading.append(price);
      if (readOnly)
        trading.append(
          node('span', quantityText(line.originalQuantity), 'editor-readonly-quantity'),
        );
      else {
        const controls = node('div', undefined, 'editor-quantity'),
          input = node('input');
        input.type = 'number';
        input.min = '0';
        input.step = number(line.orderMultiple) > 0 ? String(line.orderMultiple) : 'any';
        input.value = line.draftQuantity === null ? '' : String(line.draftQuantity);
        input.placeholder = '—';
        input.setAttribute('aria-label', `${line.sku} 数量`);
        input.disabled = !editable || line.originalQuantity === null;
        const multiple = number(line.orderMultiple),
          minimum = number(line.minimumOrderQuantity),
          error = node('small', '', 'editor-quantity-error');
        error.setAttribute('role', 'status');
        function apply(value) {
          if (!editable || line.originalQuantity === null) return;
          const quantity = number(value);
          const invalid =
            quantity === null
              ? '请输入非负有效数量'
              : quantity > 0 && minimum !== null && quantity < minimum
                ? `起订量为 ${display(minimum)} 箱`
                : quantity > 0 &&
                    multiple > 0 &&
                    Math.abs(quantity / multiple - Math.round(quantity / multiple)) > 1e-8
                  ? `数量须为 ${display(multiple)} 箱的整数倍`
                  : '';
          input.setCustomValidity(invalid);
          error.textContent = invalid;
          if (invalid) {
            input.value = line.draftQuantity === null ? '' : String(line.draftQuantity);
            return;
          }
          line.draftQuantity = quantity;
          input.value = String(quantity);
          updateTotals();
          minus.disabled = !editable || quantity === 0;
        }
        const step = multiple > 0 ? multiple : 1;
        const minus = button(
          '−',
          () =>
            apply(
              line.draftQuantity - step < (minimum || 0)
                ? 0
                : Math.max(0, line.draftQuantity - step),
            ),
          !editable || line.draftQuantity === null || line.draftQuantity === 0,
        );
        minus.setAttribute('aria-label', `${line.sku} 减少`);
        const plus = button(
          '+',
          () =>
            apply(
              line.draftQuantity === 0 && minimum > 0
                ? Math.ceil(minimum / step) * step
                : line.draftQuantity + step,
            ),
          !editable || line.draftQuantity === null,
        );
        plus.setAttribute('aria-label', `${line.sku} 增加`);
        input.addEventListener('change', () => apply(input.value));
        controls.append(minus, input, plus, node('span', '箱'));
        trading.append(controls);
        info.append(error);
      }
      info.append(trading);
      if (number(line.shortage) > 0)
        info.append(
          node('p', `库存不足：原订单缺货 ${display(line.shortage)} 箱`, 'editor-stock-warning'),
        );
      else if (number(line.shortage) === null)
        info.append(node('p', '缺货数据未完整提供', 'editor-stock-warning'));
      article.append(image, info);
      return article;
    }
    function infoBlock() {
      const info = node('section', undefined, 'editor-basic-info');
      if (page === 'details') info.append(node('h2', '基本信息'));
      const fields = node('dl');
      for (const [label, value] of [
        ['客户', snapshot.customer || '—'],
        ['提货点', snapshot.pickupPoint || snapshot.base || '—'],
        ['执行单号', ids.execution],
        ...(page === 'details'
          ? [
              ['车型', snapshot.vehicleType || '—'],
              ['总数量', quantityText(total())],
              [
                '订单满足率',
                `${display(snapshot.satisfactionRate)}${number(snapshot.satisfactionRate) === null ? '' : '%'}`,
              ],
            ]
          : []),
        ['DMS订单号', ids.dms],
        ['订单交货日期', snapshot.deliveryDate || '—'],
      ])
        fields.append(node('dt', label), node('dd', value));
      info.append(fields);
      return info;
    }
    function render() {
      root.replaceChildren();
      root.dataset.page = page;
      const title = {
        details: '订单明细',
        order: '订单提交',
        catalog: '商品增减',
        recommendations: '商品推荐',
        credit: '确认额度已补充',
      }[page];
      document.title = title;
      const header = node('header');
      header.append(
        button(
          '返回',
          () => {
            if (page === 'recommendations') page = 'catalog';
            else if (page === 'catalog') page = 'order';
            else {
              window.close();
              return;
            }
            render();
          },
          false,
          'editor-back',
        ),
        node('h1', title),
        node('span'),
      );
      const body = node('section', undefined, 'editor-body');
      if (state.permissions?.canAct !== true)
        body.append(node('p', '你可以查看此订单；处理操作由指定销售执行。', 'editor-warning'));
      if (state.status !== 'pending')
        body.append(
          node(
            'p',
            state.decisions?.[0]?.action_id === 'defer_shipment'
              ? '已暂缓，预计交货截止：' + state.decisions[0].deferred_until
              : '该订单任务已处理，仅展示明细。',
            'editor-warning',
          ),
        );
      if (page === 'credit') {
        const panel = node('section', undefined, 'editor-credit-panel');
        panel.append(
          node('h2', '确认额度已补充？'),
          node('p', `信用额度不足：${display(snapshot.credit?.shortfall)} 元`),
          node('p', '补充后仍需后台重新核验，不能仅凭点击认定额度已到账。'),
          node('p', '额度核验接口尚未接入，当前不能保存或解除额度限制。', 'editor-stock-warning'),
        );
        panel.append(
          button('确认（待接入）', () => {}, true, 'editor-primary'),
          button('返回', () => window.close()),
        );
        body.append(infoBlock(), panel);
        root.append(header, body);
        return;
      }
      if (page === 'details') body.append(infoBlock());
      if (page === 'order') {
        const toolbar = node('div', undefined, 'editor-toolbar'),
          vehicle = node('select');
        vehicle.setAttribute('aria-label', '选择车型');
        vehicle.disabled = true;
        vehicle.append(node('option', '选择车型（未接入）'));
        const date = node('input');
        date.type = 'date';
        date.value = /^\d{4}-\d{2}-\d{2}$/.test(deliveryDate) ? deliveryDate : '';
        date.disabled = !editable;
        date.setAttribute('aria-label', '预计交货日期');
        date.addEventListener('change', () => {
          deliveryDate = date.value;
          updateTotals();
        });
        const label = node('label', '预计交货日期', 'editor-delivery-date');
        label.append(date);
        toolbar.append(
          vehicle,
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
        body.append(toolbar);
      }
      if (page === 'catalog') {
        const searchBar = node('div', undefined, 'editor-search-bar'),
          input = node('input');
        input.type = 'search';
        input.className = 'editor-search';
        input.placeholder = '搜索商品名称或 SKU';
        input.setAttribute('aria-label', '商品搜索');
        input.value = search;
        searchBar.append(
          node('span', '⌕', 'editor-search-icon'),
          input,
          button(
            '推荐',
            () => {
              page = 'recommendations';
              render();
            },
            false,
            'editor-add',
          ),
        );
        body.append(searchBar);
        const tabs = node('nav', undefined, 'editor-category-tabs');
        tabs.setAttribute('aria-label', '商品一级分类');
        for (const name of [
          '全部',
          ...new Set(lines.map((line) => line.category).filter(Boolean)),
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
        for (const name of [
          '全部',
          ...new Set(
            lines
              .filter((line) => category === '全部' || line.category === category)
              .map((line) => line.subCategory)
              .filter(Boolean),
          ),
        ]) {
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
      products.setAttribute(
        'aria-label',
        page === 'catalog' ? '商品增减列表' : page === 'recommendations' ? '推荐商品' : '订单商品',
      );
      catalog.append(products);
      body.append(catalog);
      function renderProducts() {
        products.replaceChildren();
        const query = search.trim().toLocaleLowerCase();
        const values =
          page === 'recommendations'
            ? recommendationDrafts
            : (page === 'catalog' ? lines : selected()).filter(
                (line) =>
                  page !== 'catalog' ||
                  ((category === '全部' || line.category === category) &&
                    (subCategory === '全部' || line.subCategory === subCategory) &&
                    `${line.sku} ${line.name || ''}`.toLocaleLowerCase().includes(query)),
              );
        for (const value of values) {
          const line = value;
          products.append(renderLine(line, page === 'details'));
        }
        if (!values.length)
          products.append(
            node(
              'p',
              page === 'recommendations'
                ? '暂无推荐商品；后续按实际推荐结果展示。'
                : '没有匹配的商品',
              'editor-empty',
            ),
          );
      }
      renderProducts();
      if (page === 'order' || page === 'recommendations') body.append(infoBlock());
      if (page !== 'details') {
        const notes = node('details', undefined, 'editor-disclosure');
        notes.append(node('summary', '数据说明与处理限制'));
        const hint = node('p', reason() || '仅登记销售决定，不执行OMS。', 'editor-warning');
        hint.id = 'editorSubmitReason';
        notes.append(
          hint,
          node(
            'p',
            capabilities.dataBasis ||
              '通知时订单快照；实时库存、起订规则及交货日期以后台提供值为准。',
          ),
        );
        if (page === 'catalog')
          notes.append(
            node('p', '当前展示原订单商品；推荐区仅接受后台提供的推荐结果，不自行生成可售商品。'),
          );
        body.append(notes);
      }
      const footer = node('footer'),
        summary = node('div', undefined, 'editor-totals'),
        count = node('strong');
      count.dataset.editorCount = '';
      summary.append(
        count,
        node('p', '', 'editor-rate'),
        node('p', `执行单号：${ids.execution}`, 'editor-order-number'),
      );
      const checkout = node('div', undefined, 'editor-checkout');
      if (page === 'order') {
        const price = node('span', '', 'editor-amount');
        price.dataset.editorAmount = '';
        checkout.append(
          price,
          button(
            '提交',
            () => {
              modal = true;
              render();
            },
            !editable,
            'editor-primary',
          ),
        );
      } else if (page === 'catalog' || page === 'recommendations')
        checkout.append(
          button(
            page === 'catalog' ? '完成选品' : '使用',
            () => {
              if (page === 'recommendations') {
                const additions = recommendationDrafts.filter(
                  (line) => line.draftQuantity > 0 && !lines.some((item) => item.sku === line.sku),
                );
                if (lines.length + additions.length > 200) {
                  notice = '商品数量超过窗口支持范围，请减少推荐商品。';
                  render();
                  return;
                }
                for (const item of recommendationDrafts.filter((line) => line.draftQuantity > 0)) {
                  const existing = lines.find((line) => line.sku === item.sku);
                  if (existing) existing.draftQuantity = item.draftQuantity;
                  else lines.push({ ...item });
                }
              }
              page = 'order';
              render();
            },
            !editable,
            'editor-primary',
          ),
        );
      else {
        if (editable)
          checkout.append(
            button(
              '订单处理',
              () => {
                page = route(snapshot);
                render();
              },
              false,
              'editor-primary',
            ),
          );
        checkout.append(button('返回', () => window.close()));
      }
      footer.append(summary, checkout);
      if (page !== 'details')
        footer.append(
          node(
            'p',
            state.previewOnly === true
              ? '本地模拟预览 · 不保存、不发货、不改单。'
              : '商品与日期调整仅为窗口草稿；保存销售决定不代表OMS已执行。',
            'editor-draft-note',
          ),
        );
      root.append(header, body, footer);
      updateTotals();
      if (notice) body.prepend(node('p', notice, 'editor-warning'));
      if (modal) {
        const overlay = node('div', undefined, 'editor-modal-overlay'),
          dialog = node('section', undefined, 'editor-confirm-dialog');
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-label', '确认提交');
        dialog.append(
          node('h2', '确认提交？'),
          node('p', reason() || '本次仅保存销售确认决定，不执行发货、开单或改单。'),
        );
        dialog.append(
          button(
            saving ? '保存中…' : '确认',
            async () => {
              if (reason() || saving) return;
              saving = true;
              render();
              try {
                await state.onConfirm();
                modal = false;
              } catch (error) {
                notice = error.message;
                modal = false;
              } finally {
                saving = false;
                if (root.isConnected && root.dataset.page === page) render();
              }
            },
            !!reason() || saving,
            'editor-primary',
          ),
          button(
            '返回',
            () => {
              modal = false;
              render();
            },
            saving,
          ),
        );
        overlay.append(dialog);
        root.append(overlay);
      }
    }
    document.getElementById('confirmationMain').hidden = true;
    root.hidden = false;
    render();
    return {
      getDraft: () => lines.map((line) => ({ sku: line.sku, quantity: line.draftQuantity })),
      getPage: () => page,
    };
  }
  return { mount, route, identifiers };
})();
//update-end---author:Codex ---date:2026-11-02 for：【订单履约缺货订单处理】草稿与订单快照隔离，未知值保留横线，未接改单禁止提交-----------
