import workerSource from 'mps-workflow-worker-source';

export function computeWorkflow(draft, relations, shipmentSnapshot, evaluation, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    let worker;
    let url;
    const finish = (error, result) => {
      signal.removeEventListener('abort', abort);
      worker?.terminate();
      if (url) URL.revokeObjectURL(url);
      if (error) reject(error);
      else resolve(result);
    };
    const abort = () => finish(signal.reason);
    try {
      url = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
      worker = new Worker(url);
      worker.onmessage = ({ data }) =>
        finish(data.error ? new Error(data.error) : null, data.result);
      worker.onerror = (event) => {
        event.preventDefault();
        finish(new Error(event.message || '后台计算线程启动失败，请重新执行评估'));
      };
      worker.onmessageerror = () => finish(new Error('后台计算结果传输失败，请重新执行评估'));
      signal.addEventListener('abort', abort, { once: true });
      const shipment = shipmentSnapshot
        ? Object.fromEntries(
            ['draftId', 'month', 'shipmentMonth', 'status', 'sourceKind', 'source', 'rows'].map(
              (key) => [key, shipmentSnapshot[key]],
            ),
          )
        : null;
      worker.postMessage({ draft, relations, shipment, evaluation });
    } catch (error) {
      finish(error);
    }
  });
}
