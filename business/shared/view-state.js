const PROTOCOL = 'dsh-workbench-view-v1';
export function createPageViewState(page) {
  const sessionPage = [
    'gea-regional-plan',
    'plan-region-category',
    'plan-category-production',
    'inventory-qll',
    'inventory-fc',
    'inventory-aqkc',
    'inventory-dealer',
    'inventory-customer',
    'inventory-orderworkbench',
    'inventory-orderfulfillment',
    'inventory-personal',
    'inventory-apsplan',
    'inventory-dms',
  ].includes(page);

  let state = { version: 1 };
  let binding,
    dirty = false;
  let evaluationStorage = false;
  let nextRequest = 0;
  const pendingEvaluations = new Map();
  const releaseEvaluations = () => {
    for (const { reject } of pendingEvaluations.values())
      reject(new DOMException('页面连接已切换', 'AbortError'));
    pendingEvaluations.clear();
  };
  const listeners = new Set();
  const releasedChannels = new Set();
  const send = () => {
    if (binding)
      window.parent.postMessage(
        { protocol: PROTOCOL, type: 'save', page, version: 1, ...binding, state },
        '*',
      );
  };
  const ready = () =>
    window.parent.postMessage({ protocol: PROTOCOL, type: 'ready', page, version: 1 }, '*');
  const receive = (event) => {
    const value = event.data;
    if (
      event.source !== window.parent ||
      value?.protocol !== PROTOCOL ||
      value.page !== page ||
      value.version !== 1
    )
      return;
    if (value.type === 'request-ready') {
      ready();
      return;
    }
    if (value.type === 'evaluation-storage-reply') {
      if (!binding || binding.channel !== value.channel || binding.generation !== value.generation)
        return;
      const pending = pendingEvaluations.get(value.requestId);
      if (pending) {
        pendingEvaluations.delete(value.requestId);
        if (value.error) pending.reject(Error('本地评估结果不可用'));
        else pending.resolve(value.value);
      }
      return;
    }
    if (value.type === 'rejected') {
      if (binding?.channel === value.channel && binding.generation === value.generation)
        for (const listener of listeners) listener(state, 'rejected');
      return;
    }
    if (value.type === 'released') {
      releasedChannels.add(value.channel);
      if (binding?.channel === value.channel) {
        binding = undefined;
        evaluationStorage = false;
        releaseEvaluations();
        if (sessionPage) {
          dirty = false;
          state = { version: 1 };
          for (const listener of listeners) listener(state, 'released');
        }
      }
      return;
    }
    if (
      value.type !== 'restore' ||
      typeof value.channel !== 'string' ||
      !Number.isSafeInteger(value.generation) ||
      value.generation < 0 ||
      releasedChannels.has(value.channel) ||
      (binding?.channel === value.channel && value.generation < binding.generation)
    )
      return;
    if (binding?.channel !== value.channel || binding.generation !== value.generation)
      releaseEvaluations();
    binding = { channel: value.channel, generation: value.generation };
    evaluationStorage = value.evaluationStorage === true;
    state = dirty ? { ...value.state, ...state } : { ...value.state, version: 1 };
    dirty = false;
    for (const listener of listeners) listener(state, 'restore');
    send();
  };
  window.addEventListener('message', receive);
  window.addEventListener(
    'pagehide',
    () => {
      binding = undefined;
      evaluationStorage = false;
      releaseEvaluations();
      window.removeEventListener('message', receive);
      listeners.clear();
    },
    { once: true },
  );
  ready();
  return {
    get: () => state,
    hasEvaluationStorage: () => evaluationStorage,
    evaluationRequest: (request) =>
      new Promise((resolve, reject) => {
        if (!binding || !evaluationStorage) {
          reject(Error('本地评估结果存储尚未连接'));
          return;
        }
        const requestId = ++nextRequest;
        pendingEvaluations.set(requestId, { resolve, reject });
        window.parent.postMessage(
          {
            protocol: PROTOCOL,
            type: 'evaluation-storage',
            page,
            version: 1,
            ...binding,
            requestId,
            request,
          },
          '*',
        );
      }),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    update: (changes) => {
      state = { ...state, ...changes, version: 1 };
      if (binding || !sessionPage) dirty = true;
      send();
    },
  };
}

export function usePageViewField(
  react,
  view,
  key,
  initial,
  encode = (value) => value,
  decode = (value) => value,
) {
  const fallback = react.useRef({ initial, initialized: false, value: undefined });
  const defaultValue = () => {
    if (!fallback.current.initialized) {
      fallback.current.value =
        typeof fallback.current.initial === 'function'
          ? fallback.current.initial()
          : fallback.current.initial;
      fallback.current.initialized = true;
    }
    return fallback.current.value;
  };
  const [value, set] = react.useState(() =>
    Object.hasOwn(view.get(), key) ? decode(view.get()[key]) : defaultValue(),
  );
  const current = react.useRef(value),
    encoder = react.useRef(encode),
    decoder = react.useRef(decode);
  current.current = value;
  encoder.current = encode;
  decoder.current = decode;
  react.useEffect(() => {
    const apply = (snapshot) => {
      const next = Object.hasOwn(snapshot, key) ? decoder.current(snapshot[key]) : defaultValue();
      current.current = next;
      set(next);
    };
    const stop = view.subscribe(apply);
    apply(view.get());
    return stop;
  }, [view, key]);
  return [
    value,
    react.useCallback(
      (next) => {
        const result = typeof next === 'function' ? next(current.current) : next;
        current.current = result;
        set(result);
        view.update({ [key]: encoder.current(result) });
      },
      [view, key],
    ),
  ];
}
