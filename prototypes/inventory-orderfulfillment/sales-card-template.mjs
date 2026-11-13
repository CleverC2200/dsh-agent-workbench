const conditional = (path, yes, no) => ({
  $if: path,
  yes,
  ...(no === undefined ? {} : { no }),
});
const grey = (content) => `<font color='grey'>${content}</font>`;
const secondary = (content) => ({ tag: 'markdown', content: grey(content) });
const button = (label, mode, type) => ({
  tag: 'button',
  type,
  text: { tag: 'plain_text', content: label },
  behaviors: conditional(
    'section.hasEntry',
    [{ type: 'open_url', default_url: `\${section.entryUrl}%26view%3D${mode.toLowerCase()}` }],
    conditional(`section.has${mode}`, [
      { type: 'open_url', default_url: `\${section.${mode}Url}` },
    ]),
  ),
  disabled: conditional('section.hasEntry', false, conditional(`section.has${mode}`, false, true)),
  disabled_tips: conditional(
    'section.hasEntry',
    undefined,
    conditional(`section.has${mode}`, undefined, {
      tag: 'plain_text',
      content: '等待 GEA 提供当前订单的受控操作入口',
    }),
  ),
});
export const salesCardTemplate = {
  schema: '2.0',
  config: { update_multi: true, wide_screen_mode: true },
  header: {
    template: 'blue',
    title: {
      tag: 'lark_md',
      content: '${mentions}订单待确认',
    },
  },
  body: {
    elements: [
      {
        $each: 'sections',
        as: 'section',
        template: [
          conditional('section.separator', { tag: 'hr' }),
          {
            tag: 'div',
            text: {
              tag: 'plain_text',
              text_color: 'red',
              content: conditional('section.hasInstruction', '${section.instruction}', {
                $concat: [
                  conditional(
                    'section.rateKnown',
                    conditional(
                      'section.ready',
                      '请核对订单信息并处理。',
                      '请核对订单信息并处理。',
                    ),
                    '订单满足率暂未完整提供，请核对后处理。',
                  ),
                  {
                    $each: 'section.shortages',
                    as: 'shortage',
                    template: '\nSKU：${shortage.sku} 原订单缺货：${shortage.quantity}',
                  },
                  conditional('section.moreShortages', '\n其余缺货商品请在“订单处理”中核对。'),
                ],
              }),
            },
          },
          {
            tag: 'column_set',
            flex_mode: 'stretch',
            columns: [
              {
                tag: 'column',
                width: 'weighted',
                weight: 4,
                elements: [
                  {
                    tag: 'markdown',
                    content: conditional(
                      'section.hasExecutionOrderNo',
                      conditional(
                        'section.hasEntry',
                        grey(
                          '执行单号：[${section.executionOrderNo}](${section.entryUrl}%26view%3Ddetails)',
                        ),
                        conditional(
                          'section.hasDetails',
                          grey('执行单号：[${section.executionOrderNo}](${section.detailsUrl})'),
                          grey('执行单号：${section.executionOrderNo}'),
                        ),
                      ),
                      grey('执行单号：—'),
                    ),
                  },
                  {
                    tag: 'markdown',
                    content: conditional(
                      'section.hasEntry',
                      grey(
                        'DMS订单号：[${section.orderNoMarkdown}](${section.entryUrl}%26view%3Ddetails)',
                      ),
                      conditional(
                        'section.hasDetails',
                        grey('DMS订单号：[${section.orderNoMarkdown}](${section.detailsUrl})'),
                        grey('DMS订单号：${section.orderNoMarkdown}'),
                      ),
                    ),
                  },
                  ...[
                    '客户：${section.customer}',
                    '订单满足率：${section.rate}',
                    '总数量：${section.quantity}',
                    '订单交货日期：${section.deliveryDate}',
                  ].map(secondary),
                ],
              },
              {
                tag: 'column',
                width: 'weighted',
                weight: 1,
                elements: [
                  conditional(
                    'section.pending',
                    [
                      conditional(
                        'section.creditInsufficient',
                        [
                          button('额度已补充', 'Process', 'primary'),
                          secondary('订单处理（额度待核验）'),
                        ],
                        [
                          button('订单处理', 'Process', 'primary'),
                          button('暂缓发货', 'Defer', 'text'),
                        ],
                      ),
                    ],
                    {
                      tag: 'markdown',
                      content: conditional('section.deferred', grey('已暂缓'), grey('已处理')),
                    },
                  ),
                ],
              },
            ],
          },
        ],
      },
      conditional('hasMore', {
        tag: 'markdown',
        content: conditional(
          'hasAllEntry',
          '另有 ${remaining} 笔记录，[查看全部 ${total} 笔](${allEntryUrl}%26view%3Dlist)',
          '另有 ${remaining} 笔记录，[查看全部 ${total} 笔](${allUrl})',
        ),
      }),
    ],
  },
};

export function renderSalesCardTemplate(template, model) {
  const value = (path, scope) => path.split('.').reduce((item, key) => item?.[key], scope);
  const render = (node, scope) => {
    if (Array.isArray(node))
      return node.flatMap((item) => {
        const rendered = render(item, scope);
        return rendered === undefined ? [] : Array.isArray(rendered) ? rendered : [rendered];
      });
    if (node && typeof node === 'object') {
      if ('$if' in node) return render(value(node.$if, scope) === true ? node.yes : node.no, scope);
      if ('$each' in node)
        return (value(node.$each, scope) ?? []).flatMap((item) => {
          const result = render(node.template, { ...scope, [node.as]: item });
          return result === undefined ? [] : Array.isArray(result) ? result : [result];
        });
      if ('$concat' in node) return render(node.$concat, scope).join('');
      return Object.fromEntries(
        Object.entries(node).flatMap(([key, item]) => {
          const rendered = render(item, scope);
          return rendered === undefined ? [] : [[key, rendered]];
        }),
      );
    }
    return typeof node === 'string'
      ? node.replace(/\$\{([A-Za-z][A-Za-z0-9_.]*)\}/g, (_, path) =>
          String(value(path, scope) ?? '—'),
        )
      : node;
  };
  return render(template, model);
}
