import { JSDOM } from 'jsdom';

export function prepareFulfillmentPresentation(html) {
  const dom = new JSDOM(html);
  const d = dom.window.document;
  for (const script of d.querySelectorAll('script')) script.remove();
  d.querySelector('main').id = 'app';
  const status = d.createElement('span');
  status.id = 'prototypeStatus';
  status.role = 'status';
  status.textContent = '等待读取当前授权数据';
  d.querySelector('.topbar').append(status);
  for (const body of d.querySelectorAll('tbody')) {
    body.replaceChildren();
    const row = body.insertRow(),
      cell = row.insertCell();
    cell.colSpan = Math.max(
      1,
      body.closest('table').querySelectorAll('thead tr:last-child th').length,
    );
    cell.textContent = '待数据接入';
  }
  for (const node of d.querySelectorAll(
    '.metric strong,.trace-step strong,.formula-item strong,.shortage-bar b,.risk-item b',
  )) {
    const unit = node.querySelector('.metric-unit');
    node.replaceChildren(d.createTextNode('—'), ...(unit ? [unit] : []));
  }
  for (const node of d.querySelectorAll(
    '.trace-step small,.risk-item small,.risk-item strong,.shortage-formula small',
  ))
    node.textContent = '待数据接入';
  for (const bar of d.querySelectorAll('.shortage-bar-track i')) bar.style.width = '0%';
  for (const svg of d.querySelectorAll('svg.delivery-line-chart')) {
    svg.replaceChildren();
    const text = d.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', '320');
    text.setAttribute('y', '125');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('fill', '#8d98a8');
    text.setAttribute('font-size', '14');
    text.textContent = '节点数据待接入';
    svg.append(text);
  }
  for (const analysis of d.querySelectorAll('.fulfillment-analysis')) {
    const title = analysis.querySelector('h3');
    if (title) title.textContent = '等待当前授权数据分析';
    const paragraph = analysis.querySelector(':scope > p');
    if (paragraph)
      paragraph.textContent = '数据加载后在此展示当前范围的履约情况；缺失指标保持未知。';
    const stamp = analysis.querySelector('.fulfillment-analysis-head > span');
    if (stamp) stamp.textContent = '数据待加载';
  }
  const walker = d.createTreeWalker(d.body, dom.window.NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    if (node.parentElement?.closest('style,thead')) continue;
    if (
      /演示|模拟|2026-10-12|6,320|9,860|7,550|8,450|117,000|18,260|11,940|94\.6/.test(
        node.textContent,
      )
    )
      node.textContent = '数据待接入，当前范围以受控查询结果为准';
  }
  for (const button of d.querySelectorAll('.sales-confirm-trigger')) {
    button.disabled = true;
    button.title = '销售确认接口尚未接入';
  }
  const result = dom.serialize();
  dom.window.close();
  return result;
}
