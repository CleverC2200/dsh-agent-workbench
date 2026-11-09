export function createInlineEdit(react) {
  const h = react.createElement;
  function EditButton({ label, active, disabled, onClick, children }) {
    return h(
      'button',
      {
        className: 'mps-edit-number',
        'aria-label': label,
        'aria-expanded': Boolean(active),
        disabled,
        onClick,
      },
      children,
      h(
        'svg',
        {
          width: 14,
          height: 14,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.6,
          'aria-hidden': true,
        },
        h('path', { d: 'm16 3 5 5L9 20l-6 1 1-6L16 3ZM14 5l5 5' }),
      ),
    );
  }
  function QuantityEditor({
    editorRef,
    title,
    groupLabel,
    quantityLabel,
    reasonLabel,
    value,
    reason,
    error,
    min = 0,
    onChange,
    onReasonChange,
    onSave,
    onCancel,
  }) {
    const id = react.useId();
    react.useEffect(() => {
      if (error)
        editorRef.current
          ?.querySelector(/原因/.test(error) ? '[data-reason]' : '[data-quantity]')
          ?.focus({ preventScroll: true });
    }, [error]);
    return h(
      'form',
      {
        className: 'mps-inline-editor',
        noValidate: true,
        ref: editorRef,
        onSubmit: (event) => {
          event.preventDefault();
          onSave();
        },
        onKeyDown: (event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            onCancel();
          } else if (
            event.key === 'Enter' &&
            event.target.tagName === 'INPUT' &&
            !(event.isComposing || event.nativeEvent?.isComposing)
          ) {
            event.preventDefault();
            onSave();
          }
        },
      },
      h(
        'fieldset',
        { 'aria-label': groupLabel },
        h('legend', null, title),
        h(
          'label',
          null,
          `${quantityLabel}（件）`,
          h('input', {
            'data-quantity': true,
            autoFocus: true,
            'aria-label': quantityLabel,
            'aria-describedby': error ? id : undefined,
            'aria-invalid': Boolean(error && !/原因/.test(error)),
            type: 'number',
            min,
            step: 'any',
            value,
            onChange: (event) => onChange(event.target.value),
          }),
        ),
        h(
          'label',
          { className: 'mps-edit-reason' },
          `${reasonLabel}（必填）`,
          h('input', {
            'data-reason': true,
            'aria-label': reasonLabel,
            'aria-required': true,
            'aria-describedby': error ? id : undefined,
            'aria-invalid': Boolean(error && /原因/.test(error)),
            value: reason,
            maxLength: 1000,
            onChange: (event) => onReasonChange(event.target.value),
          }),
        ),
        h(
          'div',
          { className: 'mps-edit-actions' },
          h('button', { type: 'button', className: 'dc-primary', onClick: onSave }, '保存'),
          h('button', { type: 'button', onClick: onCancel }, '取消'),
        ),
        error && h('p', { id, role: 'alert' }, error),
      ),
    );
  }
  function NumberInput({
    label,
    value,
    commit,
    min = 0,
    max = Number.MAX_SAFE_INTEGER,
    integer = false,
    explain,
    placeholder = '未填写',
  }) {
    const [text, setText] = react.useState('');
    const [changed, setChanged] = react.useState(false);
    const [error, setError] = react.useState('');
    const [saved, setSaved] = react.useState(false);
    const input = react.useRef(null);
    const id = react.useId();
    const cancel = () => {
      setChanged(false);
      setError('');
      input.current?.focus({ preventScroll: true });
    };
    const save = () => {
      if (!changed) return;
      const number = Number(text);
      if (
        text !== '' &&
        (!Number.isFinite(number) ||
          (min != null && number < min) ||
          number > max ||
          (integer && !Number.isSafeInteger(number)))
      ) {
        setError(
          integer
            ? min === 0
              ? '请输入安全范围内的非负整数。'
              : '请输入安全范围内的整数。'
            : max === Number.MAX_SAFE_INTEGER
              ? '请输入有效的非负数。'
              : `请输入${min ?? 0}至${max}之间的数值。`,
        );
        input.current?.focus({ preventScroll: true });
        return;
      }
      const failure = commit(text);
      if (failure) {
        setError(failure);
        return;
      }
      setChanged(false);
      setError('');
      setSaved(true);
      input.current?.focus({ preventScroll: true });
    };
    return h(
      'div',
      { className: 'mps-number-field', 'data-editing': changed || undefined },
      h('input', {
        ref: input,
        type: 'text',
        inputMode: integer ? 'numeric' : 'decimal',
        'aria-label': label,
        'aria-invalid': Boolean(error),
        'aria-describedby': error ? id : undefined,
        value: changed ? text : value == null ? '' : String(integer ? Math.round(value) : value),
        placeholder: value == null ? placeholder : undefined,
        onChange: (event) => {
          setText(event.target.value);
          setChanged(true);
          setSaved(false);
          setError('');
        },
        onDoubleClick: explain,
        title: explain ? '双击或Alt+Enter查看计算过程' : undefined,
        onKeyDown: (event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            cancel();
          } else if (event.key === 'Enter') {
            event.preventDefault();
            if (event.altKey && explain) explain();
            else save();
          }
        },
      }),
      changed &&
        h(
          'div',
          { className: 'mps-edit-actions' },
          h(
            'button',
            {
              type: 'button',
              className: 'dc-primary',
              'aria-label': `${label} 保存`,
              onClick: save,
            },
            '保存',
          ),
          h('button', { type: 'button', 'aria-label': `${label} 取消`, onClick: cancel }, '取消'),
        ),
      error && h('small', { id, role: 'alert' }, error),
      saved && !changed && h('small', { role: 'status' }, '已保存到本地草稿'),
    );
  }
  return { EditButton, QuantityEditor, NumberInput };
}
