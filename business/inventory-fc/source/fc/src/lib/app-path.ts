export function normalizeBasePath(value = "") {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "/") return "";
  return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
}

export const APP_BASE_PATH = normalizeBasePath(process.env.NEXT_PUBLIC_BASE_PATH);

export function appPath(path: string, basePath = APP_BASE_PATH) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizeBasePath(basePath)}${normalizedPath}`;
}
