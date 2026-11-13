import { mountSalesConfirmationPeople } from './sales-confirmation-people.mjs';
import { confirmationDraft, salesConfirmationCard } from './sales-confirmation-card.mjs';
export { confirmationDraft, salesConfirmationCard } from './sales-confirmation-card.mjs';

export function mountSalesConfirmation(document, simulation, formal) {
  const overlay = document.getElementById('salesConfirmOverlay');
  const dialog = overlay.querySelector('.confirmation-dialog');
  const form = document.getElementById('salesConfirmForm');
  const heading = document.getElementById('salesConfirmTitle');
  const orderLabel = document.getElementById('salesConfirmOrder');
  dialog.classList.add('sales-confirmation-preview');
  let opener;
  let generation = 0;
  const node = (tag, text, className) => {
    const element = document.createElement(tag);
    if (text != null) element.textContent = text;
    if (className) element.className = className;
    return element;
  };
  function close() {
    generation++;
    overlay.hidden = true;
    form.replaceChildren();
    orderLabel.textContent = '';
    if (opener?.isConnected) opener.focus();
    opener = undefined;
  }
  form.addEventListener('submit', (event) => event.preventDefault());
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay || event.target.closest('[data-close-sales-confirm]')) close();
  });
  document.addEventListener('keydown', (event) => {
    if (overlay.hidden) return;
    if (event.key === 'Escape') close();
    if (event.key === 'Tab') {
      const elements = [
        ...dialog.querySelectorAll(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), summary',
        ),
      ].filter(
        (element) => !element.closest('details:not([open])') || element.tagName === 'SUMMARY',
      );
      const first = elements[0],
        last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  });
  return {
    open(input, trigger) {
      const current = ++generation;
      const draft = confirmationDraft(input);
      const simulated = simulation?.matches(draft) === true;
      opener = trigger;
      form.replaceChildren();
      heading.textContent = '发起飞书销售确认';
      orderLabel.textContent = `订单 ${draft.orderNo} · ${draft.customer} · ${draft.base}`;
      form.append(
        node(
          'p',
          '由机器人在指定飞书群 @对应销售并发送订单待确认卡片。销售通过“订单处理”核对提交、调整商品或核验额度，也可暂缓发货；本工作台仅发起通知、展示处理结果。',
          'sales-preview-hint',
        ),
      );
      const fields = node('dl', null, 'sales-preview-fields');
      for (const [label, value] of [
        ['对应销售', draft.seller],
        ['接收群', simulated ? '订单履约机器人测试群 · 仅艾特田庚' : '由后台按基地及销售确定'],
        ['订单满足率', draft.rate === null ? '—' : draft.rate.toFixed(1) + '%'],
        ['订货数量', draft.quantity],
        ['统计周期', draft.period],
      ])
        fields.append(node('dt', label), node('dd', value));
      form.append(fields);
      const status = node(
        'p',
        simulated
          ? '仅发送模拟卡片到测试群，不触发真实发货或改单。'
          : formal
            ? '正在核对发卡权限…'
            : '飞书群发送与人员映射接口尚未接入，当前未发送通知。',
        'sales-preview-notice',
      );
      status.role = 'status';
      form.append(status);
      const footer = node('div', null, 'sales-preview-actions');
      const cancel = node('button', '返回');
      cancel.type = 'button';
      cancel.addEventListener('click', close);
      const send = node(
        'button',
        simulated ? '发送到飞书测试群（仅模拟）' : '发送到飞书群',
        'primary',
      );
      send.type = 'button';
      send.disabled = !simulated;
      if (simulated)
        send.addEventListener('click', async () => {
          send.disabled = true;
          status.textContent = '正在发送模拟卡片…';
          try {
            await simulation.notify(draft);
            status.textContent =
              '模拟卡片已发送至订单履约机器人测试群，仅艾特田庚。请在飞书中操作；工作台会同步模拟结果。';
            send.textContent = '模拟卡片已发送';
          } catch (error) {
            status.textContent = `发送失败：${error.message}`;
            send.disabled = false;
          }
        });
      if (!simulated && formal) {
        let sending = false,
          completed = false,
          ready = false,
          testOptions,
          people;
        const alive = () => current === generation && !overlay.hidden;
        const valid = () => ready && (!testOptions?.open || people?.valid() === true);
        const changed = () => {
          if (alive()) send.disabled = sending || completed || !valid();
        };
        void formal
          .configuration()
          .then((configuration) => {
            if (!alive()) return;
            if (configuration?.available !== true) {
              status.textContent = '当前人员未获发卡授权或后台入口未启用，未发送通知。';
              return;
            }
            if (!['test', 'sales'].includes(configuration.mode))
              throw Error('后台未返回有效的发卡配置，请稍后重试。');
            if (configuration.mode === 'test') {
              status.textContent =
                '测试联调：默认由当前测试人员处理。需指定其他人员时，可展开测试选项。';
              testOptions = node('details', null, 'sales-test-options');
              testOptions.append(node('summary', '测试选项（指定收件人与处理人）'));
              testOptions.addEventListener('toggle', () => {
                if (!alive() || sending || completed) return;
                if (testOptions.open && !people) {
                  people = mountSalesConfirmationPeople(document, formal, alive, changed);
                  testOptions.append(people.element);
                  void people.load();
                }
                changed();
              });
              form.insertBefore(testOptions, footer);
            } else {
              status.textContent = '后台将按订单对应销售分派，并发送到配置的飞书群。';
            }
            ready = true;
            changed();
          })
          .catch((error) => {
            if (alive()) status.textContent = `暂时无法发卡：${error.message}`;
          });
        send.addEventListener('click', async () => {
          if (send.disabled || sending || completed) return;
          sending = true;
          send.disabled = true;
          status.textContent = '正在创建确认任务…';
          try {
            const delivery = testOptions?.open ? people.delivery() : {};
            const result = await formal.notify(draft, delivery);
            if (!alive()) return;
            completed = true;
            status.textContent =
              result.status === 'resolved'
                ? '该订单快照已有处理记录，可在确认状态中查看。'
                : result.delivery === 'sent'
                  ? '确认卡片已发送，等待指定人员处理；不代表 OMS 已执行。'
                  : result.delivery === 'failed'
                    ? '任务已保存，卡片发送失败；请核对状态后重试。'
                    : result.delivery === 'verification_required'
                      ? '发送结果待核实，请查看确认状态，不要重复发起。'
                      : '确认任务已创建，卡片正在发送，请在确认状态中查看结果。';
            send.textContent = '确认任务已登记';
          } catch (error) {
            if (alive()) status.textContent = error.message;
          } finally {
            sending = false;
            changed();
          }
        });
      }
      send.title = simulated
        ? '只向测试群发送模拟卡片并艾特田庚，不执行业务确认'
        : formal
          ? '向对应销售发起飞书确认，客户端不处理订单'
          : '需 GEA 提供 order01 受控发送接口、接收群和销售账号映射；不在客户端确认订单';
      footer.append(cancel, send);
      form.append(footer);
      overlay.hidden = false;
      cancel.focus();
      if (simulated) send.click();
      return salesConfirmationCard(draft);
    },
    close,
  };
}
