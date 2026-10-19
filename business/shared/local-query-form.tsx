import React, { type FormHTMLAttributes, type FormEvent, type SyntheticEvent } from 'react';

/** HTML plugins cannot submit forms. Keep validation, but invoke local reads from input events. */
export function LocalQueryForm({
  onSubmit,
  onClick,
  onKeyDown,
  ...props
}: FormHTMLAttributes<HTMLFormElement>) {
  const apply = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (event.currentTarget.reportValidity()) onSubmit?.(event as FormEvent<HTMLFormElement>);
  };
  return (
    <form
      {...props}
      onSubmit={apply}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        const control = (event.target as Element).closest?.('button,input') as
          | HTMLButtonElement
          | HTMLInputElement
          | null;
        if (control?.form === event.currentTarget && control.type === 'submit' && !control.disabled)
          apply(event);
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented || event.key !== 'Enter' || event.nativeEvent.isComposing)
          return;
        const input = event.target as HTMLInputElement;
        if (
          input.tagName === 'INPUT' &&
          !['button', 'submit', 'reset', 'checkbox', 'radio', 'file'].includes(input.type)
        )
          apply(event);
      }}
    />
  );
}
