export function createCalculationHelp(react) {
  const h = react.createElement;
  return function CalculationHelp({ title, children }) {
    const id = react.useId();
    return h(
      react.Fragment,
      null,
      h('button', { type: 'button', className: 'dc-link', popovertarget: id }, '口径说明'),
      h(
        'section',
        { id, popover: 'auto', className: 'dc-calculation-help-panel', 'aria-label': title },
        h('h4', null, title),
        children,
      ),
    );
  };
}
