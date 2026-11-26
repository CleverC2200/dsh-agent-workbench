import { createDemandConfirmation, downloadCsv } from './demand-confirmation.js';
import { createRelations } from './relations-view.js';
import { mpsView, useMpsPart, useMpsNavigation } from './context.js';
import { usePageViewField } from '../../../business/shared/view-state.js';

const mpsSteps = [
  ['check', '需求确认'],
  ['ship', '本月预估发货'],
  ['process', '需求加工与收敛'],
  ['masterdata', '主数据对应关系'],
  ['constraints', '约束与配置'],
  ['capacity', '产能评估与缺口'],
  ['report', '产销存报告'],
].map(([key, label], index) => ({ key, label, step: String(index + 1) }));
const DemandConfirmation = createDemandConfirmation(y, useMpsPart, mpsView, Ke, Mn.createPortal);
const Relations = createRelations(y, useMpsPart, { downloadCsv });
const selectedStep = () => {
  const key = window.location.hash.replace(/^#\/?/, '').split('/')[0];
  return mpsSteps.some((step) => step.key === key) ? key : 'check';
};
function Mps() {
  const [step, setStep] = usePageViewField(
    y,
    mpsView,
    'tab',
    selectedStep,
    (value) => value,
    (value) => (mpsSteps.some((item) => item.key === value) ? value : 'check'),
  );
  const bodyRef = y.useRef(null);
  const stepListRef = y.useRef(null);
  y.useLayoutEffect(() => {
    const list = stepListRef.current;
    if (!list) return;
    const revealCurrent = () => {
      const current = list.querySelector('[aria-current="step"]');
      if (!current) return;
      const container = list.getBoundingClientRect();
      const item = current.getBoundingClientRect();
      list.scrollLeft +=
        Math.min(0, item.left - container.left) + Math.max(0, item.right - container.right);
    };
    revealCurrent();
    const observer = new ResizeObserver(revealCurrent);
    observer.observe(list);
    return () => observer.disconnect();
  }, [step]);
  y.useEffect(() => {
    const receiveLayout = (event) => {
      if (event.source === window.parent && event.data?.protocol === 'gea-toolbar-layout')
        document.documentElement.toggleAttribute(
          'data-shared-workbench-toolbar',
          event.data.shared === true,
        );
    };
    window.addEventListener('message', receiveLayout);
    window.parent.postMessage({ protocol: 'gea-toolbar-layout-ready' }, '*');
    return () => {
      window.removeEventListener('message', receiveLayout);
      window.parent.postMessage({ protocol: 'gea-toolbar-layout-gone' }, '*');
    };
  }, []);
  const [scope, setScope] = y.useState(null);
  const scrollPositions = y.useRef(new Map());
  const scrollKey = JSON.stringify([scope?.id, scope?.month, scope?.generation, step]);
  const visibleScrollKey = y.useRef(scrollKey);
  y.useLayoutEffect(() => {
    visibleScrollKey.current = scrollKey;
    const position = scrollPositions.current.get(scrollKey) ?? 0;
    const restore = () => bodyRef.current?.scrollTo({ top: position });
    restore();
    const frame = requestAnimationFrame(restore);
    return () => cancelAnimationFrame(frame);
  }, [scrollKey]);
  const [adjusting, setAdjusting] = y.useState(false);
  const [relations, setRelations] = y.useState(null);
  const select = y.useCallback(
    (key) => {
      if (adjusting || !mpsSteps.some((item) => item.key === key)) return;
      setStep(key);
      if (window.location.hash !== '#' + key) window.location.hash = key;
    },
    [setStep, adjusting],
  );
  y.useEffect(() => {
    const changed = () => {
      if (adjusting) {
        if (window.location.hash !== '#' + step) window.location.hash = step;
        return;
      }
      setStep(selectedStep());
    };
    window.addEventListener('hashchange', changed);
    return () => window.removeEventListener('hashchange', changed);
  }, [setStep, adjusting, step]);
  useMpsNavigation(
    y,
    {
      tab: step,
      title: mpsSteps.find((item) => item.key === step).label,
      description: '七步使用同一评估草稿，缺失数据或未确认规则的结果留空。正式保存未接入。',
      tabs: mpsSteps,
      version: scope,
    },
    select,
  );
  return y.createElement(
    'div',
    { className: 'ap-app', 'data-step': step },
    y.createElement(
      'main',
      { className: 'ap-board' },
      y.createElement(
        'nav',
        { className: 'ap-board-head', 'aria-label': '月主计划评估步骤' },
        y.createElement(
          'div',
          { className: 'ap-page-tabs', ref: stepListRef },
          mpsSteps.map((item) =>
            y.createElement(
              Ke,
              {
                key: item.key,
                className: 'ap-page-tab',
                'data-active': step === item.key,
                'aria-current': step === item.key ? 'step' : undefined,
                disabled: adjusting && step !== item.key,
                onClick: () => select(item.key),
              },
              y.createElement(
                'span',
                { className: 'ap-page-tab-inner' },
                y.createElement('span', { className: 'ap-page-tab-step' }, item.step),
                item.label,
              ),
            ),
          ),
        ),
        y.createElement(
          'select',
          {
            className: 'ap-step-jump',
            'aria-label': '跳到评估步骤',
            value: '',
            disabled: adjusting,
            onChange: (event) => select(event.target.value),
          },
          y.createElement('option', { value: '', disabled: true }, '全部步骤'),
          ...mpsSteps.map(({ key, label, step: number }) =>
            y.createElement('option', { key, value: key }, `${number}. ${label}`),
          ),
        ),
      ),
      y.createElement(
        'div',
        {
          className: 'ap-board-body',
          ref: bodyRef,
          onScroll: (event) =>
            scrollPositions.current.set(visibleScrollKey.current, event.currentTarget.scrollTop),
        },
        y.createElement(DemandConfirmation, {
          active: true,
          onEditingChange: setAdjusting,
          step,
          onScopeChange: setScope,
          relations,
          masterData: y.createElement(Relations, {
            scope,
            onResult: setRelations,
            active: step === 'masterdata',
            enabled: !['check', 'ship'].includes(step) || Boolean(relations?.sources),
          }),
        }),
      ),
    ),
  );
}
XC(document.getElementById('root')).render(y.createElement(y.StrictMode, {}, y.createElement(Mps)));
