import {
  SALES_PLAN_MONTHLY_REPORT_HEADERS,
  SalesPlanMonthlyReportError,
  type SalesPlanMonthlyReportRow,
} from './salesPlanMonthlyReportModel.ts';
import { subtractExactDecimals } from '../regionalApprovalQueryModel.ts';

const spreadsheetNumber = (value: string | number): string | number => {
  const raw = String(value);
  if (!/^-?\d+(?:\.\d+)?$/.test(raw))
    throw new SalesPlanMonthlyReportError('INVALID_REPORT_NUMBER');
  const number = Number(raw);
  return Number.isFinite(number) &&
    Math.abs(number) <= Number.MAX_SAFE_INTEGER &&
    raw.replace(/[-.]/g, '').replace(/^0+/, '').replace(/0+$/, '').length <= 15 &&
    !String(number).includes('e') &&
    /^-?0(?:\.0+)?$/.test(subtractExactDecimals(String(number), raw))
    ? number
    : raw;
};

export async function downloadSalesPlanMonthlyReport(
  rows: readonly SalesPlanMonthlyReportRow[],
  { month, signal }: { month?: string; signal: AbortSignal },
): Promise<void> {
  signal.throwIfAborted();
  if ((month !== undefined && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) || !rows.length)
    throw new SalesPlanMonthlyReportError('EMPTY_OR_INVALID_REPORT');
  const keys = new Set<string>();
  const cells = rows.map((row) => {
    if (
      row.length !== SALES_PLAN_MONTHLY_REPORT_HEADERS.length ||
      row.some(
        (value) =>
          typeof value !== 'string' && (typeof value !== 'number' || !Number.isFinite(value)),
      ) ||
      typeof row[17] !== 'string' ||
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(row[17]) ||
      (month !== undefined && row[17] !== month)
    )
      throw new SalesPlanMonthlyReportError('INCOMPLETE_REPORT_ROW');
    const key = JSON.stringify([row[8], row[13], row[17]]);
    if (keys.has(key)) throw new SalesPlanMonthlyReportError('DUPLICATE_REPORT_ROW');
    keys.add(key);
    return row.map((value, index) => (index >= 18 ? spreadsheetNumber(value) : value));
  });
  const xlsx = await import('xlsx-republish');
  signal.throwIfAborted();
  const sheet = xlsx.utils.aoa_to_sheet([[...SALES_PLAN_MONTHLY_REPORT_HEADERS], ...cells]);
  sheet['!cols'] = SALES_PLAN_MONTHLY_REPORT_HEADERS.map((_, index) => ({
    wch: index === 9 || index === 14 ? 36 : 18,
  }));
  for (let row = 2; row <= cells.length + 1; row++) {
    for (const column of ['W', 'X']) {
      const cell = sheet[`${column}${row}`];
      if (cell?.t === 'n') cell.z = '#,##0.00';
    }
  }
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, sheet, '月度计划');
  const data = xlsx.write(workbook, { type: 'array', bookType: 'xlsx' });
  signal.throwIfAborted();
  const url = URL.createObjectURL(
    new Blob([data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  );
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = `月度计划报表${month ?? ''}.xlsx`;
    link.click();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
