import React, { useMemo, useRef } from 'react';
import type { Context } from '@deepseek-ai/cordis';
import type {
  PropsRuntime,
  StoredEntry,
  LocaleNamespaceMap,
} from '@deepseek-ai/dsh-client-ui-slots';

type SeatState = {
  options: readonly { id: string }[];
};
type SeatProps = PropsRuntime<'conversation.hero.agentPreset'> & {
  useAgentPresetSeat<T>(selector: (state: SeatState) => T): T;
  select(id: string): Promise<string | undefined>;
};

function isMenuAgentVisible(id: string, allowed: ReadonlySet<string>): boolean {
  return (id !== 'gea-readonly' && !id.startsWith('gea-html-')) || allowed.has(id);
}

export function mountMenuAgentSelection(ctx: Context, useAllowed: () => ReadonlySet<string>): void {
  ctx.slots.inject('conversation.hero.agentPreset', () => {
    let source: StoredEntry | undefined;
    let release: (() => void) | undefined;
    const refresh = () => {
      const next = ctx.slots
        .entries('conversation.hero.agentPreset')
        .filter((entry) => entry.component !== Picker && entry.inject && entry.component)
        .sort((a, b) => (a.options.priority ?? 0) - (b.options.priority ?? 0))[0];
      if (next === source) return;
      source = next;
      release?.();
      release = undefined;
      if (!next?.inject) return;
      const inject = next.inject;
      release = ctx.slots.register(
        {
          name: 'conversation.hero.agentPreset',
          priority: -20,
          locale: next.locale as keyof LocaleNamespaceMap,
          inject: (sessionId) => Reflect.apply(inject, undefined, [sessionId]),
        },
        Picker,
      );
    };
    function Picker(runtime: PropsRuntime<'conversation.hero.agentPreset'>) {
      const props = runtime as SeatProps;
      const allowed = useAllowed();
      const allowedRef = useRef(allowed);
      allowedRef.current = allowed;
      const state = props.useAgentPresetSeat((state) => state);
      const filtered = useMemo(
        () => ({
          ...state,
          options: state.options.filter((option) => isMenuAgentVisible(option.id, allowed)),
        }),
        [state, allowed],
      );
      const Component = source?.component as React.ComponentType<SeatProps> | undefined;
      if (!Component) return null;
      const useFilteredSeat: SeatProps['useAgentPresetSeat'] = (selector) => selector(filtered);
      return (
        <Component
          {...props}
          useAgentPresetSeat={useFilteredSeat}
          select={(id) =>
            isMenuAgentVisible(id, allowedRef.current)
              ? props.select(id)
              : Promise.resolve(undefined)
          }
        />
      );
    }
    const stop = ctx.slots.subscribe('conversation.hero.agentPreset', refresh);
    refresh();
    return () => {
      stop();
      release?.();
    };
  });
}
