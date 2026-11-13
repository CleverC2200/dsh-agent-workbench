import { useEffect } from 'react';

export function QueryErrors({
  errors,
  scope = 'business-data',
}: {
  errors: readonly string[];
  scope?: string;
}) {
  const message = [...new Set(errors.filter(Boolean))].join('\n');
  useEffect(() => {
    if (message) console.warn('business-data-diagnostic', { scope, message });
  }, [scope, message]);
  return null;
}
