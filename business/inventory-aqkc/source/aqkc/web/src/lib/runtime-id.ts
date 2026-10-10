let fallbackCounter = 0;

function fallbackUuid(seed: string) {
  let hashA = 0x811c9dc5;
  let hashB = 0x9e3779b9;

  for (let index = 0; index < seed.length; index += 1) {
    const code = seed.charCodeAt(index);
    hashA ^= code;
    hashA = Math.imul(hashA, 0x01000193);
    hashB ^= code + index;
    hashB = Math.imul(hashB, 0x85ebca6b);
  }

  const hex = [
    (hashA >>> 0).toString(16).padStart(8, '0'),
    (hashB >>> 0).toString(16).padStart(8, '0'),
    ((hashA ^ hashB) >>> 0).toString(16).padStart(8, '0'),
    ((hashA + hashB) >>> 0).toString(16).padStart(8, '0'),
  ].join('');

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `${((parseInt(hex.slice(16, 17), 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}

export function createRuntimeId(prefix = 'id'): string {
  if (
    typeof globalThis !== 'undefined' &&
    'crypto' in globalThis &&
    typeof globalThis.crypto?.randomUUID === 'function'
  ) {
    return globalThis.crypto.randomUUID();
  }

  fallbackCounter += 1;
  return fallbackUuid(
    `${prefix}-${Date.now()}-${fallbackCounter}-${Math.random().toString(16).slice(2, 10)}`,
  );
}
