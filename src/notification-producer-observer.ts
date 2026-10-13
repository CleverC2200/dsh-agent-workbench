/** Temporary [CI-NOTIFICATION-PRODUCER] diagnostics; excluded from the formal candidate. */
declare global {
  interface Window {
    __ciNotificationProducer?: boolean;
  }
}

export function notificationProducer(
  stage: string,
  fields: Readonly<Record<string, string | boolean | null | undefined>>,
): void {
  if (typeof window === 'undefined' || window.__ciNotificationProducer !== true) return;
  window.dispatchEvent(
    new CustomEvent('ci-notification-producer', {
      detail: { stage, observedAt: performance.now(), ...fields },
    }),
  );
}
