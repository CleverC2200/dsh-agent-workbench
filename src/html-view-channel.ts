import type { WorkbenchController } from './workbench.ts';
import { isBusinessViewPage, isHtmlViewPage } from './html-view-state.ts';
export const HTML_VIEW_PROTOCOL = 'dsh-workbench-view-v1';
/** This binding owns one real frame generation, independently of GEA grant and quote lifetimes. */
export function connectHtmlViewState(frame: HTMLIFrameElement, page: string, scope: string | undefined, workbench: WorkbenchController, signal: AbortSignal): () => void {
    if (!isHtmlViewPage(page))
        return () => { };
    const channel = crypto.randomUUID();
    let generation = 0;
    let alive = true;
    const send = (type: string) => frame.contentWindow?.postMessage({ protocol: HTML_VIEW_PROTOCOL, type, page, version: 1, channel, generation, state: workbench.readHtmlViewState(page, scope) }, '*');
    const receive = (event: MessageEvent) => {
        if (!alive || signal.aborted || event.source !== frame.contentWindow || event.data?.protocol !== HTML_VIEW_PROTOCOL || event.data.page !== page || event.data.version !== 1)
            return;
        if (workbench.getSnapshot().selectedDocument?.id !== page)
            return;
        if (event.data.type === 'ready') {
            send('restore');
            return;
        }
        if (event.data.type !== 'save' || event.data.channel !== channel || event.data.generation !== generation || (isBusinessViewPage(page) && !scope))
            return;
        try {
            workbench.saveHtmlViewState(page, scope, event.data.state);
        }
        catch (error) {
            frame.contentWindow?.postMessage({ protocol: HTML_VIEW_PROTOCOL, type: 'rejected', page, version: 1, channel, generation, error: error instanceof Error ? error.message : String(error) }, '*');
        }
    };
    const loaded = () => { generation++; send('request-ready'); };
    window.addEventListener('message', receive);
    frame.addEventListener('load', loaded);
    const dispose = () => { if (!alive)
        return; alive = false; signal.removeEventListener('abort', dispose); window.removeEventListener('message', receive); frame.removeEventListener('load', loaded); frame.contentWindow?.postMessage({ protocol: HTML_VIEW_PROTOCOL, type: 'released', page, version: 1, channel, generation }, '*'); };
    signal.addEventListener('abort', dispose, { once: true });
    if (signal.aborted)
        dispose();
    else
        send('request-ready');
    return dispose;
}
