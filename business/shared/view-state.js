/** Current page's UI projection. Workbench owns storage; the author owns every named field. */
const PROTOCOL = 'dsh-workbench-view-v1';
export function createPageViewState(page) {
    const sessionPage = ['gea-regional-plan', 'plan-region-category', 'plan-category-production', 'inventory-qll', 'inventory-fc', 'inventory-aqkc', 'inventory-customer', 'inventory-orderworkbench', 'inventory-orderfulfillment'].includes(page);
    /** @type {Record<string,unknown>} */
    let state = { version: 1 };
    let binding, dirty = false;
    const listeners = new Set();
    const releasedChannels = new Set();
    const send = () => { if (binding)
        window.parent.postMessage({ protocol: PROTOCOL, type: 'save', page, version: 1, ...binding, state }, '*'); };
    const ready = () => window.parent.postMessage({ protocol: PROTOCOL, type: 'ready', page, version: 1 }, '*');
    const receive = event => {
        const value = event.data;
        if (event.source !== window.parent || value?.protocol !== PROTOCOL || value.page !== page || value.version !== 1)
            return;
        if (value.type === 'request-ready') {
            ready();
            return;
        }
        if (value.type === 'released') {
            releasedChannels.add(value.channel);
            if (binding?.channel === value.channel) {
                binding = undefined;
                if (sessionPage) {
                    dirty = false;
                    state = { version: 1 };
                    for (const listener of listeners) listener(state);
                }
            }
            return;
        }
        if (value.type !== 'restore' || typeof value.channel !== 'string' || !Number.isSafeInteger(value.generation) || value.generation < 0 || releasedChannels.has(value.channel) || (binding?.channel === value.channel && value.generation < binding.generation))
            return;
        binding = { channel: value.channel, generation: value.generation };
        state = dirty ? { ...value.state, ...state } : { ...(value.state ?? {}), version: 1 };
        dirty = false;
        for (const listener of listeners)
            listener(state);
        send();
    };
    window.addEventListener('message', receive);
    window.addEventListener('pagehide', () => { binding = undefined; window.removeEventListener('message', receive); listeners.clear(); }, { once: true });
    ready();
    return { get: () => state, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); }, update: changes => { state = { ...state, ...changes, version: 1 }; if (binding || !sessionPage)
            dirty = true; send(); } };
}
/** Bind an explicit authored React field; restores update the existing setter without replaying user actions. */
export function usePageViewField(react, view, key, initial, encode = value => value, decode = value => value) {
    const fallback = react.useRef({ initial, initialized: false, value: undefined });
    const defaultValue = () => {
        if (!fallback.current.initialized) {
            fallback.current.value = typeof fallback.current.initial === 'function' ? fallback.current.initial() : fallback.current.initial;
            fallback.current.initialized = true;
        }
        return fallback.current.value;
    };
    const [value, set] = react.useState(() => Object.hasOwn(view.get(), key) ? decode(view.get()[key]) : defaultValue());
    const current = react.useRef(value), encoder = react.useRef(encode), decoder = react.useRef(decode);
    current.current = value;
    encoder.current = encode;
    decoder.current = decode;
    react.useEffect(() => {
        const apply = snapshot => {
            const next = Object.hasOwn(snapshot, key) ? decoder.current(snapshot[key]) : defaultValue();
            current.current = next;
            set(next);
        };
        const stop = view.subscribe(apply);
        apply(view.get());
        return stop;
    }, [view, key]);
    return [value, react.useCallback(next => { const result = typeof next === 'function' ? next(current.current) : next; current.current = result; set(result); view.update({ [key]: encoder.current(result) }); }, [view, key])];
}
