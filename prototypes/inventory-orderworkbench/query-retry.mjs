function transient(error) {
  const reasons = [];
  for (let cause = error, depth = 0; cause && depth < 5; cause = cause.cause, depth++)
    reasons.push(cause.code, cause.errorCode, cause.failure?.reasonCode, cause.message);
  const text = reasons.filter(Boolean).join(' ');
  return (
    !/PERMISSION|DENIED|NOT_PUBLISHED|NOT_IN_DATASET|SESSION_|IDENTITY_|AUTHORIZATION|RESULT_INCOMPLETE|INVALID_/.test(
      text,
    ) && /\bGEA_SQL_(?:UNAVAILABLE|QUERY_TIMEOUT)\b/.test(text)
  );
}

export async function readWithTransientRetry(read, signal, delayMs = 750) {
  try {
    return await read();
  } catch (error) {
    signal?.throwIfAborted();
    if (!transient(error)) throw error;
    await new Promise((resolve, reject) => {
      const cleanup = () => signal?.removeEventListener('abort', abort);
      const abort = () => {
        clearTimeout(timer);
        cleanup();
        reject(signal.reason);
      };
      const timer = setTimeout(() => {
        cleanup();
        resolve();
      }, delayMs);
      signal?.addEventListener('abort', abort, { once: true });
    });
    signal?.throwIfAborted();
    return read();
  }
}
