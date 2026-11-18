export function createStepViewState() {
  let state = {};
  const listeners = new Set();
  return {
    get: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    update: (changes) => {
      state = { ...state, ...changes };
      for (const listener of listeners) listener(state);
    },
  };
}

export function useStepViewField(react, view, key, initial) {
  const fallback = react.useRef(null);
  if (!fallback.current)
    fallback.current = {
      view: view ?? createStepViewState(),
      value: typeof initial === 'function' ? initial() : initial,
    };
  const target = view ?? fallback.current.view;
  const read = react.useCallback(
    () => (Object.hasOwn(target.get(), key) ? target.get()[key] : fallback.current.value),
    [target, key],
  );
  const value = react.useSyncExternalStore(target.subscribe, read, read);
  const set = react.useCallback(
    (next) => target.update({ [key]: typeof next === 'function' ? next(read()) : next }),
    [target, key, read],
  );
  return [value, set];
}
