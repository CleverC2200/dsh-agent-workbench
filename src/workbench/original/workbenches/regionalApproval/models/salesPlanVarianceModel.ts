export type SalesPlanVarianceSign = 'positive' | 'negative' | 'zero';

const EXACT_DECIMAL = /^-?\d+(?:\.\d+)?$/;
const EXACT_ZERO = /^-?0(?:\.0+)?$/;

export const salesPlanVarianceSign = (
  value: string | null | undefined,
): SalesPlanVarianceSign | undefined => {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  if (!EXACT_DECIMAL.test(text)) return undefined;
  if (EXACT_ZERO.test(text)) return 'zero';
  return text.startsWith('-') ? 'negative' : 'positive';
};

export const salesPlanVarianceClass = (
  value: string | null | undefined,
  positiveClass: string,
  negativeClass: string,
): string | undefined => {
  const sign = salesPlanVarianceSign(value);
  if (sign === 'positive') return positiveClass;
  if (sign === 'negative') return negativeClass;
  return undefined;
};
