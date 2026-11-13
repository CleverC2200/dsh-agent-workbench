import React from 'react';
import { formatExactDecimal } from './regionalApprovalQueryModel.ts';
import { roundPlanQuantity } from './models/salesPlanQuantityModel.ts';
import styles from './InlineSkuDetails.module.css';

export function SkuQuantityAmount({
  quantity,
  amount,
  children,
  signed = false,
}: {
  quantity?: string;
  amount?: string;
  children?: React.ReactNode;
  signed?: boolean;
}) {
  const normalizedQuantity = quantity === undefined ? undefined : roundPlanQuantity(quantity);
  const prefix = (value: string) =>
    signed && !/^[-+]?0+(?:\.0+)?$/.test(value) && !value.startsWith('-') ? '+' : '';
  return (
    <div className={styles.quantityAmount}>
      {children ?? (
        <span>
          {normalizedQuantity === undefined
            ? '—'
            : `${prefix(normalizedQuantity)}${formatExactDecimal(normalizedQuantity)}`}
        </span>
      )}
      <small>
        {amount === undefined
          ? '—'
          : signed
            ? `${amount.startsWith('-') ? '-' : prefix(amount)}¥${formatExactDecimal(amount.replace(/^[+-]/, ''))}`
            : `¥${formatExactDecimal(amount)}`}
      </small>
    </div>
  );
}
