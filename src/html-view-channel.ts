import { mpsAccountViewKey, mpsViewDrafts, type WorkbenchController } from './workbench.ts';
import { isBusinessViewPage, isHtmlViewPage } from './html-view-state.ts';
import { accessMpsEvaluation, recoverMpsEvaluatedDrafts } from './mps-evaluation-store.ts';
export const HTML_VIEW_PROTOCOL = 'dsh-workbench-view-v1';

export function connectHtmlViewState(
  frame: HTMLIFrameElement,
  page: string,
  scope: string | undefined,
  workbench: WorkbenchController,
  signal: AbortSignal,
): () => void {
  if (!isHtmlViewPage(page)) return () => {};
  const channel = crypto.randomUUID();
  const evaluationAccount = mpsAccountViewKey(page, scope);
  let generation = 0;
  let alive = true;
  let restoring: number | undefined;
  const isCurrent = (issued: number) =>
    alive &&
    !signal.aborted &&
    issued === generation &&
    workbench.getSnapshot().selectedDocument?.id === page;
  const send = (type: string) =>
    frame.contentWindow?.postMessage(
      {
        protocol: HTML_VIEW_PROTOCOL,
        type,
        page,
        version: 1,
        channel,
        generation,
        state: workbench.readHtmlViewState(page, scope),
        ...(evaluationAccount ? { evaluationStorage: true } : {}),
      },
      '*',
    );
  const restore = async () => {
    if (!evaluationAccount) {
      send('restore');
      return;
    }
    if (restoring === generation) return;
    const issued = generation;
    restoring = issued;
    try {
      const saved = mpsViewDrafts(workbench.readHtmlViewState(page, scope));
      const found = await recoverMpsEvaluatedDrafts(
        evaluationAccount,
        new Set(saved?.drafts.map((draft) => draft.id)),
      );
      if (!isCurrent(issued)) return;
      if (found.length) {
        const view = workbench.readHtmlViewState(page, scope);
        const current = mpsViewDrafts(view);
        const drafts = new Map(current?.drafts.map((draft) => [draft.id, draft]));
        for (const draft of found) if (!drafts.has(draft.id)) drafts.set(draft.id, draft);
        workbench.saveHtmlViewState(page, scope, {
          ...view,
          version: 1,
          localDrafts: {
            format: 1,
            selected: current?.selected ?? found[0].id,
            drafts: [...drafts.values()],
          },
        });
      }
    } finally {
      if (restoring === issued) restoring = undefined;
      if (isCurrent(issued)) send('restore');
    }
  };
  const receive = (event: MessageEvent) => {
    if (
      !alive ||
      signal.aborted ||
      event.source !== frame.contentWindow ||
      event.data?.protocol !== HTML_VIEW_PROTOCOL ||
      event.data.page !== page ||
      event.data.version !== 1
    )
      return;
    if (workbench.getSnapshot().selectedDocument?.id !== page) return;
    if (event.data.type === 'ready') {
      void restore().catch(() => {});
      return;
    }
    if (
      event.data.channel !== channel ||
      event.data.generation !== generation ||
      (isBusinessViewPage(page) && !scope)
    )
      return;
    if (event.data.type === 'evaluation-storage' && evaluationAccount) {
      const requestId = event.data.requestId;
      if (!Number.isSafeInteger(requestId) || requestId < 1) return;
      const issuedGeneration = generation;
      const reply = (body: { value: unknown } | { error: true }) => {
        if (!isCurrent(issuedGeneration)) return;
        frame.contentWindow?.postMessage(
          {
            protocol: HTML_VIEW_PROTOCOL,
            type: 'evaluation-storage-reply',
            page,
            version: 1,
            channel,
            generation,
            requestId,
            ...body,
          },
          '*',
        );
      };
      void accessMpsEvaluation(evaluationAccount, event.data.request).then(
        (value) => reply({ value }),
        () => reply({ error: true }),
      );
      return;
    }
    if (event.data.type !== 'save') return;
    try {
      workbench.saveHtmlViewState(page, scope, event.data.state);
    } catch (error) {
      frame.contentWindow?.postMessage(
        {
          protocol: HTML_VIEW_PROTOCOL,
          type: 'rejected',
          page,
          version: 1,
          channel,
          generation,
          error: error instanceof Error ? error.message : String(error),
        },
        '*',
      );
    }
  };
  const loaded = () => {
    generation++;
    send('request-ready');
  };
  window.addEventListener('message', receive);
  frame.addEventListener('load', loaded);
  const dispose = () => {
    if (!alive) return;
    alive = false;
    signal.removeEventListener('abort', dispose);
    window.removeEventListener('message', receive);
    frame.removeEventListener('load', loaded);
    frame.contentWindow?.postMessage(
      { protocol: HTML_VIEW_PROTOCOL, type: 'released', page, version: 1, channel, generation },
      '*',
    );
  };
  signal.addEventListener('abort', dispose, { once: true });
  if (signal.aborted) dispose();
  else send('request-ready');
  return dispose;
}
