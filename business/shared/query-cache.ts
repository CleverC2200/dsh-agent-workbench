// A page can bypass its Host snapshot on an explicit refresh without owning
// credentials or placing business rows in browser storage.
let freshAfter = 0;
let identityGeneration = 0;
const identityListeners = new Set<() => void>();
export const configuredQueryIdentity = () => identityGeneration;
export const subscribeQueryIdentity = (listener: () => void) => {
  identityListeners.add(listener);
  return () => {
    identityListeners.delete(listener);
  };
};
export const configuredQueryFreshAfter = () => freshAfter;
export function refreshConfiguredQueries() {
  freshAfter = Date.now();
}
if (typeof window !== 'undefined') {
  window.addEventListener('gea-page-refresh', refreshConfiguredQueries);
  window.addEventListener('light-refresh', refreshConfiguredQueries);
  window.addEventListener('gea-identity-changed', () => {
    identityGeneration++;
    refreshConfiguredQueries();
    identityListeners.forEach((listener) => listener());
  });
}
