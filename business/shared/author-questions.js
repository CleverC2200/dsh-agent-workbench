import { quotePage } from '../../src/page-interaction/quote.ts';

export function useAuthorQuote(react, ask) {
  const [pending, setPending] = react.useState(false),
    [status, setStatus] = react.useState('');
  const task = react.useRef();
  react.useEffect(() => () => task.current?.abort(), []);
  const transfer = async (send, success) => {
    if (task.current) return false;
    const controller = new AbortController();
    task.current = controller;
    setPending(true);
    setStatus('');
    try {
      await send(controller.signal);
      if (controller.signal.aborted) return false;
      setStatus(success);
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
  const quote = (text, label = '分析问题') =>
    transfer((signal) => quotePage({ text, label }, signal), '已转入当前对话草稿，确认后再发送。');
  const question = ask
    ? (text) =>
        transfer((signal) => ask(text, signal), '已发送到当前对话，请在对话区查看分析结果。')
    : quote;
  return { quote, question, pending, status };
}
export function AuthorQuestions({
  react,
  jsx,
  Button,
  questions,
  draft = '',
  onClearDraft,
  actions,
  expanded = false,
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
      questions.length > 0 &&
        jsx.jsxs('details', {
          open: expanded,
          children: [
            jsx.jsx('summary', { children: '快捷分析问题' }),
            jsx.jsx('div', {
              className: 'author-question-list',
              children: questions.map((question) =>
                jsx.jsx(
                  Button,
                  {
                    disabled: actions.pending,
                    onClick: () => actions.question(question.text, question.label),
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
