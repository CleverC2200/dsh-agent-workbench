/** Compress before crossing the page bridge; no report fields are removed. */
export async function encodeReportRequest(request) {
  if (request.operation !== 'save') return request;
  const bytes = new TextEncoder().encode(JSON.stringify(request.report));
  if (bytes.length > 20_000_000) throw Error('ORDER_REPORT_TOO_LARGE');
  const compressed = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < compressed.length; offset += 8192) binary += String.fromCharCode(...compressed.subarray(offset, offset + 8192));
  return { ...request, report: { encoding: 'gzip-base64', data: btoa(binary) } };
}
