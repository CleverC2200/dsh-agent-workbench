export function createPageViewState(page: any): {
  get: () => Record<string, unknown>;
  subscribe: (listener: any) => () => boolean;
  update: (changes: any) => void;
};
export function usePageViewField<T>(
  react: typeof import('react'),
  view: ReturnType<typeof createPageViewState>,
  key: string,
  initial: T | (() => T),
  encode?: (value: T) => unknown,
  decode?: (value: unknown) => T,
): [T, import('react').Dispatch<import('react').SetStateAction<T>>];
