/** Local acceptance transport only; it cannot choose a recipient or execute business writes. */
export async function fulfillmentSimulationRequest(
  page: string,
  parameters: unknown,
  signal: AbortSignal,
) {
  const input = parameters as { operation?: string; token?: string; runId?: string } | null;
  if (
    globalThis.location?.origin !== 'http://127.0.0.1:3198' ||
    page !== 'inventory-orderfulfillment' ||
    !input ||
    !['notify', 'state'].includes(input.operation ?? '') ||
    typeof input.token !== 'string' ||
    typeof input.runId !== 'string'
  )
    throw Error('SIMULATION_TRANSPORT_DENIED');
  const response = await fetch('http://127.0.0.1:3197/client', {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', 'X-Simulation-Token': input.token },
    body: JSON.stringify(parameters),
  });
  const result = await response.json();
  if (!response.ok) throw Error(result.error ?? 'SIMULATION_REQUEST_FAILED');
  return result;
}
