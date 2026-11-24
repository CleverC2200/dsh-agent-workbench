'use strict';

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
  const rateText = (value) =>
    number(value) === null
      ? '待核实'
      : number(value) > 100
        ? '数据异常'
        : number(value).toFixed(1) + '%';
  const specificationText = (value) => {
    const raw = typeof value === 'string' ? value.trim() : '';
    if (!raw) return '规格未提供';
    const match = /^1\s*[*×x]\s*\d+(?:\.\d+)?\s*(?:kg|g)?\s*[*×x]\s*(\d+)$/i.exec(raw);
    const bags = match ? Number(match[1]) : null;
    return Number.isSafeInteger(bags) && bags > 0 ? `${bags}袋/件` : raw;
  };
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
    const mountOwner = {};
    root.__fulfillmentEditorOwner = mountOwner;
    const original = Array.isArray(snapshot.lines) ? snapshot.lines : [];
    if (
      original.length > 200 ||
      original.some((line) => !line.sku) ||
      new Set(original.map((line) => String(line.sku))).size !== original.length
    )
      throw Error('订单商品数据不完整，无法打开处理页');
    const lines = original.map((line) => ({
      ...line,
      priceStatus:
        line.priceStatus || (snapshot.priceStatus !== 'READY' ? snapshot.priceStatus : undefined),
      sku: String(line.sku),
      originalQuantity: number(line.quantity),
      draftQuantity: number(line.quantity),
    }));
    const editable =
      state.status === 'pending' &&
      capabilities.editable === true &&
      state.permissions?.canAct === true;
    const inventoryEnabled =
      editable &&
      state.previewOnly !== true &&
      capabilities.inventoryRecalculationAvailable === true &&
      typeof state.onInventoryRecalculate === 'function';
    const priceRecalculationEnabled =
      inventoryEnabled && capabilities.priceRecalculationAvailable === true;
    function priceValue(line) {
      return line.priceStatus && line.priceStatus !== 'READY' ? null : number(line.unitPrice);
    }
    function priceMessage(line) {
      if (priceValue(line) !== null) return '';
      if (typeof line.priceMessage === 'string' && line.priceMessage.trim())
        return line.priceMessage;
      const reasons = {
        PRICE_MISSING: 'SAP未返回该商品的价格，请联系业务核实。',
        missing_or_expired: '商品价格缺失或已过期，请联系业务核实。',
        PRICE_CONTEXT_QUERY_UNAVAILABLE: '查价资料查询未成功，请核对读取权限或查询服务。',
        PRICE_CONTEXT_NOT_VISIBLE_OR_MISSING:
          '未读取到客户与提货点的查价资料，请核对资料及读取权限。',
        PRICE_CONTEXT_CONFLICTING: '客户与提货点的查价资料不唯一，请联系业务核实。',
        PRICE_CONTEXT_SCOPE_MISMATCH: '查价资料与订单客户或提货点不一致，请联系业务核实。',
        PRICE_CONTEXT_MISSING: '查价所需的客户、提货点、公司或工厂资料不完整，请核对后重试。',
        PRICE_CONTEXT_MISSING_OR_CONFLICTING:
          '未取得唯一且可读取的查价资料，请核对客户、提货点及权限。',
        PICKUP_POINT_INACTIVE: '提货点未启用或未完成匹配，请联系业务核实。',
        PRICE_CONFLICT: 'SAP返回的价格或计价条件存在冲突，请联系业务核实。',
        SAP_PRICE_CUSTOMER_BLOCKED: 'SAP查价提示客户冻结，请联系业务核实',
        SAP_PRICE_REJECTED: 'SAP拒绝本次查价，请联系业务核实。',
        SAP_PRICE_TIMEOUT: 'SAP查价超时，请稍后重试。',
        SAP_PRICE_CONNECTION_FAILED: '暂时无法连接SAP查价服务，请稍后重试。',
        SAP_PRICE_HTTP_ERROR: 'SAP查价服务返回异常状态，请联系接口负责人核查。',
        SAP_PRICE_RESPONSE_INVALID: 'SAP查价返回的数据格式异常，请联系接口负责人核查。',
        SAP_PRICE_SCOPE_MISMATCH: 'SAP返回的报价与订单查价范围不一致，请联系接口负责人核查。',
        SAP_PRICE_INTERRUPTED: 'SAP查价已中断，请重新查询。',
        PRICE_CONDITIONS_UNSUPPORTED: 'SAP返回的计价信息不符合当前规则，请联系业务核实。',
        PRICE_QUERY_DISABLED: '商品查价服务未启用，暂时无法核验价格。',
      };
      return reasons[line.priceStatus] || '商品价格尚未获取或核验未完成，请重新核验。';
    }
    let inventoryResult,
      inventoryPhase = 'idle',
      inventoryError = '',
      inventoryKey = '',
      inventoryTimer,
      inventoryGeneration = 0;
    const supplied =
      capabilities.recommendationsAvailable === true && Array.isArray(capabilities.recommendations)
        ? capabilities.recommendations
        : [];
    const recommendations = supplied
      .filter(
        (line, index) => line?.sku && supplied.findIndex((item) => item.sku === line.sku) === index,
      )
      .slice(0, 50);
    function packagingError(line) {
      if (
        capabilities.packagingValidationAvailable !== true ||
        original.some((item) => item.sku === line.sku)
      )
        return '';
      return line.packagingStatus === 'READY' &&
        typeof line.unit === 'string' &&
        line.unit.length > 0 &&
        number(line.unitsPerCase) > 0
        ? ''
        : line.packagingMessage || `商品${line.sku}缺少可核实的包装单位或折箱关系，暂不能选用。`;
    }
    const recommendationDrafts = recommendations.map((line) => ({
      ...line,
      sku: String(line.sku),
      originalQuantity: 0,
      draftQuantity: 0,
    }));
    let page =
        state.view === 'details' ? 'details' : state.view === 'price' ? 'price' : route(snapshot),
      search = '',
      category = '全部',
      subCategory = '全部';
    let deliveryDate = snapshot.deliveryDate || '',
      vehicleType = snapshot.vehicleType || '',
      loadingProducts = false,
      loadingVehicles = false,
      vehiclesLoaded = Array.isArray(capabilities.vehicleOptions),
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
      deliveryDate !== (snapshot.deliveryDate || '') ||
      vehicleType !== (snapshot.vehicleType || '');
    const inventoryLines = () =>
      lines
        .filter((line) => line.draftQuantity > 0)
        .map((line) => ({ sku: line.sku, quantity: line.draftQuantity }));
    const inventoryDraftKey = () =>
      JSON.stringify({ lines: inventoryLines(), deliveryDate, vehicleType });
    const currentRate = () =>
      inventoryEnabled && page !== 'details'
        ? inventoryPhase === 'ready'
          ? number(inventoryResult?.satisfactionRate)
          : null
        : number(snapshot.satisfactionRate);
    function queueInventory() {
      if (
        !inventoryEnabled ||
        !['order', 'catalog', 'recommendations'].includes(page) ||
        root.__fulfillmentEditorOwner !== mountOwner
      )
        return;
      const draftLines = inventoryLines();
      if (
        !draftLines.length ||
        draftLines.length > 50 ||
        lines.some((line) => line.draftQuantity === null) ||
        root.querySelector('input[aria-invalid="true"]')
      ) {
        clearTimeout(inventoryTimer);
        inventoryGeneration++;
        inventoryKey = '';
        inventoryPhase = 'invalid';
        inventoryResult = undefined;
        return;
      }
      const key = inventoryDraftKey();
      if (key === inventoryKey && ['loading', 'ready', 'error'].includes(inventoryPhase)) return;
      clearTimeout(inventoryTimer);
      inventoryKey = key;
      inventoryPhase = 'loading';
      inventoryResult = undefined;
      inventoryError = '';
      const generation = ++inventoryGeneration;
      inventoryTimer = setTimeout(async () => {
        if (root.__fulfillmentEditorOwner !== mountOwner || generation !== inventoryGeneration)
          return;
        try {
          const result = await state.onInventoryRecalculate({
            deliveryDate,
            ...(vehicleType !== (snapshot.vehicleType || '') ? { vehicleType } : {}),
            lines: draftLines,
          });
          if (
            root.__fulfillmentEditorOwner !== mountOwner ||
            generation !== inventoryGeneration ||
            key !== inventoryDraftKey()
          )
            return;
          if (
            !result ||
            number(result.satisfactionRate) === null ||
            Number(result.satisfactionRate) > 100 ||
            !/^[a-f0-9]{64}$/.test(result.inventoryHash || '') ||
            !Array.isArray(result.lines) ||
            result.lines.length !== draftLines.length ||
            new Set(result.lines.map((line) => line.sku)).size !== draftLines.length ||
            draftLines.some(
              (line) =>
                !result.lines.some(
                  (fresh) =>
                    fresh.sku === line.sku &&
                    number(fresh.quantity) === line.quantity &&
                    number(fresh.availableQuantity) !== null &&
                    number(fresh.shortage) !== null &&
                    Math.abs(
                      Number(fresh.shortage) -
                        Math.max(0, line.quantity - Number(fresh.availableQuantity)),
                    ) < 1e-7,
                ),
            )
          )
            throw Error('库存核算结果不完整，请重新核算');
          const total = result.lines.reduce((sum, line) => sum + Number(line.quantity), 0);
          const missing = result.lines.reduce((sum, line) => sum + Number(line.shortage), 0);
          const computedRate = (100 * (total - missing)) / total;
          if (!(total > 0) || Math.abs(computedRate - Number(result.satisfactionRate)) > 1e-6)
            throw Error('库存满足率与商品明细不一致，请重新核算');
          if (
            priceRecalculationEnabled &&
            (typeof result.pricesReady !== 'boolean' ||
              result.pricesReady !==
                result.lines.every(
                  (line) => line.priceStatus === 'READY' && number(line.unitPrice) !== null,
                ))
          )
            throw Error('价格核验结果不完整，请重新核验');
          inventoryResult = { ...result, satisfactionRate: computedRate };
          inventoryPhase = 'ready';
          for (const fresh of result.lines) {
            const line = lines.find((item) => item.sku === fresh.sku);
            line.shortage = Number(fresh.shortage);
            line.availableQuantity = Number(fresh.availableQuantity);
            if (priceRecalculationEnabled) {
              line.unitPrice = number(fresh.unitPrice);
              line.priceStatus = fresh.priceStatus || 'UNAVAILABLE';
              line.priceMessage = typeof fresh.priceMessage === 'string' ? fresh.priceMessage : '';
            }
          }
        } catch (error) {
          if (root.__fulfillmentEditorOwner !== mountOwner || generation !== inventoryGeneration)
            return;
          inventoryPhase = 'error';
          inventoryResult = undefined;
          inventoryError = error.message || '库存查询失败，请重新核算';
          if (priceRecalculationEnabled)
            for (const line of lines.filter((item) => item.draftQuantity > 0)) {
              line.unitPrice = null;
              line.priceStatus = 'PRICE_VERIFICATION_UNAVAILABLE';
              line.priceMessage = '价格与库存核验未完成，请重试。';
            }
        }
        updateTotals();
      }, 300);
    }
    const amount = () =>
      selected().some((line) => priceValue(line) === null || line.draftQuantity === null)
        ? '—'
        : display(selected().reduce((sum, line) => sum + priceValue(line) * line.draftQuantity, 0));
    function quantityError(line, quantity) {
      const minimum = number(line.minimumOrderQuantity),
        pallet = number(line.orderMultiple);
      if (quantity === null) return '请输入非负有效数量';
      if (quantity > 0 && !(pallet > 0)) return '每托箱数未提供，暂时无法校验整托数量。';
      if (quantity > 0 && minimum !== null && quantity < minimum)
        return `起订量为 ${display(minimum)} 箱`;
      if (
        quantity > 0 &&
        pallet > 0 &&
        Math.abs(quantity / pallet - Math.round(quantity / pallet)) > 1e-8
      )
        return `请按整托订购，数量须为 ${display(pallet)} 箱的整数倍。`;
      return '';
    }
    function taskNotice() {
      if (capabilities.modificationState && capabilities.reason) return capabilities.reason;
      if (state.status === 'processing') return '任务正在处理，请稍后刷新查看结果。';
      if (state.status === 'expired') return '本次确认任务已失效，请重新获取最新任务。';
      if (state.status === 'resolved' || state.status === 'deferred') {
        const decision = state.decisions?.[0];
        if (decision?.action_id === 'defer_shipment')
          return decision.deferred_until
            ? '已记录暂缓决定，预计交货日期：' + decision.deferred_until
            : '已记录暂缓决定，交货日期请联系业务核实。';
        return decision?.action_id === 'confirm_shipment'
          ? '已记录销售确认决定，可查看订单明细。'
          : '已记录处理结果，可查看订单明细。';
      }
      if (state.status !== 'pending') return '当前任务状态待核实，请刷新后查看最新结果。';
      return state.permissions?.canAct !== true
        ? '你可以查看此订单，处理操作需由指定人员完成。'
        : '当前无法在此处理，请联系业务核实。';
    }
    function reason() {
      if (!editable) return capabilities.reason || taskNotice();
      if (snapshot.credit?.status === 'insufficient') return '信用额度不足，需先补充并经后台核验。';
      if (
        !priceRecalculationEnabled &&
        ((snapshot.priceStatus && snapshot.priceStatus !== 'READY') ||
          (snapshot.omsEventType === 'PRICE_CHECK_FAILED' && snapshot.priceStatus !== 'READY'))
      )
        return state.notice || '商品价格核验未通过，请先点击“价格已维护”重新查价。';
      if (route(snapshot) !== 'order' && capabilities.omsModificationAvailable !== true) {
        const rate = number(snapshot.satisfactionRate);
        return rate === null
          ? '订单满足率未提供，请先核实库存满足情况。'
          : rate > 100
            ? '订单满足率超出有效范围，请先核实数据。'
            : `订单满足率为 ${display(rate)}%，未达到90%，请先核对库存及商品数量。`;
      }
      if (!selected().length) return '尚未选择商品，请先核对订单商品。';
      if (selected().some((line) => line.draftQuantity === null)) return '商品数量尚未完整提供。';
      const invalidQuantity = selected()
        .map((line) => line.inputError || quantityError(line, line.draftQuantity))
        .find(Boolean);
      if (invalidQuantity) return invalidQuantity;
      const invalidInput = root.querySelector('input[aria-invalid="true"]');
      if (invalidInput)
        return invalidInput.validationMessage || '商品数量未通过校验，请核对后重试。';
      if (capabilities.omsModificationAvailable === true) {
        if (capabilities.canSubmit !== true) return capabilities.reason || '当前不能提交订单修改。';
        if (
          capabilities.catalogAvailable !== true &&
          (lines.length !== original.length || lines.some((line) => !(line.draftQuantity > 0)))
        )
          return '当前支持调整原单商品数量，新增或删除商品请联系业务处理。';
        if (selected().length > 50) return '一次最多提交50种商品，请减少商品数量。';
        const packaging = selected().map(packagingError).find(Boolean);
        if (packaging) return packaging;
        if (
          vehicleType !== (snapshot.vehicleType || '') &&
          !capabilities.vehicleOptions?.some((option) => option.value === vehicleType)
        )
          return '请选择当前提货点可用的车型。';
        if (
          !priceRecalculationEnabled &&
          selected().some(
            (line) =>
              !original.some((item) => item.sku === line.sku) &&
              (line.priceStatus !== 'READY' || number(line.unitPrice) === null),
          )
        )
          return '新增商品价格核验未通过，请重新查询商品。';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)) return '请选择有效的预计交货日期。';
        if (inventoryEnabled && inventoryPhase === 'error') return inventoryError;
        if (
          inventoryEnabled &&
          (inventoryPhase !== 'ready' ||
            inventoryKey !== inventoryDraftKey() ||
            !/^[a-f0-9]{64}$/.test(inventoryResult?.inventoryHash || ''))
        )
          return '正在核算最新库存，请稍候。';
        if (priceRecalculationEnabled && inventoryResult?.pricesReady !== true)
          return (
            inventoryResult?.priceMessage || '所选商品价格核验未通过，请核对红色原因或更换商品。'
          );
      } else if (changed()) return '调整内容尚未通过重新核验，暂不能提交。';
      if (typeof state.onConfirm !== 'function') return '当前无法在此提交，请联系业务处理。';
      return '';
    }
    function updateTotals() {
      queueInventory();
      root.querySelectorAll('[data-editor-count]').forEach((item) => {
        item.textContent =
          item.dataset.editorCount === 'cart'
            ? `已选 ${selected().length} 种`
            : `共 ${quantityText(total())} · ${selected().length} 种商品`;
      });
      const price = root.querySelector('[data-editor-amount]');
      if (price) price.textContent = '¥ ' + amount();
      for (const item of root.querySelectorAll('[data-editor-price]')) {
        const line = (page === 'recommendations' ? recommendationDrafts : lines).find(
          (line) => line.sku === item.dataset.editorPrice,
        );
        if (line) item.textContent = '¥ ' + display(priceValue(line));
      }
      for (const item of root.querySelectorAll('[data-editor-price-reason]')) {
        const line = (page === 'recommendations' ? recommendationDrafts : lines).find(
          (line) => line.sku === item.dataset.editorPriceReason,
        );
        if (line) {
          item.textContent = priceMessage(line) ? '暂无价格' : '';
          item.hidden = !item.textContent;
        }
      }
      const originalNotice = root.querySelector('[data-editor-notice]');
      if (
        originalNotice &&
        priceRecalculationEnabled &&
        inventoryPhase === 'ready' &&
        inventoryResult &&
        snapshot.credit?.status !== 'insufficient'
      ) {
        originalNotice.textContent = inventoryResult.pricesReady
          ? ''
          : inventoryResult.priceMessage || '所选商品价格核验未通过。';
        originalNotice.hidden = !originalNotice.textContent;
      }
      const hint = root.querySelector('#editorSubmitReason');
      if (hint) {
        hint.textContent = reason();
        hint.hidden = !reason();
      }
      const rate = root.querySelector('.editor-rate');
      if (rate)
        rate.textContent =
          inventoryEnabled && page !== 'details'
            ? inventoryPhase === 'ready'
              ? `订单满足率：${rateText(currentRate())}`
              : inventoryPhase === 'error'
                ? '订单满足率：核算失败'
                : '订单满足率：待核算'
            : changed()
              ? '调整后满足率：待重新核算'
              : number(snapshot.satisfactionRate) === null
                ? '订单满足率：待核实'
                : number(snapshot.satisfactionRate) > 100
                  ? '订单满足率：数据异常'
                  : `订单满足率：${rateText(snapshot.satisfactionRate)}`;
      root.querySelectorAll('[data-editor-rate]').forEach((item) => {
        item.textContent = rateText(currentRate());
      });
      root.querySelectorAll('[data-editor-stock]').forEach((item) => {
        const line = lines.find((line) => line.sku === item.dataset.editorStock);
        if (!inventoryEnabled || page === 'details' || !line || !(line.draftQuantity > 0)) return;
        item.textContent =
          inventoryPhase === 'invalid'
            ? ''
            : inventoryPhase === 'ready'
              ? line.shortage > 0
                ? `库存不足：当前缺货 ${display(line.shortage)} 箱`
                : ''
              : inventoryPhase === 'error'
                ? '库存核算失败，请重新核算'
                : '正在核算最新库存';
        item.hidden = !item.textContent;
      });
      const retry = root.querySelector('[data-editor-inventory-retry]');
      if (retry) retry.disabled = inventoryPhase === 'loading';
      const confirm = root.querySelector('[data-editor-confirm]');
      if (confirm) confirm.disabled = Boolean(reason()) || saving;
      const dialogReason = root.querySelector('[data-editor-dialog-reason]');
      if (dialogReason) {
        dialogReason.textContent = reason();
        dialogReason.hidden = !reason();
      }
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
        node('p', specificationText(line.specification), 'editor-spec'),
        node('small', 'SKU：' + line.sku, 'editor-sku'),
      );
      info.append(
        node(
          'p',
          `起订量：${quantityText(line.minimumOrderQuantity)} ｜ ${
            number(line.orderMultiple) > 0
              ? `每托${display(line.orderMultiple)}箱（整托订购）`
              : '每托箱数：—'
          }`,
          'editor-order-rules',
        ),
      );
      const trading = node('div', undefined, 'editor-product-trading'),
        price = node('div', undefined, 'editor-price');
      const priceNumber = node('strong', '¥ ' + display(priceValue(line)));
      priceNumber.dataset.editorPrice = line.sku;
      const priceNotice = node(
        'small',
        priceMessage(line) ? '暂无价格' : '',
        'editor-price-warning',
      );
      priceNotice.dataset.editorPriceReason = line.sku;
      priceNotice.hidden = !priceNotice.textContent;
      price.append(priceNumber, priceNotice);
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
        input.disabled =
          !editable ||
          line.originalQuantity === null ||
          !(number(line.orderMultiple) > 0) ||
          Boolean(packagingError(line));
        const multiple = number(line.orderMultiple),
          minimum = number(line.minimumOrderQuantity),
          error = node('small', '', 'editor-quantity-error');
        error.setAttribute('role', 'status');
        function apply(value, restoreInvalid = true) {
          if (
            !editable ||
            line.originalQuantity === null ||
            !(multiple > 0) ||
            packagingError(line)
          )
            return;
          const quantity = number(value);
          const invalid = quantityError(line, quantity);
          line.inputError = invalid;
          input.setCustomValidity(invalid);
          input.setAttribute('aria-invalid', String(Boolean(invalid)));
          error.textContent = invalid;
          if (invalid) {
            if (restoreInvalid)
              input.value = line.draftQuantity === null ? '' : String(line.draftQuantity);
            updateTotals();
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
              (Math.ceil(line.draftQuantity / step - 1e-8) - 1) * step < (minimum || 0)
                ? 0
                : Math.max(0, (Math.ceil(line.draftQuantity / step - 1e-8) - 1) * step),
            ),
          !editable || line.draftQuantity === null || line.draftQuantity === 0 || !(multiple > 0),
        );
        minus.setAttribute('aria-label', `${line.sku} 减少`);
        const plus = button(
          '+',
          () =>
            apply(
              Math.max(
                (Math.floor(line.draftQuantity / step + 1e-8) + 1) * step,
                minimum > 0 ? Math.ceil(minimum / step) * step : step,
              ),
            ),
          !editable ||
            line.draftQuantity === null ||
            !(multiple > 0) ||
            Boolean(packagingError(line)),
        );
        plus.setAttribute('aria-label', `${line.sku} 增加`);
        input.addEventListener('input', () => apply(input.value, false));
        input.addEventListener('change', () => apply(input.value));
        const initialError =
          line.inputError ||
          (line.draftQuantity === null ? '' : quantityError(line, line.draftQuantity));
        input.setCustomValidity(initialError);
        input.setAttribute('aria-invalid', String(Boolean(initialError)));
        error.textContent = initialError;
        controls.append(minus, input, plus, node('span', '箱'));
        trading.append(controls);
        if (
          capabilities.catalogAvailable === true &&
          editable &&
          (line.draftQuantity === null || line.draftQuantity > 0)
        ) {
          const remove = button(
            '',
            () => {
              line.draftQuantity = 0;
              line.inputError = '';
              render();
            },
            false,
            'editor-remove',
          );
          remove.setAttribute('aria-label', `删除商品 ${line.name || line.sku}`);
          remove.title = '删除商品';
          const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          icon.setAttribute('viewBox', '0 0 24 24');
          icon.setAttribute('aria-hidden', 'true');
          icon.setAttribute('focusable', 'false');
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('d', 'M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6');
          path.setAttribute('fill', 'none');
          path.setAttribute('stroke', 'currentColor');
          path.setAttribute('stroke-width', '1.7');
          path.setAttribute('stroke-linecap', 'round');
          path.setAttribute('stroke-linejoin', 'round');
          icon.append(path);
          remove.append(icon);
          trading.append(remove);
        }
        info.append(error);
      }
      info.append(trading);
      const packaging = packagingError(line);
      if (packaging) info.append(node('p', packaging, 'editor-stock-warning'));
      const stock = node(
        'p',
        number(line.shortage) > 0
          ? `库存不足：原订单缺货 ${display(line.shortage)} 箱`
          : number(line.shortage) === null
            ? '缺货数据未完整提供'
            : '',
        'editor-stock-warning',
      );
      stock.dataset.editorStock = line.sku;
      stock.hidden = !stock.textContent;
      info.append(stock);
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
              ['订单满足率', rateText(currentRate())],
            ]
          : []),
        ['DMS订单号', ids.dms],
        ['订单交货日期', snapshot.deliveryDate || '—'],
      ]) {
        const valueNode = node('dd', value);
        if (label === '订单满足率') valueNode.dataset.editorRate = '';
        fields.append(node('dt', label), valueNode);
      }
      info.append(fields);
      return info;
    }
    function render() {
      window.OrderDeliveryDatePicker?.close(false);
      if (root.__fulfillmentEditorOwner !== mountOwner) return;
      root.replaceChildren();
      root.dataset.page = page;
      const title = {
        details: '订单明细',
        order: '订单提交',
        catalog: '商品增减',
        recommendations: '商品推荐',
        credit: '确认额度已补充',
        price: '确认',
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
      if (state.orderRefresh && state.permissions?.canAct === true) {
        const panel = node('section', undefined, 'editor-refresh-panel');
        panel.append(node('p', state.orderRefresh.message || '请刷新最新订单后继续修改。'));
        const submitted = capabilities.submittedOrder;
        if (submitted?.lines?.length) {
          const total = submitted.lines.reduce((sum, line) => sum + Number(line.quantity), 0);
          panel.append(
            node('p', `已提交OMS：${display(total)} 箱，预计交货日期：${submitted.deliveryDate}`),
          );
          if (submitted.vehicleType)
            panel.append(
              node(
                'p',
                `已提交车型：${submitted.vehicleType}，商品：${submitted.lines.map((line) => line.sku).join('、')}`,
              ),
            );
        }
        if (state.orderRefresh.latestOrder) {
          const latest = state.orderRefresh.latestOrder;
          panel.append(
            node(
              'p',
              `OMS最新订单：${quantityText(latest.quantity)}，预计交货日期：${latest.deliveryDate || '—'}`,
            ),
          );
        }
        if (typeof state.onRefreshOrder === 'function')
          panel.append(
            button(
              saving ? '刷新中…' : '刷新最新订单',
              async () => {
                if (saving || state.previewOnly === true) return;
                saving = true;
                render();
                try {
                  await state.onRefreshOrder();
                } catch (error) {
                  saving = false;
                  notice = error.message;
                  render();
                }
              },
              saving || state.previewOnly === true,
            ),
          );
        if (state.orderRefresh.status === 'ready' && typeof state.onOpenLatest === 'function')
          panel.append(
            button(
              '继续修改数量和交期',
              () => state.onOpenLatest(),
              state.previewOnly === true,
              'editor-primary',
            ),
          );
        body.append(panel);
      }
      if (state.permissions?.canAct !== true || state.status !== 'pending')
        body.append(node('p', taskNotice(), 'editor-warning'));
      if (state.status === 'pending' && typeof state.notice === 'string' && state.notice.trim()) {
        const message = node('p', state.notice, 'editor-warning');
        message.dataset.editorNotice = '';
        message.style.whiteSpace = 'pre-line';
        body.append(message);
      }
      if (page === 'price') {
        const panel = node('section', undefined, 'editor-credit-panel');
        panel.append(node('h2', '确认价格已维护？'));
        if (notice) panel.append(node('p', notice, 'editor-warning'));
        const allowed =
          state.status === 'pending' &&
          state.permissions?.canAct === true &&
          state.previewOnly !== true &&
          typeof state.onPriceRecheck === 'function';
        panel.append(
          button(
            saving ? '查价中…' : '确认',
            async () => {
              if (!allowed || saving) return;
              saving = true;
              notice = '';
              render();
              try {
                await state.onPriceRecheck();
              } catch (error) {
                notice = error.message;
              } finally {
                saving = false;
                if (root.dataset.page === 'price') render();
              }
            },
            !allowed || saving,
            'editor-primary',
          ),
          button('返回', () => window.close(), saving),
        );
        body.append(panel);
        root.append(header, body);
        return;
      }
      if (page === 'credit') {
        const panel = node('section', undefined, 'editor-credit-panel');
        panel.append(
          node('h2', '确认额度已补充？'),
          node(
            'p',
            number(snapshot.credit?.shortfall) > 0
              ? `信用额度校验未通过，缺口：${display(snapshot.credit.shortfall)} 元`
              : snapshot.credit?.shortfall == null
                ? '信用额度校验未通过，具体缺口金额未提供。'
                : '信用额度校验结果与缺口金额需核实，请联系业务确认。',
          ),
          node('p', '请联系业务核实额度补充结果，以后台核验为准。'),
        );
        panel.append(
          button('确认', () => {}, true, 'editor-primary'),
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
        vehicle.title = capabilities.vehicleNotice || '';
        const cars =
          capabilities.vehicleRulesAvailable === true && Array.isArray(capabilities.vehicleOptions)
            ? capabilities.vehicleOptions
            : [];
        vehicle.disabled = !editable || !cars.length;
        const current = node('option', vehicleType || '选择车型');
        current.value = vehicleType;
        vehicle.append(current);
        for (const item of cars.filter((item) => item.value && item.value !== vehicleType)) {
          const option = node('option', item.label || item.value);
          option.value = item.value;
          vehicle.append(option);
        }
        vehicle.value = vehicleType;
        vehicle.addEventListener('change', () => {
          vehicleType = vehicle.value;
          updateTotals();
        });
        if (
          editable &&
          capabilities.vehicleRulesAvailable === true &&
          !vehiclesLoaded &&
          !loadingVehicles &&
          typeof state.onLookupVehicles === 'function'
        ) {
          loadingVehicles = true;
          Promise.resolve()
            .then(() => state.onLookupVehicles())
            .then((options) => {
              if (root.__fulfillmentEditorOwner !== mountOwner) return;
              if (
                !Array.isArray(options) ||
                options.length > 100 ||
                options.some((item) => !item || typeof item.value !== 'string' || !item.value)
              )
                throw Error('车型资料返回异常，请重新打开订单');
              capabilities.vehicleOptions = options;
              vehiclesLoaded = true;
              const currentVehicle = root.querySelector('[aria-label="选择车型"]');
              if (currentVehicle) {
                for (const item of options.filter(
                  (item) => item.value && item.value !== vehicleType,
                )) {
                  const option = node('option', item.label || item.value);
                  option.value = item.value;
                  currentVehicle.append(option);
                }
                currentVehicle.disabled = !options.length;
              }
            })
            .catch((error) => {
              if (root.__fulfillmentEditorOwner !== mountOwner) return;
              vehiclesLoaded = true;
              capabilities.vehicleNotice = error.message || '车型读取失败，请重新打开订单';
              const currentVehicle = root.querySelector('[aria-label="选择车型"]');
              if (currentVehicle) currentVehicle.title = capabilities.vehicleNotice;
            })
            .finally(() => {
              loadingVehicles = false;
            });
        }
        const date = node('input');
        date.type = 'date';
        date.hidden = true;
        date.value = /^\d{4}-\d{2}-\d{2}$/.test(deliveryDate) ? deliveryDate : '';
        date.disabled = !editable;
        date.setAttribute('aria-label', '预计交货日期');
        const dateTrigger = button(
          date.value || '选择日期',
          () => {
            window.OrderDeliveryDatePicker.open({
              trigger: dateTrigger,
              value: date.value,
              onConfirm(value) {
                if (root.__fulfillmentEditorOwner !== mountOwner || !dateTrigger.isConnected)
                  return;
                date.value = value;
                date.dispatchEvent(new Event('change', { bubbles: true }));
              },
            });
          },
          !editable,
          'editor-date-trigger',
        );
        dateTrigger.setAttribute('aria-label', '选择预计交货日期');
        dateTrigger.setAttribute('aria-haspopup', 'dialog');
        dateTrigger.setAttribute('aria-expanded', 'false');
        dateTrigger.setAttribute('aria-controls', 'deferDatePicker');
        date.addEventListener('change', () => {
          deliveryDate = date.value;
          dateTrigger.textContent = date.value || '选择日期';
          updateTotals();
        });
        const label = node('div', undefined, 'editor-delivery-date');
        label.append(node('span', '预计交货日期'), date, dateTrigger);
        toolbar.append(vehicle, label);
        header.lastElementChild.replaceWith(
          button(
            '+ 商品',
            () => {
              page = 'catalog';
              render();
            },
            false,
            'editor-add editor-header-add',
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
          ...(capabilities.catalogAvailable === true && typeof state.onLookupProducts === 'function'
            ? [
                button(
                  loadingProducts ? '查询中…' : '查找商品',
                  async () => {
                    if (loadingProducts || !editable) return;
                    loadingProducts = true;
                    render();
                    try {
                      const found = await state.onLookupProducts(search.trim());
                      if (!Array.isArray(found) || found.length > 20)
                        throw Error('商品目录返回异常，请重试');
                      for (const item of found) {
                        if (!item?.sku || lines.some((line) => line.sku === item.sku)) continue;
                        if (lines.length >= 200) break;
                        lines.push({
                          ...item,
                          sku: String(item.sku),
                          originalQuantity: 0,
                          draftQuantity: 0,
                        });
                      }
                      notice = found.length ? '' : '当前提货点没有匹配的可用商品';
                    } catch (error) {
                      notice = error.message;
                    } finally {
                      loadingProducts = false;
                      render();
                    }
                  },
                  loadingProducts || !editable,
                  'editor-add',
                ),
              ]
            : []),
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
              page === 'recommendations' ? '暂无推荐商品' : '没有匹配的商品',
              'editor-empty',
            ),
          );
      }
      renderProducts();
      if (page === 'order' || page === 'recommendations') {
        const notes = node('details', undefined, 'editor-disclosure');
        notes.append(node('summary', '订单信息'));
        if (page === 'order' || page === 'recommendations') notes.append(infoBlock());
        const hint = node('p', reason(), 'editor-warning');
        hint.id = 'editorSubmitReason';
        hint.hidden = !reason();
        notes.append(hint);
        body.append(notes);
      }
      const footer = node('footer'),
        summary = node('div', undefined, 'editor-totals'),
        count = node('strong');
      count.dataset.editorCount = '';
      summary.append(count, node('p', '', 'editor-rate'));
      if (inventoryEnabled && page !== 'details') {
        const retry = button(
          '重新核算库存',
          () => {
            inventoryKey = '';
            inventoryPhase = 'idle';
            updateTotals();
          },
          false,
          'editor-add',
        );
        retry.dataset.editorInventoryRetry = '';
        summary.append(retry);
      }
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
      root.append(header, body, footer);
      updateTotals();
      if (notice) body.prepend(node('p', notice, 'editor-warning'));
      if (modal) {
        const overlay = node('div', undefined, 'editor-modal-overlay'),
          dialog = node('section', undefined, 'editor-confirm-dialog');
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-label', '确认提交');
        dialog.append(node('h2', '确认提交？'));
        const dialogReason = node('p', reason());
        dialogReason.dataset.editorDialogReason = '';
        dialogReason.hidden = !reason();
        dialog.append(dialogReason);
        dialog.append(
          button(
            saving ? '保存中…' : '确认',
            async () => {
              if (state.previewOnly === true || reason() || saving) return;
              const verifiedKey = inventoryDraftKey(),
                verifiedInventory = inventoryResult;
              if (
                inventoryEnabled &&
                (!verifiedInventory ||
                  !/^[a-f0-9]{64}$/.test(verifiedInventory.inventoryHash || ''))
              ) {
                notice = '库存核验尚未完成，请重新核算后再提交。';
                modal = false;
                render();
                return;
              }
              const draft = {
                deliveryDate,
                ...(vehicleType !== (snapshot.vehicleType || '') ? { vehicleType } : {}),
                ...(inventoryEnabled ? { inventoryHash: verifiedInventory.inventoryHash } : {}),
                lines: (capabilities.catalogAvailable === true
                  ? lines.filter((line) => line.draftQuantity > 0)
                  : lines
                ).map((line) => ({ sku: line.sku, quantity: line.draftQuantity })),
              };
              saving = true;
              notice = '';
              try {
                render();
                if (
                  verifiedKey !== inventoryDraftKey() ||
                  (inventoryEnabled &&
                    (inventoryPhase !== 'ready' ||
                      inventoryKey !== verifiedKey ||
                      inventoryResult !== verifiedInventory))
                )
                  throw Error('库存核验已变化，请等待重新核算后再提交。');
                await state.onConfirm(draft);
                modal = false;
              } catch (error) {
                notice = error.message;
                if (
                  [
                    'ORDER_CONFIRMATION_OMS_MODIFICATION_INVENTORY_CHANGED',
                    'ORDER_CONFIRMATION_OMS_MODIFICATION_INVENTORY_UNAVAILABLE',
                    'ORDER_CONFIRMATION_OMS_MODIFICATION_PRICE_NOT_READY',
                  ].includes(error.code)
                ) {
                  inventoryKey = '';
                  inventoryPhase = 'error';
                  inventoryError = error.message;
                  inventoryResult = undefined;
                }
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
        dialog.querySelector('button').dataset.editorConfirm = '';
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
