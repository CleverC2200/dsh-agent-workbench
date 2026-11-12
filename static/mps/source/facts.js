import { previousFiscalYear } from 'dsh-agent-manage/mps-compute/workflow';
import { sourceAmount } from './source-money.js';
import { call } from '../../../business/shared/channel.js';
import { createQueryClient } from '../../../business/shared/configured-query-client.mjs';

const number = (value) => {
  if (value === null) return '';
  if (
    !['number', 'string'].includes(typeof value) ||
    String(value).trim() === '' ||
    !Number.isFinite(Number(value)) ||
    Math.abs(Number(value)) > Number.MAX_SAFE_INTEGER
  )
    throw Error('事实来源返回了无效数量');
  return Number(value);
};
const text = (value) => {
  if (value === null) return '';
  if (typeof value !== 'string') throw Error('事实来源返回了无效维度');
  return value;
};
export async function readFactMonth(type, month, signal) {
  if (!['report', 'history', 'plan-quantity'].includes(type)) throw Error('该事实来源尚未接入');
  const result = await readFacts('facts.' + type, { month: month + '-01' }, signal, type, month);
  return type === 'report'
    ? { ...result, amounts: await readReportAmounts(month, signal) }
    : result;
}
export async function readHistoryAnnual(month, signal) {
  const period = previousFiscalYear(month);
  return readFacts('facts.history-annual', period, signal, 'historyAnnual');
}
async function readFacts(id, parameters, signal, type, month) {
  const element = document.getElementById('agent-sql-config');
  if (!element) throw Error('月主计划数据源尚未装载');
  const config = JSON.parse(element.textContent);
  const definition = config.queries[id];
  const client = createQueryClient(config, (_request, options) =>
    call(
      'sql',
      {
        queryId: options.queryId,
        parameters: options.values,
      },
      { signal: options.signal },
    ),
  );
  if (type === 'shipmentDate')
    return client.read(id, parameters, { signal, requiredColumns: definition.columns });
  if (
    type === 'report' ||
    type === 'plan-quantity' ||
    type === 'shipment' ||
    type === 'inventoryTargets'
  ) {
    const result = await client.readAll(
      id,
      { ...parameters, page_size: 5000, offset: 0 },
      { signal, keyFields: definition.grain, requiredColumns: definition.columns, maxRows: 100000 },
    );
    if (type === 'shipment' || type === 'inventoryTargets')
      return {
        rows: result.rows,
        metadata: {
          partial: false,
          warnings: [],
          total: result.total,
          configVersion: result.configVersion,
          ...parameters,
        },
      };
    return {
      rows: result.rows.map((row) => {
        const base = text(row.belong_base),
          code = text(row.material_code);
        if (type === 'plan-quantity')
          return {
            月份: month,
            基地: base,
            产品编码: code,
            计划数量: number(row.plan_qty_total),
            已知计划数量: number(row.known_plan_qty_total),
            源计划数量: number(row.source_plan_qty_total),
            源记录数: number(row.source_rows),
            缺数量条数: number(row.missing_rows),
            重复键条数: number(row.duplicate_rows),
            源日期开始: text(row.source_date_start),
            源日期结束: text(row.source_date_end),
            缺项原因: [
              ...(Number(row.duplicate_rows) > 0 ? ['计划来源六维业务键重复，未合计有效量'] : []),
              ...(Number(row.missing_rows) > 0 ? ['计划数量缺失，保留已知小计'] : []),
              ...(!code ? ['缺物料编码'] : []),
            ].join('；'),
          };
        const dimensions = {
          产品名称: text(row.material_name),
          大类: text(row.sub_category),
          系列: text(row.series),
          物料组: text(row.product_item),
          物料组名称: text(row.product_item_name),
        };
        return {
          月份: month,
          大区: text(row.region_name),
          基地: base,
          产品编码: code,
          ...dimensions,
          源月初数量: number(row.plannum_total),
          源纠偏数量: number(row.allnum_total),
          月初数量: base && code ? number(row.plannum_total) : '',
          纠偏数量: base && code ? number(row.allnum_total) : '',
        };
      }),
      metadata: {
        period: month,
        ...(type === 'plan-quantity'
          ? { sourceTable: 'ai_db.agents_scm_dws_scm_cust_plan_exe_di', quantityField: 'allnum' }
          : {}),
        partial: false,
        warnings: [],
        total: result.total,
        configVersion: result.configVersion,
      },
    };
  }
  const rows = [],
    seen = new Set(),
    warnings = [];
  let total,
    version,
    signature,
    partial = false;
  for (let offset = 0; total === undefined || offset < total; offset += 200) {
    const result = await client.read(
      id,
      { ...parameters, page_size: 200, offset },
      {
        signal,
        requiredColumns: definition.columns,
      },
    );
    if (total === undefined) {
      total = result.totalRowCount;
      version = result.configVersion;
      signature = JSON.stringify(result.returnedColumns);
    }
    if (!Number.isSafeInteger(total) || total < 0 || total > 100000)
      throw Error('事实读取范围超过上限或缺少完整计数');
    if (
      result.totalRowCount !== total ||
      result.configVersion !== version ||
      JSON.stringify(result.returnedColumns) !== signature ||
      result.offset !== offset ||
      result.rows.length !== Math.min(200, total - offset) ||
      result.hasMorePages !== offset + result.rows.length < total
    )
      throw Error('事实分页或配置发生变化，未采用不完整结果，请重新同步');
    for (const row of result.rows) {
      const key = JSON.stringify(definition.grain.map((field) => row[field]));
      if (seen.has(key)) throw Error('事实分页出现重复业务键，未采用不完整结果');
      seen.add(key);
      rows.push(row);
    }
    partial ||= result.dataStatus === 'partial';
    warnings.push(...(result.warnings ?? []));
  }
  const prefix = 'agents_scm_cust_deliv_daily_di.';
  const records = rows.map((row) => {
    const value = (name) => row[prefix + name];
    const base = text(value('belong_base'));
    const code = text(value('material_code'));
    return {
      ...(type === 'historyAnnual'
        ? { 期间开始: parameters.start, 期间结束: parameters.end }
        : { 月份: month }),
      基地: base,
      产品编码: code,
      产品名称: text(value('material_name')),
      大类: text(value('product_categ_name')),
      系列: '',
      物料组: text(value('material_group_name')),
      数量: number(value('act_dl_qty_total')),
      含赠品数量: number(value('act_dl_qty_all_total')),
      不含税收入: number(value('income_excl_tax_local_total')),
    };
  });
  return {
    rows: records,
    metadata: {
      ...(type === 'historyAnnual' ? parameters : { period: month }),
      partial,
      warnings,
      total,
      configVersion: version,
    },
  };
}

