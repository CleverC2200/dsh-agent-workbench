export function mountPushSettings(document, request) {
  const button = document.getElementById('fulfillmentPushSettings');
  const dialog = document.createElement('dialog');
  dialog.className = 'fulfillment-push-settings';
  dialog.setAttribute('aria-labelledby', 'fulfillmentPushSettingsTitle');
  dialog.innerHTML = `<form>
    <h2 id="fulfillmentPushSettingsTitle">飞书推送设置</h2>
    <p>达标推送针对当前账号获授权的当天订单，接收人为订单对应确认人；不改变订单状态。</p>
    <fieldset disabled>
      <label class="push-setting-toggle"><input name="thresholdEnabled" type="checkbox"> 满足率达标时推送</label>
      <label class="push-setting-value">订单满足率达到或高于 <input name="thresholdPercent" aria-label="满足率阈值" type="number" min="0" max="100" step="0.01" required> % 时，发送飞书确认卡片</label>
      <label class="push-setting-toggle"><input name="reminderEnabled" type="checkbox"> 未确认订单定时提醒</label>
      <label class="push-setting-value">已发出确认卡片但未处理的订单，每 <input name="reminderHours" aria-label="提醒间隔小时" type="number" min="1" max="168" step="1" required> 小时提醒一次，确认、暂缓或过期后停止</label>
    </fieldset>
    <p class="push-settings-status" role="status">正在读取设置…</p>
    <div class="push-settings-actions"><button type="button" data-close>返回</button><button type="submit" disabled>保存设置</button></div>
  </form>`;
  document.body.append(dialog);
  const form = dialog.querySelector('form'),
    fields = form.elements;
  const status = dialog.querySelector('[role="status"]'),
    fieldset = dialog.querySelector('fieldset');
  const save = dialog.querySelector('[type="submit"]');
  let generation = 0,
    controller,
    version;
  const busy = (value) => {
    fieldset.disabled = value;
    save.disabled = value;
  };
  function reset() {
    generation++;
    controller?.abort();
    version = undefined;
    busy(true);
    form.reset();
    if (dialog.open) dialog.close();
    status.textContent = '设置尚未读取';
  }
  dialog.addEventListener('close', () => {
    generation++;
    controller?.abort();
    version = undefined;
  });
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  button.addEventListener('click', async () => {
    reset();
    const own = ++generation;
    controller = new AbortController();
    status.textContent = '正在读取设置…';
    dialog.showModal();
    try {
      const value = await request({ operation: 'settings_get' }, controller.signal);
      if (own !== generation || !dialog.open) return;
      const settings = validatePushSettings(value.settings);
      if (typeof value.version !== 'string') throw Error('设置响应不完整');
      for (const name of ['thresholdEnabled', 'reminderEnabled'])
        fields[name].checked = settings[name];
      for (const name of ['thresholdPercent', 'reminderHours'])
        fields[name].value = String(settings[name]);
      version = value.version;
      if (value.mode === 'test')
        dialog.querySelector('h2 + p').textContent =
          '测试模式：针对当前账号获授权的当天订单，发给当前测试发起人；不执行 OMS。正式模式按订单对应确认人推送。';
      busy(false);
      status.textContent = pushExecutionMessage(value);
    } catch (error) {
      if (own === generation) status.textContent = '设置读取失败，未启用推送：' + error.message;
    }
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!version || save.disabled || !form.reportValidity()) return;
    const own = generation;
    let settings;
    try {
      settings = validatePushSettings({
        thresholdEnabled: fields.thresholdEnabled.checked,
        thresholdPercent: fields.thresholdPercent.valueAsNumber,
        reminderEnabled: fields.reminderEnabled.checked,
        reminderHours: fields.reminderHours.valueAsNumber,
      });
    } catch (error) {
      status.textContent = error.message;
      return;
    }
    busy(true);
    status.textContent = '正在保存…';
    try {
      const result = await request(
        { operation: 'settings_save', settings, expectedVersion: version },
        controller.signal,
      );
      if (own !== generation || !dialog.open) return;
      const saved = validatePushSettings(result.settings);
      if (typeof result.version !== 'string') throw Error('未取得保存回执，请关闭后重新核对');
      version = result.version;
      for (const name of ['thresholdEnabled', 'reminderEnabled'])
        fields[name].checked = saved[name];
      for (const name of ['thresholdPercent', 'reminderHours'])
        fields[name].value = String(saved[name]);
      status.textContent = pushExecutionMessage(result, true);
      busy(false);
    } catch (error) {
      if (own === generation) {
        status.textContent = '保存未确认，请关闭后重新核对：' + error.message;
        version = undefined;
      }
    }
  });
  for (const event of ['gea-session-changing', 'gea-identity-changed', 'pagehide'])
    document.defaultView.addEventListener(event, reset);
  return { clear: reset };
}

export function pushExecutionMessage(value, saved = false) {
  const prefix = saved ? '设置已保存；' : '';
  const enabled = value.settings?.thresholdEnabled || value.settings?.reminderEnabled;
  const rules = enabled ? '' : '达标推送和定时提醒均已关闭。';
  if (value.workerEnabled !== true) return prefix + '后台调度未启用，开启的规则暂不执行。' + rules;
  if (value.workerRunning === false)
    return prefix + '后台调度已配置但未运行，开启的规则暂不执行。' + rules;
  if (value.workerRunning !== true)
    return prefix + '后台调度已配置，后端尚未返回线程运行状态，暂不能确认自动执行。' + rules;
  if (value.lastCycleResult === 'REJECTED')
    return prefix + '后台线程运行中，但最近一次调度被拒绝，请核对后台准备状态。' + rules;
  if (value.lastCycleResult !== 'COMPLETED')
    return prefix + '后台线程已启动，等待首次调度。' + rules;
  return (
    prefix +
    (enabled
      ? '后台调度运行中，按已开启的规则检查；是否投递以订单处理记录为准，关闭页面不影响执行。'
      : '后台调度运行中；' + rules)
  );
}

export function validatePushSettings(value) {
  if (
    !value ||
    Object.keys(value).sort().join(',') !==
      'reminderEnabled,reminderHours,thresholdEnabled,thresholdPercent' ||
    typeof value.thresholdEnabled !== 'boolean' ||
    typeof value.reminderEnabled !== 'boolean' ||
    !Number.isFinite(value.thresholdPercent) ||
    value.thresholdPercent < 0 ||
    value.thresholdPercent > 100 ||
    Math.abs(value.thresholdPercent * 100 - Math.round(value.thresholdPercent * 100)) > 1e-7 ||
    !Number.isInteger(value.reminderHours) ||
    value.reminderHours < 1 ||
    value.reminderHours > 168
  )
    throw Error('满足率须为 0–100%（最多两位小数），提醒间隔须为 1–168 小时的整数');
  return { ...value };
}
