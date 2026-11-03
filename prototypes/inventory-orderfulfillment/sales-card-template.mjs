// This declarative layout is also exported as JSON for the server renderer.
const conditional = (path, yes, no) => ({
  $if: path,
  yes,
  ...(no === undefined ? {} : { no }),
});
const button = (label, mode, type) => ({
  tag: 'button',
  type,
  text: { tag: 'plain_text', content: label },
  behaviors: conditional(`section.has${mode}`, [
    { type: 'open_url', default_url: `\${section.${mode}Url}` },
  ]),
  disabled: conditional(`section.has${mode}`, false, true),
  disabled_tips: conditional(`section.has${mode}`, undefined, {
    tag: 'plain_text',
    content: '等待 GEA 提供当前订单的受控操作入口',
  }),
});
export const salesCardTemplate = {
  schema: '2.0',
  config: { update_multi: true, wide_screen_mode: true },
  header: {
    template: 'blue',
    title: {
      tag: 'lark_md',
      content: conditional('needsProcessing', '${mentions}订单待处理', '${mentions}订单待确认'),
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
              content: {
                $concat: [
                  conditional(
                    'section.rateKnown',
                    conditional(
                      'section.ready',
                      '订单满足率达到90%，请确认是否开单？',
                      '订单满足率未达到90%，请先处理缺货订单。',
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
              },
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
                      'section.hasDetails',
                      '订单号：[${section.orderNoMarkdown}](${section.detailsUrl})',
                      '订单号：${section.orderNoMarkdown}',
                    ),
                  },
                  ...[
                    '客户：${section.customer}',
                    '订单满足率：${section.rate}',
                    '总数量：${section.quantity}',
                  ].map((content) => ({
                    tag: 'div',
                    text: { tag: 'plain_text', content, text_color: 'grey-700' },
                  })),
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
                      conditional('section.ready', button('确认发货', 'Confirm', 'primary')),
                      button('暂缓发货', 'Defer', 'text'),
                      conditional(
                        'section.ready',
                        undefined,
                        button('订单处理', 'Edit', 'primary'),
                      ),
                    ],
                    {
                      tag: 'markdown',
                      content: conditional('section.deferred', '已暂缓', '已处理'),
                    },
                  ),
                ],
              },
            ],
          },
        ],
      },
      conditional('preview', {
        tag: 'markdown',
        content: '本地样例预览 · 不发货、不改单；延期及提交不保存。',
      }),
      conditional('pilot', {
        tag: 'markdown',
        content: '试点验收 · 仅登记销售决定，不执行真实发货或改单',
      }),
      conditional('hasMore', {
        tag: 'markdown',
        content: '另有 ${remaining} 笔记录，[查看全部 ${total} 笔](${allUrl})',
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