const validShipmentDate = (value) =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value + 'T00:00:00Z')) &&
  new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;

export async function readLatestShipmentDate(month, signal) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw Error('发货统计月份无效');
  const [year, monthNumber] = month.split('-').map(Number);
  const monthEnd = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
  const result = await readFacts(
    'facts.shipment-latest',
    { month: month + '-01', month_end: monthEnd },
    signal,
    'shipmentDate',
  );
  if (result.rows.length !== 1) throw Error('最新发货日期来源未返回唯一结果');
  const date = result.rows[0].latest_date;
  if (date !== null && (!validShipmentDate(date) || !date.startsWith(month + '-')))
    throw Error('源端最新发货日期无效或不属于当前统计月份');
  return {
    date,
    metadata: { month, configVersion: result.configVersion, readAt: new Date().toISOString() },
  };
}

export async function readShipmentInputs(cutoff, signal) {
  if (!validShipmentDate(cutoff)) throw Error('发货输入须限定有效截止日期');
  const month = cutoff.slice(0, 7);
  const passed = Number(cutoff.slice(8));
  const [year, monthNumber] = month.split('-').map(Number);
  const totalDays = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const recentStart = `${month}-${String(Math.max(1, passed - 2)).padStart(2, '0')}`;
  const result = await readFacts(
    'facts.shipment',
    { month: month + '-01', cutoff, recent_start: recentStart },
    signal,
    'shipment',
  );
  return {
    ...result,
    metadata: { ...result.metadata, sourceTable: 'ai_db.agents_scm_stock_detail_d' },
    rows: result.rows.map((row) => {
      const quantities = Object.fromEntries(
        ['shipped', 'prepped', 'unprepped', 'daily3', 'average', 'open', 'inbound'].map((field) => [
          field,
          row[field] === null ? null : number(row[field]),
        ]),
      );
      return {
        month,
        base: text(row.belong_base),
        code: text(row.material_code),
        name: text(row.material_name),
        category: '',
        series: text(row.series),
        group: text(row.product_item),
        ...quantities,
        remaining:
          quantities.inbound == null || passed <= 1
            ? null
            : Math.round((quantities.inbound / (passed - 1)) * (totalDays - passed)),
        sourceDays: number(row.source_days),
        duplicateDays: number(row.duplicate_days),
      };
    }),
  };
}

