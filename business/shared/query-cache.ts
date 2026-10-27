// A page can bypass its Host snapshot on an explicit refresh without owning
// credentials or placing business rows in browser storage.
let freshAfter = 0;
export const configuredQueryFreshAfter = () => freshAfter;
export function refreshConfiguredQueries() {
  freshAfter = Date.now();
}
if (typeof window !== 'undefined') {
  window.addEventListener('gea-page-refresh', refreshConfiguredQueries);
  window.addEventListener('light-refresh', refreshConfiguredQueries);
}
