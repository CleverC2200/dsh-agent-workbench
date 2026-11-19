import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { TFunction } from 'i18next';
import type {
  GeaSalesPlanAddedSku,
  GeaSalesPlanSkuQuote,
  GeaSalesPlanSkuQuoteQuery,
} from '../../bridge.ts';
import { isSalesPlanAddedSkuQuantity, isSalesPlanSkuCode } from './models/salesPlanActionModel.ts';
import styles from './InlineSkuDetails.module.css';

export function SalesPlanSkuAdditionEditor({
  query,
  additions,
  quotes,
  existing,
  onChange,
  onQuote,
  t,
}: {
  query: (
    input: Pick<GeaSalesPlanSkuQuoteQuery, 'skuCodes' | 'signal'>,
  ) => Promise<GeaSalesPlanSkuQuote[]>;
  additions: GeaSalesPlanAddedSku[];
  quotes: Readonly<Record<string, GeaSalesPlanSkuQuote>>;
  existing: ReadonlySet<string>;
  onChange: (items: GeaSalesPlanAddedSku[]) => void;
  onQuote: (quote: GeaSalesPlanSkuQuote) => void;
  t: TFunction;
}) {
  const id = useId();
  const [code, setCode] = useState('');
  const [qty, setQty] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController>();
  useEffect(() => () => request.current?.abort(), []);
  const label = (key: string) => t(`common.assistantSurface.regionalApproval.addSku.${key}`);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (request.current) return;
    const skuCode = code.trim();
    if (!isSalesPlanSkuCode(skuCode) || !isSalesPlanAddedSkuQuantity(qty.trim())) {
      setError('invalid');
      return;
    }
    if (existing.has(skuCode)) {
      setError('duplicate');
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError('');
    try {
      const rows = await query({
        skuCodes: [skuCode],
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      const quote = rows.find((row) => row.skuCode === skuCode);
      if (!quote) {
        setError('notSaleable');
        return;
      }
      if (quote.price === null) {
        setError('missingPrice');
        return;
      }
      onQuote(quote);
      onChange([
        ...additions.filter((item) => item.skuCode !== skuCode),
        { skuCode, qty: qty.trim() },
      ]);
      setCode('');
      setQty('');
    } catch {
      if (!controller.signal.aborted) setError('lookupFailed');
    } finally {
      if (request.current === controller) request.current = undefined;
      if (!controller.signal.aborted) setBusy(false);
    }
  };
  return (
    <section className={styles.additionEditor} aria-label={label('title')}>
      <form onSubmit={(event) => void submit(event)} className={styles.additionForm}>
        <label htmlFor={id + '-sku'}>
          {label('code')}
          <input
            id={id + '-sku'}
            name="skuCode"
            type="text"
            inputMode="numeric"
            required
            maxLength={19}
            value={code}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => {
              setCode(event.target.value);
              setError('');
            }}
            disabled={busy}
          />
        </label>
        <label htmlFor={id + '-qty'}>
          {label('quantity')}
          <input
            id={id + '-qty'}
            name="quantity"
            type="text"
            inputMode="decimal"
            required
            maxLength={19}
            value={qty}
            onChange={(event) => {
              setQty(event.target.value);
              setError('');
            }}
            disabled={busy}
          />
        </label>
        <button type="submit" disabled={busy}>
          {label(busy ? 'loading' : 'title')}
        </button>
      </form>
      {error ? <div role="alert">{label(error)}</div> : null}
      {additions.length ? (
        <ul className={styles.additionRows}>
          {additions.map((item) => (
            <li key={item.skuCode}>
              <span>
                {item.skuCode} {quotes[item.skuCode]?.skuName}
              </span>
              <span>
                {label('quantity')} {item.qty}
              </span>
              <span>{quotes[item.skuCode]?.price ?? label('missingPrice')}</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setCode(item.skuCode);
                  setQty(item.qty);
                  document.getElementById(id + '-qty')?.focus();
                }}
              >
                {label('edit')}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onChange(additions.filter((row) => row.skuCode !== item.skuCode))}
              >
                {label('remove')}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
