import { createDemandConfirmation } from './demand-confirmation.js';
import { createRelations } from './relations-view.js';
import { mpsView, useMpsPart, useMpsNavigation } from './context.js';
import { AuthorQuestions, useAuthorQuote } from '../../../business/shared/author-questions.js';
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
const DemandConfirmation = createDemandConfirmation(y, useMpsPart, mpsView);
const Relations = createRelations(y, useMpsPart);
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
  const [assistantDraft, setAssistantDraft] = usePageViewField(y, mpsView, 'assistantDraft', '');
  const [scope, setScope] = y.useState(null);
  const [relations, setRelations] = y.useState(null);
  const actions = useAuthorQuote(y);
  const select = y.useCallback(
    (key) => {
      if (!mpsSteps.some((item) => item.key === key)) return;
      setStep(key);
      if (window.location.hash !== '#' + key) window.location.hash = key;
    },
    [setStep],
  );
  y.useEffect(() => {
    const changed = () => setStep(selectedStep());
    window.addEventListener('hashchange', changed);
    return () => window.removeEventListener('hashchange', changed);
  }, [setStep]);
  const assistant = y.createElement(AuthorQuestions, {
    react: y,
    jsx: c,
    Button: Ke,
    questions: [
      { label: '核对当前数据', text: '核对当前步骤的数据来源、期间与缺项。' },
      { label: '解释计算过程', text: '解释当前步骤已有数字的公式、代入和结果。' },
    ],
    draft: assistantDraft,
    onClearDraft: () => setAssistantDraft(''),
    actions,
  });
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
        'div',
        { className: 'ap-board-head' },
        y.createElement(
          'div',
          { className: 'ap-page-tabs' },
          mpsSteps.map((item) =>
            y.createElement(
              Ke,
              {
                key: item.key,
                className: 'ap-page-tab',
                'data-active': step === item.key,
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
      ),
      y.createElement(
        'div',
        { className: 'ap-board-body' },
        y.createElement(DemandConfirmation, {
          active: true,
          step,
          onScopeChange: setScope,
          relations,
          masterData: y.createElement(Relations, {
            scope,
            onResult: setRelations,
            active: step === 'masterdata',
            enabled: !['check', 'ship'].includes(step) || Boolean(relations?.sources),
          }),
          onNext: () =>
            select(mpsSteps[Math.min(mpsSteps.findIndex((item) => item.key === step) + 1, 6)].key),
          assistant,
        }),
      ),
    ),
  );
}
XC(document.getElementById('root')).render(y.createElement(y.StrictMode, {}, y.createElement(Mps)));
