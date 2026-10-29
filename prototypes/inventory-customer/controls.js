import { action, reportElements } from '../../business/shared/channel.js';

export function customerControls(state, setters, regions) {
  const choices = {
    region: ['all', ...regions], status: ['all', 'risk', 'attention', 'healthy'],
    tab: ['overview', 'risk', 'largeDate'],
  };
  const labels = { region: '列表区域筛选', status: '列表状态筛选', tab: '客户库存页签', search: '经销商名称或编码搜索', page: '列表页码' };
  const values = { region: state.region, status: state.status, tab: state.tab, search: state.search, page: state.page };
  const elements = Object.keys(labels).map(key => ({
    id: `customer-control:${key}`, role: 'control', label: labels[key], editable: true, effect: 'view',
    value: String(values[key] ?? ''),
    description: choices[key] ? `可选值：${choices[key].join('、')}` : key === 'page' ? `整数1至${state.pageCount}` : '只影响列表，不改变卡片统计范围',
  }));
  function validate(key, value) {
    if (!(key in labels)) throw Error('CUSTOMER_CONTROL_UNKNOWN');
    if (choices[key] && !choices[key].includes(value)) throw Error('CUSTOMER_CONTROL_VALUE_INVALID');
    if (key === 'search' && (typeof value !== 'string' || value.length > 200)) throw Error('CUSTOMER_CONTROL_VALUE_INVALID');
    if (key === 'page' && (!Number.isInteger(Number(value)) || Number(value) < 1 || Number(value) > state.pageCount)) throw Error('CUSTOMER_CONTROL_VALUE_INVALID');
    return key === 'page' ? Number(value) : value;
  }
  return {
    elements,
    apply(args, signal) {
      signal?.throwIfAborted();
      if (!['setValue', 'select', 'clear'].includes(args.kind)) throw Error('ACTION_NOT_ALLOWED');
      const key = args.target?.replace(/^customer-control:/, '');
      const value = args.kind === 'clear' ? (key === 'search' ? '' : key === 'page' ? 1 : key === 'tab' ? 'overview' : 'all') : args.value;
      setters[key]?.(validate(key, value));
    },
    filter(args, { signal } = {}) {
      signal?.throwIfAborted();
      if (!args || typeof args !== 'object' || Array.isArray(args) || !Object.keys(args).length) throw Error('CUSTOMER_FILTER_REQUIRED');
      const updates = Object.entries(args).map(([key, value]) => [key, validate(key, value)]);
      for (const [key, value] of updates) setters[key](value);
      return { applied: true, effect: 'view', filters: args };
    },
  };
}

/** Explicit authored controls use the existing page channel, not DOM scraping or business writes. */
export function useCustomerControls(react, state, setters, regions) {
  react.useEffect(() => {
    const controls = customerControls(state, setters, regions);
    const release = reportElements('customer-controls', controls.elements, controls.apply);
    const stop = action('filter', '调整客户库存列表：region、status、tab、search或page；只改变当前页面视图', controls.filter);
    return () => { stop(); release(); };
  }, [state.region, state.status, state.tab, state.search, state.page, state.pageCount, regions.join('\u0000')]);
}