export async function readInventoryTargets(month, endMonth, signal) {
  const result = await readFacts(
    'inventory-targets.detail',
    { start_month: month, end_month: endMonth },
    signal,
    'inventoryTargets',
  );
  return {
    rows: result.rows.map((row) => ({
      month: text(row.target_month),
      base: text(row.belong_base),
      code: text(row.material_code),
      version: text(row.inventory_version),
      finalTarget: row.final_target_inventory === null ? null : number(row.final_target_inventory),
      dailyDemand:
        row.avg_daily_planned_demand === null ? null : number(row.avg_daily_planned_demand),
      finalTurnoverDays:
        row.final_target_turnover_days == null ? null : number(row.final_target_turnover_days),
      turnoverDaysValueCount: number(row.turnover_days_value_count),
      missingTurnoverDaysRows: number(row.missing_turnover_days_rows),
      sourceRows: number(row.source_rows),
      finalTargetValueCount: number(row.final_target_value_count),
      dailyDemandValueCount: number(row.daily_demand_value_count),
      missingTargetRows: number(row.missing_target_rows),
      missingDailyRows: number(row.missing_daily_rows),
      conflictFields: [
        ...(Number(row.final_target_value_count) > 1 ? ['finalTarget'] : []),
        ...(Number(row.daily_demand_value_count) > 1 ? ['dailyDemand'] : []),
        ...(Number(row.turnover_days_value_count) > 1 ? ['finalTurnoverDays'] : []),
      ],
    })),
    metadata: {
      ...result.metadata,
      sourceTable: 'ai_db.agents_scm_goods_inventory_turnover_data_m',
      readAt: new Date().toISOString(),
    },
  };
}

export async function readReportAmounts(month, signal) {
  const metadata = {
    period: month,
    sourceTable: 'ai_db.agents_scm_dws_scm_cust_plan_exe_di',
    originalSource: 'hive.dw.dws_scm_cust_plan_exe',
  };
  const element = document.getElementById('agent-sql-config');
  const config = element ? JSON.parse(element.textContent) : null;
  const definition = config?.queries['facts.report-amounts'];
  if (!definition)
    return {
      ...metadata,
      status: 'unconfigured',
      rows: [],
      error: '提报金额来源尚未配置，月初和最终计划金额待补',
    };
  try {
    const client = createQueryClient(config, (_request, options) =>
      call(
        'sql',
        {
          queryId: options.queryId,
          parameters: options.values,
        },
        { signal: options.signal },
      ),
    );
    const result = await client.readAll(
      'facts.report-amounts',
      { month: month + '-01', page_size: 5000, offset: 0 },
      {
        signal,
        keyFields: definition.grain,
        requiredColumns: ['belong_base', 'material_code', 'ycplanamount', 'monthamount'],
        maxRows: 100000,
      },
    );
    return {
      ...metadata,
      status: 'ready',
      configVersion: result.configVersion,
      rows: result.rows.map((row) => ({
        月份: month,
        基地: text(row.belong_base),
        产品编码: text(row.material_code),
        月初计划金额: sourceAmount(row.ycplanamount),
        最终计划金额: sourceAmount(row.monthamount),
        缺项原因: [!row.belong_base ? '缺基地' : '', !row.material_code ? '缺产品编码' : '']
          .filter(Boolean)
          .join('；'),
      })),
    };
  } catch (error) {
    if (signal?.aborted) throw error;
    return { ...metadata, status: 'failed', rows: [], error: error.message };
  }
}
