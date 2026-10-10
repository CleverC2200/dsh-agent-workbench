import { quotePage } from '../../src/page-interaction/quote.ts';
/** Page-authored questions only enter the current Core draft after an explicit click. */
export function useAuthorQuote(react) {
  const [pending, setPending] = react.useState(false),
    [status, setStatus] = react.useState('');
  const task = react.useRef();
  react.useEffect(() => () => task.current?.abort(), []);
  const quote = async (text, label = '分析问题') => {
    if (task.current) return false;
    const controller = new AbortController();
    task.current = controller;
    setPending(true);
    setStatus('');
    try {
      await quotePage({ text, label }, controller.signal);
      if (controller.signal.aborted) return false;
      setStatus('已转入当前对话草稿，确认后再发送。');
      return true;
    } catch (error) {
      if (!controller.signal.aborted)
        setStatus(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      if (task.current === controller) {
        task.current = undefined;
        if (!controller.signal.aborted) setPending(false);
      }
    }
  };
  return { quote, pending, status };
}
export function AuthorQuestions({
  react,
  jsx,
  Button,
  questions,
  draft = '',
  onClearDraft,
  actions,
}) {
  const currentDraft = react.useRef(draft);
  currentDraft.current = draft;
  const transfer = async () => {
    const text = currentDraft.current;
    if ((await actions.quote(text, '未发文字')) && currentDraft.current === text) onClearDraft?.();
  };
  return jsx.jsxs('section', {
    className: 'author-questions',
    'aria-label': '对话草稿快捷操作',
    children: [
      jsx.jsxs('details', {
        children: [
          jsx.jsx('summary', { children: '快捷分析问题' }),
          jsx.jsx('div', {
            className: 'author-question-list',
            children: questions.map((question) =>
              jsx.jsx(
                Button,
                {
                  disabled: actions.pending,
                  onClick: () => actions.quote(question.text, question.label),
                  children: question.label,
                },
                question.label,
              ),
            ),
          }),
        ],
      }),
      draft.trim() &&
        jsx.jsxs('div', {
          className: 'author-draft-recovery',
          children: [
            jsx.jsx('p', { children: '保留的未发文字' }),
            jsx.jsx('pre', { children: draft }),
            jsx.jsx(Button, {
              disabled: actions.pending,
              onClick: transfer,
              children: '转入当前对话草稿',
            }),
          ],
        }),
      actions.status &&
        jsx.jsx('p', {
          className: 'author-quote-status',
          role: 'status',
          children: actions.status,
        }),
    ],
  });
}
