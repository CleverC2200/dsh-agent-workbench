import { encodeLocalDrafts } from './local-draft.js';

export function evaluationInputs(draft) {
  try {
    return JSON.stringify(encodeLocalDrafts([draft], draft.id).drafts[0]);
  } catch {
    return null;
  }
}

export function useMpsEvaluation(react, view, draft, scopeGeneration, active) {
  const scope = JSON.stringify([scopeGeneration, draft.id, draft.month]);
  const version = { id: draft.id, month: draft.month };
  const activeScope = react.useRef(scope);
  activeScope.current = scope;
  const [state, setState] = react.useState(null);
  const current = state?.scope === scope ? state : null;
  const loading = active && !current && view.hasEvaluationStorage();
  react.useEffect(() => {
    if (!loading) return;
    let reading = true;
    void view.evaluationRequest({ operation: 'read', version }).then(
      (snapshot) => {
        if (!reading) return;
        setState((previous) =>
          previous?.scope === scope
            ? previous
            : {
                scope,
                evaluation: snapshot
                  ? { ...snapshot, draft, scopeGeneration, restored: true }
                  : null,
              },
        );
      },
      (error) => {
        if (reading && error.name !== 'AbortError')
          setState((previous) =>
            previous?.scope === scope ? previous : { scope, error: '读取上次评估结果失败' },
          );
      },
    );
    return () => {
      reading = false;
    };
  }, [scope, view, loading]);
  const save = async (evaluation) => {
    let error;
    try {
      if (view.hasEvaluationStorage()) {
        const { plan, categoryComputation } = evaluation.result;
        await view.evaluationRequest({
          operation: 'write',
          version,
          snapshot: {
            format: 1,
            at: evaluation.at,
            inputs: evaluationInputs(evaluation.draft),
            result: { plan, categoryComputation: { festival: categoryComputation?.festival } },
          },
        });
      }
    } catch (failure) {
      if (failure.name === 'AbortError') return;
      error = '本次评估结果未能保存，请先下载结果';
    }
    if (activeScope.current === scope) setState({ scope, evaluation, error });
  };
  return { evaluation: current?.evaluation, save, error: current?.error, loading };
}
