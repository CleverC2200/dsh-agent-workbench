export const matchesCategories = (category, selected = []) =>
  !selected.length || selected.includes(category);

export function createCategoryFilter(react) {
  const h = react.createElement;
  return function CategoryFilter({ categories, selected, change, disabled }) {
    return h(
      'fieldset',
      { className: 'dc-category-filter', disabled },
      h('legend', null, '大类筛选'),
      categories.map((category) =>
        h(
          'label',
          { key: category },
          h('input', {
            type: 'checkbox',
            checked: selected.includes(category),
            onChange: (event) =>
              change(
                event.target.checked
                  ? [...selected, category]
                  : selected.filter((value) => value !== category),
              ),
          }),
          category,
        ),
      ),
      h(
        'button',
        { type: 'button', disabled: !selected.length, onClick: () => change([]) },
        '清空筛选',
      ),
    );
  };
}

export function createDimensionCategoryMatcher(products, selected) {
  if (!selected.length) return () => true;
  const dimensions = new Set();
  for (const product of products) {
    if (!matchesCategories(product['大类'], selected)) continue;
    for (const [name, value] of [
      ['大类', product['大类']],
      ['系列', product['系列']],
      ['物料组', product['物料组']],
      ['产品', product['产品编码']],
    ]) {
      if (value) dimensions.add(JSON.stringify([name, value]));
    }
  }
  return (row) => {
    const dimension = ['大类', '系列', '物料组', '产品'].find((value) =>
      row['维度类型']?.endsWith(value),
    );
    return dimensions.has(JSON.stringify([dimension, row['维度值']]));
  };
}
