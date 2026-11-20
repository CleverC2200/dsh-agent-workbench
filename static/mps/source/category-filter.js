export const matchesCategories = (category, selected = []) =>
  !selected.length || selected.includes(category);

export function createCategoryFilter(react) {
  const h = react.createElement;
  return function CategoryFilter({ categories, selected, change, disabled }) {
    const filter = react.useRef(null);
    react.useEffect(() => {
      const dropdown = filter.current;
      const page = dropdown.ownerDocument;
      const closeOutside = (event) => {
        if (dropdown.open && !dropdown.contains(event.target)) dropdown.open = false;
      };
      page.addEventListener('pointerdown', closeOutside, true);
      page.addEventListener('focusin', closeOutside, true);
      return () => {
        page.removeEventListener('pointerdown', closeOutside, true);
        page.removeEventListener('focusin', closeOutside, true);
      };
    }, []);
    return h(
      'details',
      {
        className: 'dc-category-select',
        ref: filter,
        onKeyDown: (event) => {
          if (event.key !== 'Escape' || !event.currentTarget.open) return;
          event.stopPropagation();
          event.currentTarget.firstElementChild.focus();
          event.currentTarget.open = false;
        },
      },
      h(
        'summary',
        {
          'aria-label': '大类筛选',
          'aria-disabled': disabled || undefined,
          onClick: (event) => {
            if (disabled) event.preventDefault();
          },
        },
        selected.length ? `大类 · 已选 ${selected.length} 项` : '大类 · 全部',
      ),
      h(
        'fieldset',
        { className: 'dc-category-filter', 'aria-label': '大类筛选', disabled },
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
