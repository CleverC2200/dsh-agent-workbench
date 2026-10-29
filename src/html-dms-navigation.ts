/** Only the branch Host can supply the destination; HTML cannot provide an arbitrary URL. */
export async function openBranchDms(
  pageId: string,
  parameters: unknown,
  login: () => Promise<unknown>,
  active: () => boolean,
  open: (url: string) => void,
) {
  if (
    pageId !== 'inventory-fc' ||
    !parameters ||
    typeof parameters !== 'object' ||
    Array.isArray(parameters) ||
    Object.keys(parameters).length !== 0
  )
    throw Error('DMS_NAVIGATION_NOT_ALLOWED');
  const result = (await login()) as { redirect?: unknown };
  if (!active()) throw Error('PAGE_SESSION_CHANGED');
  let url: URL;
  try {
    url = new URL(String(result?.redirect ?? ''));
  } catch {
    throw Error('DMS_NAVIGATION_INVALID');
  }
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    !url.pathname.endsWith('/user/loginSSO') ||
    !url.searchParams.get('token') ||
    url.searchParams.get('menu') !== '/corder/ordermgt'
  )
    throw Error('DMS_NAVIGATION_INVALID');
  open(url.href);
  return { requested: true };
}
