export function appPath(path: string) {
  return `${process.env.NEXT_PUBLIC_APP_BASE_PATH ?? ''}${path}`;
}
