import React from 'react';
import { formatExactDecimal } from './regionalApprovalQueryModel.ts';
import styles from './InlineSkuDetails.module.css';

export function SkuQuantityAmount({
  quantity,
  amount,
  children,
}: {
  quantity?: string;
  amount?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={styles.quantityAmount}>
      {children ?? <span>{quantity === undefined ? '—' : formatExactDecimal(quantity)}</span>}
      <small>{amount === undefined ? '—' : `¥${formatExactDecimal(amount)}`}</small>
    </div>
  );
}
