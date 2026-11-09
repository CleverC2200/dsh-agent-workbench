export function createBatchEdit(react) {
  const h = react.createElement;
  function useBatchEdit({ scope, onEditingChange, requireReason = false, onStart, onCancel }) {
    const [active, setActive] = react.useState(false);
    const [pending, setPending] = react.useState({});
    const [reason, setReason] = react.useState('');
    const [error, setError] = react.useState('');
    const [notice, setNotice] = react.useState('');
    const commit = react.useRef(null);
    const fields = react.useRef(new Map());
    const trigger = react.useRef(null);
    const reasonRef = react.useRef(null);
    const reset = () => {
      setActive(false);
      setPending({});
      setReason('');
      setError('');
    };
    react.useEffect(() => {
      reset();
      setNotice('');
    }, [scope]);
    react.useEffect(() => {
      onEditingChange?.(active);
      return () => onEditingChange?.(false);
    }, [active, onEditingChange]);
    react.useEffect(() => {
      if (active) fields.current.values().next().value?.focus({ preventScroll: true });
    }, [active]);
    const finish = () => {
      reset();
      requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true }));
    };
    const cancel = () => {
      onCancel?.();
      finish();
    };
    const save = () => {
      try {
        const entries = Object.entries(pending).map(([id, entry]) => {
          let value = entry.text;
          if (!entry.textual) {
            value = entry.text.trim() === '' ? null : Number(entry.text);
            if (
              (value === null && entry.required) ||
              (value !== null &&
                (!Number.isFinite(value) ||
                  (entry.min != null && value < entry.min) ||
                  value > (entry.max ?? Number.MAX_SAFE_INTEGER) ||
                  (entry.integer && !Number.isSafeInteger(value))))
            ) {
              const field = fields.current.get(id);
              let fold = field?.closest('details');
              while (fold) {
                fold.open = true;
                fold = fold.parentElement?.closest('details');
              }
              field?.focus();
              throw Error(
                `${entry.label}：请输入${entry.integer ? '安全范围内的整数' : '有效数值'}${entry.min === 0 ? '，且不能小于0' : ''}。`,
              );
            }
          }
          return { ...entry, id, value };
        });
        if (requireReason && entries.length && !reason.trim()) {
          reasonRef.current?.focus();
          throw Error('请填写本次调整原因。');
        }
        commit.current?.(entries, reason.trim());
        finish();
        setNotice('已保存到本地草稿');
      } catch (failure) {
        setError(failure.message);
      }
    };
    return {
      active,
      pending,
      reason,
      error,
      notice,
      commit,
      fields,
      trigger,
      reasonRef,
      save,
      cancel,
      start: () => {
        onStart?.();
        setPending({});
        setReason('');
        setError('');
        setNotice('');
        setActive(true);
      },
      stage: (id, entry) => {
        setPending((previous) => ({ ...previous, [id]: entry }));
        setError('');
      },
      replace: (entries) => {
        setPending(entries);
        setError('');
      },
      clearError: () => setError(''),
      setReason: (value) => {
        setReason(value);
        setError('');
      },
      keyDown: (event) => {
        if (
          !active ||
          event.isComposing ||
          event.nativeEvent?.isComposing ||
          event.target.closest('dialog')
        )
          return;
        if (event.key === 'Escape') {
          event.preventDefault();
          cancel();
        } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          save();
        }
      },
    };
  }
  function Actions({ batch, requireReason = false, disabled = false, hint = '留空恢复系统值' }) {
    return h(
      'div',
      { className: 'mps-batch-actions' },
      batch.active
        ? h(
            react.Fragment,
            null,
            requireReason &&
              h(
                'label',
                null,
                '调整原因',
                h('input', {
                  ref: batch.reasonRef,
                  'aria-label': '批量调整原因',
                  value: batch.reason,
                  maxLength: 1000,
                  placeholder: '本次修改的原因',
                  onChange: (event) => batch.setReason(event.target.value),
                }),
              ),
            hint && h('span', { className: 'dc-card-note' }, hint),
            h('button', { className: 'dc-primary', onClick: batch.save }, '保存调整'),
            h('button', { onClick: batch.cancel }, '取消'),
          )
        : h(
            'button',
            { ref: batch.trigger, className: 'dc-primary', disabled, onClick: batch.start },
            '调整',
          ),
      batch.error && h('p', { role: 'alert', className: 'mps-batch-feedback' }, batch.error),
      !batch.error &&
        batch.notice &&
        h('span', { role: 'status', className: 'mps-edit-notice' }, batch.notice),
    );
  }
  function Field({
    batch,
    id,
    label,
    value,
    meta,
    min = 0,
    max,
    integer = false,
    required = false,
    disabled = false,
    title,
    textual = false,
    format = (value) => String(value),
    editFormat = (value) => String(value),
    placeholder = '待补',
    onStage,
    onExplain,
  }) {
    const text = value == null ? '' : editFormat(value);
    if (!batch.active || disabled) {
      const content = value == null || value === '' ? placeholder : format(value);
      return onExplain
        ? h(
            'button',
            { className: 'sp-number', 'aria-label': `${label} 计算过程`, onClick: onExplain },
            content,
          )
        : h(
            'span',
            {
              'aria-label': label,
              className:
                value == null || value === ''
                  ? 'mps-batch-value dc-demand-missing'
                  : 'mps-batch-value',
              title,
            },
            content,
          );
    }
    return h('input', {
      ref: (element) => {
        if (element) batch.fields.current.set(id, element);
        else batch.fields.current.delete(id);
      },
      className: 'mps-batch-input',
      'aria-label': label,
      title,
      type: 'text',
      inputMode: textual ? undefined : integer ? 'numeric' : 'decimal',
      value: onStage ? text : (batch.pending[id]?.text ?? text),
      placeholder,
      onChange: (event) => {
        if (onStage) {
          batch.clearError();
          onStage(event.target.value);
        } else
          batch.stage(id, {
            text: event.target.value,
            label,
            meta,
            min,
            max,
            integer,
            required,
            textual,
          });
      },
      onDoubleClick: onExplain,
      onKeyDown: (event) => {
        if (event.altKey && event.key === 'Enter' && onExplain) {
          event.preventDefault();
          onExplain();
        }
      },
    });
  }
  return { useBatchEdit, Actions, Field };
}
