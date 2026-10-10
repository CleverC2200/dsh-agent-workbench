/**
 * Browser-visible paths built by application code are not rewritten by
 * Next.js. Keep them aligned with the build-time basePath used by GEA's
 * sub-path proxy, while preserving root-path local development.
 */
// `NEXT_PUBLIC_APP_BASE_PATH` is baked into browser code at build time. The
// App Router runs on Node.js as well, where Docker provides NEXT_BASE_PATH at
// runtime; use it first so server-side route handlers match the same prefix.
const configuredBasePath = (
  process.env.NEXT_BASE_PATH ??
  process.env.NEXT_PUBLIC_APP_BASE_PATH ??
  ''
)
  .trim()
  .replace(/^\/+|\/+$/g, '');

export const appBasePath = configuredBasePath ? `/${configuredBasePath}` : '';

export function withAppBasePath(path: `/${string}`) {
  return `${appBasePath}${path}`;
}
