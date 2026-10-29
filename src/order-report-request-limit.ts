/** Keep ordinary requests bounded; only the owned report writer accepts a larger compressed envelope. */
export function assertPageRequestSize(
  input: any,
  resolveOwner: () => { page: { id: string }; grant: { workspace?: unknown } },
): void {
  const size = JSON.stringify(input).length;
  if (size <= 500000) return;
  if (size > 4_004_096 || input.operation !== 'workspace') throw Error('REQUEST_TOO_LARGE');
  const owner = resolveOwner();
  const report = input.parameters?.report;
  if (
    owner.page.id !== 'inventory-orderworkbench' || !owner.grant.workspace ||
    input.parameters?.operation !== 'save' || report?.encoding !== 'gzip-base64' ||
    typeof report.data !== 'string' || report.data.length > 4_000_000 ||
    size - report.data.length > 4096 || !/^[A-Za-z0-9+/]*={0,2}$/.test(report.data)
  ) throw Error('REQUEST_TOO_LARGE');
}
