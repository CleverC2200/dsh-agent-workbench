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
