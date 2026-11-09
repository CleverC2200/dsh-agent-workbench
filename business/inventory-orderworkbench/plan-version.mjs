// Business-confirmed snapshot-day cutoffs apply independently to demand and transfer plans.
export function workbenchPlanSql(kind) {
  if (!['sales', 'transfer'].includes(kind)) throw Error('INVALID_WORKBENCH_PLAN_KIND');
  const day = 'CAST(SUBSTRING(CAST(the_date AS CHAR),9,2) AS INTEGER)';
  const fields =
    kind === 'sales'
      ? ['main_sales_plan_v1', 'main_sales_plan_adj', 'roll_sales_plan', 'next_month_sales_plan']
      : [
          'transfer_out_plan_v1',
          'transfer_out_plan_adj',
          'transfer_out_plan_roll',
          'next_month_out_plan',
        ];
  return `CASE WHEN ${day}<=16 THEN ${fields[0]} WHEN ${day}<=20 THEN ${fields[1]} WHEN ${day}<=26 THEN ${fields[2]} ELSE ${fields[3]} END`;
}
