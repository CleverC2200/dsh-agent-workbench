export function startWorkbenchStagedRead(load, signal) {
  const controller = new AbortController();
  const readSignal = AbortSignal.any([signal, controller.signal]);
  let latest, publish;
  const outcome = Promise.resolve().then(() => {
    readSignal.throwIfAborted();
    return load(readSignal, facts => {
    if (readSignal.aborted) return;
    latest = facts;
    publish?.(facts);
    });
  }).then(value => ({ value }), error => ({ error }));
  return {
    async accept(onProgress) {
      readSignal.throwIfAborted();
      publish = onProgress;
      if (latest) publish?.(latest);
      const result = await outcome;
      readSignal.throwIfAborted();
      if (result.error) throw result.error;
      return result.value;
    },
    cancel() { publish = undefined; latest = undefined; controller.abort(); },
  };
}
