import { action, reportElements } from '../../../shared/channel.js';
import * as React from 'react';
import { createPageViewState, usePageViewField } from '../../../shared/view-state.js';
const apsView = createPageViewState('inventory-apsplan');
import { scopedData } from 'dsh-agent-manage/aps-compute/adapter';
void 'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as _ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bell,
  Bot,
  Boxes,
  CalendarDays,
  Check,
  CircleHelp,
  ChevronDown,
  ClipboardCheck,
  Download,
  Factory,
  History,
  LayoutGrid,
  Link2,
  Menu as _Menu,
  MessageSquare,
  PackageSearch,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRight,
  Plus,
  Search,
  Send,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
  WandSparkles,
  X,
} from 'lucide-react';
import {
  Table as _Table,
  TableBody as _TableBody,
  TableCell as _TableCell,
  TableHead as _TableHead,
  TableHeader as _TableHeader,
  TableRow as _TableRow,
} from '@/components/ui/table';
import {
  baseProductHierarchy,
  type BaseProductItem,
} from 'dsh-agent-manage/aps-compute/base-product-hierarchy';
import { browserStorage } from './data/browser-storage';
import { useWorkspace } from './data/use-workspace';
import { deriveMetrics } from 'dsh-agent-manage/aps-compute/metrics';
import {
  metricValues as _metricValues,
  comparisonValues,
  createMetricReader,
  formatNumber,
} from 'dsh-agent-manage/aps-compute/adapter';
import { askHost, setViewContext, acknowledgePendingView } from './data/host-bridge';
import { summarizePage } from 'dsh-agent-manage/aps-compute/page-analysis';
import {
  analyzePerspective,
  analyzeProductionMatrix,
  matrixCellsFromData,
} from 'dsh-agent-manage/aps-compute/perspective-analysis';
import {
  deriveWorkbenchInsights,
  deriveOrderRisks,
} from 'dsh-agent-manage/aps-compute/workbench-insights';
import { effectivePeriodEnd, isFutureCalendarDay } from 'dsh-agent-manage/aps-compute/period';
import {
  salesOrgCounts,
  salesOrgHierarchy,
} from 'dsh-agent-manage/aps-compute/sales-org-hierarchy';

type MetricName = '作废率' | '改单率' | '订单满足率' | '准交率' | '可发货天数';
type MetricSnapshot = Record<MetricName, number>;
type MetricUnit = '%' | '天' | '万件';
type OverviewMetricName =
  | '销售预算达成率'
  | '销售提报准确率'
  | '销售提报达成率'
  | '需求预测准确率'
  | '需求预测达成率'
  | '生产计划达成率'
  | '订单满足率'
  | '订单缺货量'
  | '可发货天数'
  | '库存量';
type OverviewMetricSnapshot = Record<OverviewMetricName, number>;
type OverviewMetricGroupLabel = '销售指标' | '计划指标' | '订单指标' | '库存指标';
type AnalysisScope = 'overview' | 'production' | 'sales';
type ProductionDimension = 'category' | 'base' | 'cross';
type SalesMetricTab = 'overview' | 'budget' | 'reporting';
type MatrixMode = 'rate' | 'stock' | 'plan' | 'inventory' | 'delivery' | 'change' | 'void';
const crossMatrixModes: Array<'rate' | 'stock' | 'plan' | 'inventory'> = [
  'rate',
  'stock',
  'plan',
  'inventory',
];
type MatrixRiskLevel = '严重' | '预警' | '健康';
type MatrixRiskRow = {
  scope: string;
  value: number;
  adjusted?: number;
  gap: number;
  level: MatrixRiskLevel;
  granularity: '基地 × 品类' | '基地汇总';
};
const riskLevelClass: Record<MatrixRiskLevel, 'critical' | 'watch' | 'normal'> = {
  严重: 'critical',
  预警: 'watch',
  健康: 'normal',
};
type TaskScope = '品类' | '基地' | '交叉分析' | '销售组织';
type TaskStatusFilter = '全部' | '已完成' | '未完成';
type TimeGranularity = 'year' | 'month' | 'week' | 'day';
const timeGranularityOptions: Array<{ key: TimeGranularity; label: string }> = [
  { key: 'year', label: '年度视角' },
  { key: 'month', label: '月度视角' },
  { key: 'week', label: '周度视角' },
  { key: 'day', label: '日度视角' },
];
type CategoryMetricTab =
  | 'overview'
  | 'forecast'
  | 'plan'
  | 'inventory'
  | 'stock'
  | 'shortage'
  | 'satisfaction';
type BaseMetricTab = CategoryMetricTab;
type ProductionDrillMetricName =
  | '需求预测准确率'
  | '生产计划达成率'
  | '库存量'
  | '可发货天数'
  | '订单缺货量'
  | '订单满足率';
type ProductionDrillValues = Record<ProductionDrillMetricName, number>;
type AssignedTask = {
  id: string;
  scopeType: TaskScope;
  scope: string;
  metric: string;
  owner: string;
  content: string;
  due: string;
  status: '进行中' | '已完成';
  createdAt: string;
  analysisPeriod?: string;
  statisticType?: '累计指标' | '快照指标';
  dataCutoff?: string;
  completionSummary?: string;
  completedAt?: string;
};
type DiagnosticRiskItem = {
  id: string;
  perspective: 'production' | 'sales';
  scopeType: TaskScope;
  scope: string;
  levelLabel: string;
  metric: string;
  value: string;
  target: string;
  gap: string;
  risk: Exclude<MatrixRiskLevel, '健康'>;
  rawGap: number;
  jump: () => void;
};
type DashboardContext = { id: string; scope: string; label: string; summary: string };
type HelpContentRecord = {
  content: string;
  label: string;
  updatedAt: string;
  source: 'default' | 'user' | 'legacy';
};
type HelpContentRegistry = Record<string, HelpContentRecord>;
type DigitalHumanStage = 'dashboard' | 'diagnose' | 'orchestrate' | 'investigate' | 'close';
type WorkspaceName =
  | 'coordination'
  | 'demand'
  | 'plan'
  | 'sales-plan'
  | 'digital'
  | 'intelligent'
  | 'delivery';

const HELP_CONTENT_REGISTRY_KEY = 'plan-help-content-registry:v1';

function taskScopeDisplay(scopeType: TaskScope, scope: string) {
  if (scopeType === '交叉分析') return `${scope}组合`;
  if (scopeType === '销售组织') return `${scope}销售组织`;
  return `${scope}${scopeType}`;
}

function metricStatisticType(metric: string): '累计指标' | '快照指标' {
  return metric === '库存量' || metric === '订单缺货量' ? '快照指标' : '累计指标';
}

function readHelpRegistry(): HelpContentRegistry {
  try {
    const parsed = JSON.parse(browserStorage.getItem(HELP_CONTENT_REGISTRY_KEY) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as HelpContentRegistry)
      : {};
  } catch {
    return {};
  }
}

function saveHelpRecord(helpId: string, record: HelpContentRecord) {
  const registry = readHelpRegistry();
  registry[helpId] = record;
  browserStorage.setItem(HELP_CONTENT_REGISTRY_KEY, JSON.stringify(registry));
}

function EditableHelp({
  storageKey,
  helpId = storageKey,
  label,
  defaultText,
  compact = false,
}: {
  storageKey: string;
  helpId?: string;
  label: string;
  defaultText: string;
  compact?: boolean;
}) {
  const isolatedStorageKey = `plan-help-content:${storageKey}`;
  const draftStorageKey = `plan-help-draft:${helpId}`;
  const [text, setText] = useState(defaultText);
  const [draft, setDraft] = useState(defaultText);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const registryRecord = readHelpRegistry()[helpId];
    const migratedText =
      registryRecord?.source === 'user' || registryRecord?.source === 'legacy'
        ? registryRecord.content
        : defaultText;
    const migratedSource: HelpContentRecord['source'] =
      registryRecord?.source === 'user' || registryRecord?.source === 'legacy'
        ? registryRecord.source
        : 'default';
    const savedDraft = browserStorage.getItem(draftStorageKey);
    setText(migratedText);
    setDraft(savedDraft || migratedText);
    saveHelpRecord(helpId, {
      content: migratedText,
      label,
      updatedAt: registryRecord?.updatedAt || new Date().toISOString(),
      source: migratedSource,
    });
    browserStorage.setItem(isolatedStorageKey, migratedText);
  }, [defaultText, draftStorageKey, helpId, isolatedStorageKey, label, storageKey]);
  useEffect(() => {
    const closeWhenAnotherOpens = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== storageKey) setOpen(false);
    };
    window.addEventListener('plan-help-open', closeWhenAnotherOpens);
    return () => window.removeEventListener('plan-help-open', closeWhenAnotherOpens);
  }, [storageKey]);
  const save = () => {
    const next = draft.trim() || defaultText;
    setText(next);
    setDraft(next);
    browserStorage.setItem(isolatedStorageKey, next);
    saveHelpRecord(helpId, {
      content: next,
      label,
      updatedAt: new Date().toISOString(),
      source: 'user',
    });
    browserStorage.removeItem(draftStorageKey);
    setOpen(false);
  };
  const toggle = () => {
    if (!open) {
      setDraft(browserStorage.getItem(draftStorageKey) ?? text);
      window.dispatchEvent(new CustomEvent('plan-help-open', { detail: storageKey }));
    }
    setOpen((value) => !value);
  };
  return (
    <>
      <div
        className={`editable-help ${compact ? 'compact' : ''}`}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <button className="module-help" aria-label={label} aria-expanded={open} onClick={toggle}>
          <CircleHelp />
        </button>
      </div>
      {open &&
        createPortal(
          <div
            className="help-editor floating-help-editor"
            role="dialog"
            aria-label={`${label}编辑器`}
          >
            <strong>{label.replace('查看并编辑', '')}</strong>
            <p>{'说明编辑属于当前页面预览，不会写入真实业务系统。'}</p>
            <textarea
              aria-label="编辑当前问号说明"
              value={draft}
              onChange={(event) => {
                const nextDraft = event.target.value;
                setDraft(nextDraft);
                browserStorage.setItem(draftStorageKey, nextDraft);
              }}
            />
            <footer>
              <button
                onClick={() => {
                  setDraft(text);
                  browserStorage.removeItem(draftStorageKey);
                  setOpen(false);
                }}
              >
                {'取消'}
              </button>
              <button className="primary" onClick={save}>
                {'保存修改'}
              </button>
            </footer>
          </div>,
          document.body,
        )}
    </>
  );
}

const _metricMeta: Array<{
  name: MetricName;
  unit: '%' | '天';
  target: number;
  targetText: string;
  lowerBetter: boolean;
}> = [
  { name: '订单满足率', unit: '%', target: 95, targetText: '目标 > 95%', lowerBetter: false },
  { name: '可发货天数', unit: '天', target: 12, targetText: '目标 < 12天', lowerBetter: true },
  { name: '作废率', unit: '%', target: 6, targetText: '目标 < 6%', lowerBetter: true },
  { name: '改单率', unit: '%', target: 2, targetText: '目标 < 2%', lowerBetter: true },
  { name: '准交率', unit: '%', target: 98.5, targetText: '目标 > 98.5%', lowerBetter: false },
];

const demoOverviewMetricMeta: Array<{
  name: OverviewMetricName;
  unit: MetricUnit;
  target: number | null;
  targetText: string;
  lowerBetter: boolean;
}> = [
  { name: '销售预算达成率', unit: '%', target: 95, targetText: '健康 > 95%', lowerBetter: false },
  { name: '销售提报准确率', unit: '%', target: 70, targetText: '健康 > 70%', lowerBetter: false },
  {
    name: '销售提报达成率',
    unit: '%',
    target: null,
    targetText: '按截止日动态',
    lowerBetter: false,
  },
  { name: '需求预测准确率', unit: '%', target: 80, targetText: '健康 > 80%', lowerBetter: false },
  {
    name: '需求预测达成率',
    unit: '%',
    target: null,
    targetText: '按截止日动态',
    lowerBetter: false,
  },
  { name: '生产计划达成率', unit: '%', target: 99, targetText: '健康 > 99%', lowerBetter: false },
  { name: '订单满足率', unit: '%', target: 95, targetText: '目标 > 95%', lowerBetter: false },
  { name: '订单缺货量', unit: '万件', target: 0, targetText: '目标 = 0万件', lowerBetter: true },
  { name: '可发货天数', unit: '天', target: 12, targetText: '目标 < 12天', lowerBetter: true },
  { name: '库存量', unit: '万件', target: null, targetText: '无目标', lowerBetter: false },
];

const productionMetricNames: ProductionDrillMetricName[] = [
  '需求预测准确率',
  '生产计划达成率',
  '库存量',
  '可发货天数',
  '订单缺货量',
  '订单满足率',
];

const productionMetricGranularities: Record<ProductionDrillMetricName, TimeGranularity[]> = {
  需求预测准确率: ['year', 'month'],
  生产计划达成率: ['year', 'month', 'week', 'day'],
  库存量: ['year', 'month', 'week', 'day'],
  可发货天数: ['year', 'month', 'week'],
  订单缺货量: ['year', 'month', 'week', 'day'],
  订单满足率: ['year', 'month', 'week', 'day'],
};

const productionMetricTabs: Array<{
  key: Exclude<CategoryMetricTab, 'overview'>;
  label: ProductionDrillMetricName;
}> = [
  { key: 'forecast', label: '需求预测准确率' },
  { key: 'plan', label: '生产计划达成率' },
  { key: 'inventory', label: '库存量' },
  { key: 'stock', label: '可发货天数' },
  { key: 'shortage', label: '订单缺货量' },
  { key: 'satisfaction', label: '订单满足率' },
];

const crossMetricByMode: Record<(typeof crossMatrixModes)[number], ProductionDrillMetricName> = {
  rate: '订单满足率',
  stock: '可发货天数',
  plan: '生产计划达成率',
  inventory: '库存量',
};

const overviewMetricGroups: Array<{
  label: OverviewMetricGroupLabel;
  names: OverviewMetricName[];
}> = [
  { label: '销售指标', names: ['销售预算达成率', '销售提报准确率', '销售提报达成率'] },
  { label: '计划指标', names: ['需求预测准确率', '需求预测达成率', '生产计划达成率'] },
  { label: '订单指标', names: ['订单满足率', '订单缺货量'] },
  { label: '库存指标', names: ['可发货天数', '库存量'] },
];

const _overviewMetricDisplayOrder: OverviewMetricName[] = [
  '销售预算达成率',
  '销售提报准确率',
  '销售提报达成率',
  '需求预测准确率',
  '需求预测达成率',
  '生产计划达成率',
  '库存量',
  '可发货天数',
  '订单缺货量',
  '订单满足率',
];

const overviewBusinessMetricNames: OverviewMetricName[] = [
  '销售预算达成率',
  '销售提报达成率',
  '需求预测达成率',
  '生产计划达成率',
  '库存量',
  '订单满足率',
];

function productionMetricClass(metric: OverviewMetricName): '经营指标' | '运营指标' {
  return overviewBusinessMetricNames.includes(metric) ? '经营指标' : '运营指标';
}

const metricHelp: Record<OverviewMetricName, string> = {
  销售预算达成率:
    '月度销售预算达成率 = 不含税销售额 ÷ 月度预算 × 100%；年度按已确认口径取月度达成率平均。健康 >95%，预警为 90%<x≤95%，严重 ≤90%。',
  销售提报准确率:
    '月度终值 = 初版准确率×50% + 月中纠偏准确率×50%；单阶段准确率 = 1 − Σ|单品偏差量| ÷ Σ单品计划量。年度取月度平均。健康 >70%，预警为 65%<x≤70%，严重 ≤65%。',
  销售提报达成率:
    '月度截止日实际发货量 ÷ 月度销售提报量 × 100%。健康线为（截止日−1）÷当月自然天数−3个百分点，预警线为−5个百分点。',
  需求预测准确率:
    '月度终值 = 初版准确率×50% + 月中纠偏准确率×50%；单阶段准确率 = 1 − Σ|单品偏差量| ÷ Σ单品计划量。年度取月度平均。健康 >80%，预警为 75%<x≤80%，严重 ≤75%。',
  需求预测达成率:
    '月度截止日实际发货量 ÷ 月底需求预测量 × 100%。健康线为（截止日−1）÷当月自然天数−3个百分点，预警线为−5个百分点。',
  生产计划达成率:
    '一定周期内实际生产产出量 ÷ 同期计划生产产出量 × 100%；跨周期先汇总数量再计算。健康 >99%，预警为 95%<x≤99%，严重 ≤95%。当前生产实绩源尚未接入。',
  订单满足率:
    '指标定义：计划可满足订单需求量占订单需求总量的比例。公式：可满足订单需求量 ÷ 订单需求总量 × 100%。目标值：> 95%。',
  订单缺货量:
    '指标定义：统计周期内因可用库存不足而无法满足订单的商品数量。常见公式：订单需求量 - 可满足订单量，最低为0。演示目标值：0万件，正式口径需按企业订单行与缺货认定规则确认。',
  可发货天数:
    '指标定义：当前可用库存按照计划日均需求可支撑的天数。公式：可用库存量 ÷ 计划日均需求量。目标值：< 12天。',
  库存量: '指标定义：统计时点全部可用库存的实物数量。单位：万件。该指标用于观察库存规模，不设置统一目标；正式使用时需确认是否包含冻结、质检、临期及在途库存。',
};

const metricHelpIdentity: Record<OverviewMetricName, { helpId: string; storageKey?: string }> = {
  销售预算达成率: { helpId: 'metric.sales-budget-achievement' },
  销售提报准确率: { helpId: 'metric.sales-plan-accuracy' },
  销售提报达成率: { helpId: 'metric.sales-plan-achievement' },
  需求预测准确率: { helpId: 'metric.demand-forecast-accuracy' },
  需求预测达成率: { helpId: 'metric.demand-forecast-achievement' },
  生产计划达成率: { helpId: 'metric.production-plan-achievement' },
  订单满足率: { helpId: 'metric.order-satisfaction-rate' },
  订单缺货量: { helpId: 'metric.order-shortage-quantity' },
  可发货天数: { helpId: 'metric.shippable-days' },
  库存量: { helpId: 'metric.inventory-quantity' },
};

const scopeHelp: Record<AnalysisScope, { storageKey: string; label: string; defaultText: string }> =
  {
    overview: {
      storageKey: 'plan-help-overall',
      label: '查看并编辑总览分析模块说明',
      defaultText:
        '针对全部核心指标进行数据解释，优先说明未达标指标，并补充目标差距、环比与同比变化，形成会议研判结论。',
    },
    production: {
      storageKey: 'plan-help-production',
      label: '查看并编辑生产视角分析说明',
      defaultText:
        '围绕计划、订单与库存指标分析生产履约风险，并通过品类、基地和交叉分析三个维度继续下钻。',
    },
    sales: {
      storageKey: 'plan-help-sales',
      label: '查看并编辑销售视角分析说明',
      defaultText: '围绕销售预算达成率和销售提报准确率，从各大区识别销售目标差距与提报质量问题。',
    },
  };

const annotationHelp = {
  period: {
    storageKey: 'plan-help-analysis-period',
    label: '查看并编辑统计周期说明',
    defaultText:
      '可按年度视角、月度视角、周度视角和日度视角切换分析周期。累计指标按所选周期累计至截止日期，快照指标展示截止日期的最新值，并同步展示上一周期、同期及变化数据。',
  },
  shortage: {
    storageKey: 'plan-help-shortage-risk-list',
    label: '查看并编辑产销协同风险清单说明',
    defaultText:
      '汇总交叉分析四类指标中各自风险最高的3项，按指标分组展示分析对象、指标现值、风险等级、目标差距和任务派发状态。',
  },
  stock: {
    storageKey: 'plan-help-stock-risk-list',
    label: '查看并编辑周转风险清单说明',
    defaultText:
      '展示可发货天数偏高或接近上限的基地与品类组合，默认按风险状态排序，用于标注库存积压原因和去化重点。',
  },
};

const matrixHelp: Record<MatrixMode, { storageKey: string; label: string; defaultText: string }> = {
  rate: {
    storageKey: 'plan-cross-ai-help-rate',
    label: '查看并编辑订单满足率矩阵研判说明',
    defaultText:
      '按基地与品类交叉分析订单满足率，优先解释严重和预警组合、跨基地共性问题及其对整体订单满足率的影响。',
  },
  stock: {
    storageKey: 'plan-cross-ai-help-stock',
    label: '查看并编辑可发货天数矩阵研判说明',
    defaultText:
      '按基地与品类交叉分析可发货天数，同时参考剔除大日期后的结果，识别结构性高库存及异常日期的影响。',
  },
  plan: {
    storageKey: 'plan-cross-ai-help-plan',
    label: '查看并编辑生产计划达成率矩阵研判说明',
    defaultText:
      '按基地与品类交叉分析生产计划达成率。当前基地×品类明细尚未接入，页面保留统一入口并明确展示数据缺口。',
  },
  inventory: {
    storageKey: 'plan-cross-ai-help-inventory',
    label: '查看并编辑库存量矩阵研判说明',
    defaultText:
      '按基地与品类交叉分析库存量。库存量属于无目标观察指标，当前基地×品类明细尚未接入，不自动判定达标状态。',
  },
  delivery: {
    storageKey: 'plan-cross-ai-help-delivery',
    label: '查看并编辑准交率矩阵研判说明',
    defaultText:
      '按基地与品类交叉分析准交率，定位未达标组合并解释开单、派车、装车及交付节拍等主要影响因素。',
  },
  change: {
    storageKey: 'plan-cross-ai-help-change',
    label: '查看并编辑改单率矩阵研判说明',
    defaultText:
      '按基地与品类交叉分析改单率，定位高于目标的组合，并解释需求变更、计划调整及订单维护造成的异常。',
  },
  void: {
    storageKey: 'plan-cross-ai-help-void',
    label: '查看并编辑作废率矩阵研判说明',
    defaultText:
      '按基地与品类交叉分析作废率，定位高于目标的组合，并结合环比、同比及订单原因解释风险来源。',
  },
};

const _month830: MetricSnapshot = {
  作废率: 4.71,
  改单率: 2.8,
  订单满足率: 92.07,
  准交率: 93.05,
  可发货天数: 10.23,
};
const _month823: MetricSnapshot = {
  作废率: 3.46,
  改单率: 2.37,
  订单满足率: 92.71,
  准交率: 94.37,
  可发货天数: 10.85,
};
const _week823: MetricSnapshot = {
  作废率: 0.71,
  改单率: 1.51,
  订单满足率: 91.2,
  准交率: 93.28,
  可发货天数: 10.85,
};
const _week816: MetricSnapshot = {
  作废率: 4.7,
  改单率: 3.23,
  订单满足率: 92.95,
  准交率: 94.52,
  可发货天数: 11.5,
};

type ComparisonDatum = {
  current: number;
  previous: number;
  change: number;
  same: number | null;
  yoy: number | null;
};
const monthlyComparison: Record<OverviewMetricName, ComparisonDatum> = {
  销售预算达成率: { current: 61.0, previous: 58.5, change: 2.5, same: 63.7, yoy: -2.7 },
  销售提报准确率: { current: 95.6, previous: 94.2, change: 1.4, same: 96.1, yoy: -0.5 },
  销售提报达成率: { current: 86.2, previous: 84.7, change: 1.5, same: 88.1, yoy: -1.9 },
  需求预测准确率: { current: 95.5, previous: 94.8, change: 0.7, same: 95.9, yoy: -0.4 },
  需求预测达成率: { current: 87.1, previous: 85.2, change: 1.9, same: 89.3, yoy: -2.2 },
  生产计划达成率: { current: 61.7, previous: 65.3, change: -3.6, same: 68.4, yoy: -6.7 },
  订单满足率: { current: 92.1, previous: 95.2, change: -3.1, same: 96.0, yoy: -4.0 },
  订单缺货量: { current: 3.8, previous: 2.9, change: 0.9, same: 2.6, yoy: 1.2 },
  可发货天数: { current: 10.2, previous: 11.0, change: -0.7, same: 13.6, yoy: -3.3 },
  库存量: { current: 86.4, previous: 90.2, change: -3.8, same: 94.6, yoy: -8.2 },
};
const weeklyComparison: Record<OverviewMetricName, ComparisonDatum> = {
  销售预算达成率: { current: 62.4, previous: 60.8, change: 1.6, same: 64.1, yoy: -1.7 },
  销售提报准确率: { current: 96.2, previous: 95.4, change: 0.8, same: 96.8, yoy: -0.6 },
  销售提报达成率: { current: 62.4, previous: 60.1, change: 2.3, same: 64.2, yoy: -1.8 },
  需求预测准确率: { current: 96.0, previous: 95.1, change: 0.9, same: 96.2, yoy: -0.2 },
  需求预测达成率: { current: 63.1, previous: 61.4, change: 1.7, same: 65.0, yoy: -1.9 },
  生产计划达成率: { current: 64.8, previous: 63.0, change: 1.8, same: 67.5, yoy: -2.7 },
  订单满足率: { current: 90.7, previous: 90.8, change: -0.2, same: 95.8, yoy: -5.1 },
  订单缺货量: { current: 1.1, previous: 0.8, change: 0.3, same: 0.7, yoy: 0.4 },
  可发货天数: { current: 10.2, previous: 11.5, change: -1.3, same: null, yoy: null },
  库存量: { current: 84.9, previous: 86.4, change: -1.5, same: 92.1, yoy: -7.2 },
};
const yearlyComparison: Record<OverviewMetricName, ComparisonDatum> = {
  销售预算达成率: { current: 66.8, previous: 69.5, change: -2.7, same: 71.2, yoy: -4.4 },
  销售提报准确率: { current: 94.9, previous: 95.7, change: -0.8, same: 96.3, yoy: -1.4 },
  销售提报达成率: { current: 88.0, previous: 89.1, change: -1.1, same: 90.0, yoy: -2.0 },
  需求预测准确率: { current: 94.2, previous: 95.1, change: -0.9, same: 95.6, yoy: -1.4 },
  需求预测达成率: { current: 89.2, previous: 90.0, change: -0.8, same: 91.1, yoy: -1.9 },
  生产计划达成率: { current: 63.8, previous: 67.2, change: -3.4, same: 69.1, yoy: -5.3 },
  订单满足率: { current: 93.3, previous: 95.4, change: -2.1, same: 96.1, yoy: -2.8 },
  订单缺货量: { current: 28.6, previous: 21.4, change: 7.2, same: 19.8, yoy: 8.8 },
  可发货天数: { current: 10.6, previous: 12.1, change: -1.5, same: 13.2, yoy: -2.6 },
  库存量: { current: 87.2, previous: 93.8, change: -6.6, same: 96.4, yoy: -9.2 },
};
const dailyComparison: Record<OverviewMetricName, ComparisonDatum> = {
  销售预算达成率: { current: 59.8, previous: 62.3, change: -2.5, same: 64.0, yoy: -4.2 },
  销售提报准确率: { current: 93.7, previous: 95.1, change: -1.4, same: 95.8, yoy: -2.1 },
  销售提报达成率: { current: 3.1, previous: 3.0, change: 0.1, same: 3.2, yoy: -0.1 },
  需求预测准确率: { current: 92.5, previous: 94.3, change: -1.8, same: 95.1, yoy: -2.6 },
  需求预测达成率: { current: 3.2, previous: 3.1, change: 0.1, same: 3.3, yoy: -0.1 },
  生产计划达成率: { current: 60.2, previous: 63.6, change: -3.4, same: 66.8, yoy: -6.6 },
  订单满足率: { current: 89.4, previous: 91.6, change: -2.2, same: 95.2, yoy: -5.8 },
  订单缺货量: { current: 0.32, previous: 0.24, change: 0.08, same: 0.18, yoy: 0.14 },
  可发货天数: { current: 10.2, previous: 10.4, change: -0.2, same: 12.9, yoy: -2.7 },
  库存量: { current: 86.4, previous: 87.1, change: -0.7, same: 93.2, yoy: -6.8 },
};

type YearOption = { key: string; label: string };
type MonthOption = { key: string; value: number; label: string };
type WeekOption = { key: string; label: string; range: string; startDay: number; endDay: number };
const yearOptions: YearOption[] = [
  { key: '2025', label: '2025年' },
  { key: '2026', label: '2026年' },
];
const monthOptions: MonthOption[] = Array.from({ length: 12 }, (_, index) => ({
  key: String(index + 1).padStart(2, '0'),
  value: index + 1,
  label: `${index + 1}月`,
}));
const formatMonthDay = (date: Date) =>
  `${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
const getIsoWeek = (date: Date) => {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNumber = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
};
const buildNaturalWeeks = (year: number, month: number): WeekOption[] => {
  const lastDay = new Date(year, month, 0).getDate();
  const weeks: WeekOption[] = [];
  let startDay = 1;
  while (startDay <= lastDay) {
    const start = new Date(year, month - 1, startDay);
    const daysUntilSunday = 7 - (start.getDay() || 7);
    const endDay = Math.min(lastDay, startDay + daysUntilSunday);
    const end = new Date(year, month - 1, endDay);
    const weekNumber = getIsoWeek(start);
    weeks.push({
      key: `${year}-W${String(weekNumber).padStart(2, '0')}`,
      label: `W${weekNumber}`,
      range: `${formatMonthDay(start)}–${formatMonthDay(end)}`,
      startDay,
      endDay,
    });
    startDay = endDay + 1;
  }
  return weeks;
};

const base830 = [
  { name: '华东', 作废率: 1.64, 改单率: 3.94, 订单满足率: 91.95, 准交率: 100, 可发货天数: 8.25 },
  { name: '华南', 作废率: 4.68, 改单率: 4.27, 订单满足率: 94.07, 准交率: 99.77, 可发货天数: 8.24 },
  { name: '西南', 作废率: 8.48, 改单率: 3.68, 订单满足率: 90.94, 准交率: 97.94, 可发货天数: 7.32 },
  { name: '遂平', 作废率: 4.28, 改单率: 3.88, 订单满足率: 92.31, 准交率: 99.16, 可发货天数: 8.52 },
  { name: '郑州', 作废率: 3.85, 改单率: 1.42, 订单满足率: 91.88, 准交率: 83.28, 可发货天数: 9.69 },
];
const _base823 = [
  { name: '华东', 作废率: 2.02, 改单率: 2.46, 订单满足率: 90.69, 准交率: 100, 可发货天数: 8.32 },
  { name: '华南', 作废率: 3.62, 改单率: 4.09, 订单满足率: 93.6, 准交率: 99.85, 可发货天数: 8.15 },
  { name: '西南', 作废率: 5.21, 改单率: 2.84, 订单满足率: 92.65, 准交率: 99.2, 可发货天数: 8.24 },
  { name: '遂平', 作废率: 3.21, 改单率: 3.44, 订单满足率: 92.69, 准交率: 99.8, 可发货天数: 9.67 },
  { name: '郑州', 作废率: 3.06, 改单率: 1.2, 订单满足率: 92.7, 准交率: 85.48, 可发货天数: 10.64 },
];
const baseComparison823 = [
  {
    name: '华东',
    voidRate: 2.02,
    voidDelta: -1.24,
    changeRate: 2.46,
    changeDelta: 0.86,
    fillRate: 90.69,
    fillDelta: -6.23,
    deliveryRate: 100,
    deliveryDelta: 1.75,
    stockDays: 8.32,
    stockDelta: -3.3,
  },
  {
    name: '华南',
    voidRate: 3.62,
    voidDelta: -2.12,
    changeRate: 4.09,
    changeDelta: 1.9,
    fillRate: 93.6,
    fillDelta: -3.23,
    deliveryRate: 99.85,
    deliveryDelta: 0.68,
    stockDays: 8.15,
    stockDelta: -1.17,
  },
  {
    name: '西南',
    voidRate: 5.21,
    voidDelta: -10.9,
    changeRate: 2.84,
    changeDelta: -1.23,
    fillRate: 92.65,
    fillDelta: -0.63,
    deliveryRate: 99.2,
    deliveryDelta: 2.86,
    stockDays: 8.24,
    stockDelta: -0.88,
  },
  {
    name: '遂平',
    voidRate: 3.21,
    voidDelta: 0.51,
    changeRate: 3.44,
    changeDelta: 0.91,
    fillRate: 92.69,
    fillDelta: -5.43,
    deliveryRate: 99.8,
    deliveryDelta: 1.2,
    stockDays: 9.67,
    stockDelta: -2.62,
  },
  {
    name: '郑州',
    voidRate: 3.06,
    voidDelta: -1.28,
    changeRate: 1.2,
    changeDelta: 0.05,
    fillRate: 92.7,
    fillDelta: -2.31,
    deliveryRate: 85.48,
    deliveryDelta: -9.3,
    stockDays: 10.64,
    stockDelta: -1.69,
  },
  {
    name: '合计',
    voidRate: 3.46,
    voidDelta: -2.39,
    changeRate: 2.37,
    changeDelta: 0.32,
    fillRate: 92.71,
    fillDelta: -3.18,
    deliveryRate: 94.37,
    deliveryDelta: -2.41,
    stockDays: 10.85,
    stockDelta: 0.77,
  },
];

const _categoryComparisons: Partial<
  Record<MetricName, Array<{ name: string; current: number | null; previous: number | null }>>
> = {
  订单满足率: [
    { name: '水饺', current: 85.87, previous: 86.68 },
    { name: '预制食材', current: 86.93, previous: 88.45 },
    { name: '火锅料', current: 93.63, previous: 94.13 },
    { name: '面点', current: 94.45, previous: 95.07 },
    { name: '休闲', current: 94.75, previous: 94.98 },
    { name: '汤圆', current: null, previous: 96.42 },
    { name: '馄饨', current: null, previous: 98.51 },
  ],
  可发货天数: [
    { name: '火锅料', current: 16.9, previous: 20.05 },
    { name: '休闲', current: null, previous: 11.81 },
    { name: '面点', current: null, previous: 11.23 },
    { name: '馄饨', current: null, previous: 11.0 },
    { name: '汤圆', current: null, previous: 10.37 },
    { name: '预制食材', current: null, previous: 9.52 },
    { name: '水饺', current: null, previous: 7.99 },
  ],
};

const categorySatisfaction830 = [
  {
    name: '休闲',
    current: 94.75,
    previous: 97.53,
    mom: -2.78,
    same: 96.52,
    yoy: -1.78,
    week: 94.61,
    weekYoy: -1.3,
  },
  {
    name: '水饺',
    current: 85.87,
    previous: 92.48,
    mom: -6.61,
    same: 96.51,
    yoy: -10.64,
    week: 84.19,
    weekYoy: -12.44,
  },
  {
    name: '汤圆',
    current: 96.33,
    previous: 95.23,
    mom: 1.11,
    same: 96.56,
    yoy: -0.22,
    week: 96.15,
    weekYoy: -0.28,
  },
  {
    name: '火锅料',
    current: 93.63,
    previous: 94.14,
    mom: -0.51,
    same: 93.79,
    yoy: -0.16,
    week: 92.08,
    weekYoy: -2.53,
  },
  {
    name: '粽子',
    current: 100,
    previous: 99.48,
    mom: 0.52,
    same: 91.08,
    yoy: 8.92,
    week: null,
    weekYoy: null,
  },
  {
    name: '面点',
    current: 94.45,
    previous: 96.27,
    mom: -1.83,
    same: 95.97,
    yoy: -1.52,
    week: 95.08,
    weekYoy: -0.46,
  },
  {
    name: '预制食材',
    current: 86.93,
    previous: 92.69,
    mom: -5.76,
    same: 91.33,
    yoy: -4.4,
    week: 82.66,
    weekYoy: -7.63,
  },
  {
    name: '馄饨',
    current: 98.0,
    previous: 98.26,
    mom: -0.26,
    same: 97.21,
    yoy: 0.78,
    week: 96.56,
    weekYoy: 0.32,
  },
];
const categoryStock830 = [
  { name: '汤圆', current: 10.4, previous: 10.4, mom: -2.4, same: 12.4, yoy: -2.0 },
  { name: '水饺', current: 7.1, previous: 8.0, mom: -0.1, same: 10.8, yoy: -3.7 },
  { name: '面点', current: 10.7, previous: 11.2, mom: 0, same: 13.9, yoy: -3.2 },
  { name: '休闲', current: 11.3, previous: 11.8, mom: -0.7, same: 18.8, yoy: -7.5 },
  { name: '馄饨', current: 11.3, previous: 11.0, mom: -0.8, same: 10.9, yoy: 0.4 },
  { name: '预制食材', current: 10.3, previous: 9.5, mom: 0.4, same: 15.6, yoy: -5.4 },
  { name: '火锅料', current: 16.9, previous: 20.0, mom: -1.2, same: 15.0, yoy: 1.9 },
  { name: '粽子', current: null, previous: null, mom: 0, same: null, yoy: 0 },
];
const categoryStockDetail823 = [
  {
    name: '火锅料',
    adjusted: 19.77,
    currentMonth: 20.05,
    previousMonth: 14.23,
    monthDelta: 5.82,
    same: 13.08,
    yoyDelta: 6.97,
    currentWeek: 20.05,
    weekDelta: -0.62,
  },
  {
    name: '休闲',
    adjusted: 11.67,
    currentMonth: 11.81,
    previousMonth: 11.94,
    monthDelta: -0.13,
    same: 18.63,
    yoyDelta: -6.82,
    currentWeek: 11.81,
    weekDelta: -2.19,
  },
  ...categoryStock830
    .filter((item) => !['火锅料', '休闲'].includes(item.name))
    .map((item) => ({
      name: item.name,
      adjusted: null,
      currentMonth: item.current,
      previousMonth: item.previous,
      monthDelta:
        item.current === null || item.previous === null ? null : item.current - item.previous,
      same: item.same,
      yoyDelta: item.current === null || item.same === null ? null : item.current - item.same,
      currentWeek: item.current,
      weekDelta: item.mom,
    })),
];

function stableMetricSeed(value: string) {
  return Array.from(value).reduce(
    (seed, character) => (seed * 31 + character.charCodeAt(0)) >>> 0,
    2166136261,
  );
}

function demoSalesOrgMetrics(path: string) {
  const seed = stableMetricSeed(path);
  const budget = 55 + ((seed >>> 2) % 5000) / 100;
  const reporting = 88 + ((seed >>> 7) % 1200) / 100;
  const sales = 180 + ((seed >>> 12) % 1680);
  const budgetPrevious = Math.max(0, budget + (((seed >>> 17) % 900) - 450) / 100);
  const reportingPrevious = Math.max(
    0,
    Math.min(100, reporting + (((seed >>> 21) % 500) - 250) / 100),
  );
  return { budget, reporting, sales, budgetPrevious, reportingPrevious };
}

function demoCategoryDrillMetrics(
  category: string,
  item?: string,
  material?: string,
): ProductionDrillValues {
  const path = [category, item, material].filter(Boolean).join(' / ');
  const seed = stableMetricSeed(path);
  const depthAdjustment = material ? -1.8 : item ? -0.8 : 0;
  const knownSatisfaction = categorySatisfaction830.find((row) => row.name === category)?.current;
  const knownStock = categoryStock830.find((row) => row.name === category)?.current;
  const vary = (offset: number, range: number) => (((seed >>> offset) % 1000) / 1000) * range;
  const detailScale = material ? 1 : item ? 0.65 : 0;
  return {
    需求预测准确率: Math.min(100, 90.2 + vary(1, 8.8) + depthAdjustment),
    生产计划达成率: Math.min(100, 58 + vary(3, 34) + depthAdjustment * 1.5),
    库存量: Math.max(0.1, 2.4 + vary(5, 16.8) + (material ? -0.8 : item ? -0.3 : 0)),
    可发货天数: Math.max(0.1, (knownStock ?? 8.5 + vary(7, 5.5)) + (vary(13, 4) - 2) * detailScale),
    订单缺货量: Math.max(0, 0.1 + vary(9, 4.8) + (material ? 0.2 : 0)),
    订单满足率: Math.min(
      100,
      Math.max(70, (knownSatisfaction ?? 87 + vary(11, 12)) + (vary(15, 6) - 3) * detailScale),
    ),
  };
}

function demoBaseDrillMetrics(
  base: string,
  category?: string,
  item?: string,
  material?: string,
): ProductionDrillValues {
  const seed = stableMetricSeed([base, category, item, material].filter(Boolean).join(' / '));
  const vary = (offset: number, range: number) => (((seed >>> offset) % 1000) / 1000) * range;
  const baseSnapshot = base830.find((row) => row.name === base);
  const categoryIndex = category ? categories.indexOf(category) : -1;
  const categorySatisfaction =
    categoryIndex >= 0
      ? satisfaction.find((row) => row.base === base)?.values[categoryIndex]
      : undefined;
  const categoryStock =
    categoryIndex >= 0
      ? inventory.find((row) => row.base === base)?.values[categoryIndex]
      : undefined;
  const detailScale = material ? 1 : item ? 0.65 : category ? 0.35 : 0;
  const detailOffset = (vary(13, 6) - 3) * detailScale;
  return {
    需求预测准确率: Math.min(100, Math.max(70, 90.5 + vary(1, 8.2) + detailOffset)),
    生产计划达成率: Math.min(100, Math.max(45, 60 + vary(3, 32) + detailOffset * 1.3)),
    库存量: Math.max(0.1, 18 + vary(5, 48) + detailOffset * 1.8),
    可发货天数: Math.max(
      0.1,
      (categoryStock ?? baseSnapshot?.可发货天数 ?? 8.5 + vary(7, 5.5)) + detailOffset,
    ),
    订单缺货量: Math.max(0, 0.2 + vary(9, 8.8) + detailOffset * 0.18),
    订单满足率: Math.min(
      100,
      Math.max(
        65,
        (categorySatisfaction ?? baseSnapshot?.订单满足率 ?? 87 + vary(11, 12)) + detailOffset,
      ),
    ),
  };
}

function demoBaseCategoryProductItems(categoryName: string): BaseProductItem[] {
  const directCategory = baseProductHierarchy.find((category) => category.name === categoryName);
  if (directCategory?.items.length) return directCategory.items;
  const matchedItems = baseProductHierarchy.flatMap((category) =>
    category.items
      .filter((item) => item.name === categoryName)
      .map((item) => ({ name: `${category.name}系列`, materials: item.materials })),
  );
  if (matchedItems.length) return matchedItems;
  return [
    {
      name: `${categoryName}核心品项`,
      materials: [`${categoryName}物料组01`, `${categoryName}物料组02`],
    },
  ];
}

function productionMetricDisplay(name: ProductionDrillMetricName, value: number) {
  if (!Number.isFinite(value)) return '—';
  if (name === '库存量' || name === '订单缺货量') return `${formatNumber(value, 2)}万件`;
  if (name === '可发货天数') return `${formatNumber(value, 1)}天`;
  return `${formatNumber(value, 2)}%`;
}

function productionMetricState(name: ProductionDrillMetricName, value: number) {
  if (!Number.isFinite(value)) return 'neutral';
  if (name === '库存量') return 'neutral';
  if (name === '可发货天数') return value <= 12 ? 'good' : 'bad';
  if (name === '订单缺货量') return value <= 0 ? 'good' : 'bad';
  if (name === '订单满足率') return value >= 95 ? 'good' : 'bad';
  return value >= 100 ? 'good' : 'bad';
}

const categories = ['休闲', '水饺', '汤圆', '火锅料', '面点', '预制食材', '馄饨'];
const satisfaction = [
  { base: '华东', values: [78.41, 91.81, 96.47, 96.39, 97.79, 65.55, 88.9] },
  { base: '华南', values: [97.42, 92.27, 91.38, 86.25, 94.51, 86.35, 96.88] },
  { base: '西南', values: [95.78, 88.29, 96.74, 82.8, 92.33, 79.79, 94.28] },
  { base: '遂平', values: [96.42, 88.3, 96.74, 94.76, 93.19, 94.98, 99.64] },
  { base: '郑州', values: [93.96, 87.26, 97.79, 97.48, 95.14, 92.71, 98.98] },
];
const inventory = [
  { base: '郑州', values: [10.3, 7.1, 15, 20.1, 8.6, 8.1, 8] },
  { base: '华东', values: [6.2, 4.4, 8.9, 9.9, 15.5, 5.6, 7.8] },
  { base: '西南', values: [7.3, 9.1, 8.3, 10, 6.5, 5.5, 4.1] },
  { base: '华南', values: [7.3, 7.7, 6.1, 10, 10.6, 7.2, 12.2] },
  { base: '遂平', values: [11.1, 8.2, 11.1, 7.9, 13.1, 7.3, 9.3] },
];
const inventoryAdjusted = [
  { base: '郑州', values: [10.3, 6.9, 8.0, 19.9, 8.2, 7.9, 7.9] },
  { base: '华东', values: [6.1, 4.4, 8.6, 9.8, 13.8, 5.6, 7.8] },
  { base: '西南', values: [7.2, 9.1, 8.2, 9.7, 6.4, 5.0, 4.1] },
  { base: '华南', values: [7.2, 7.7, 5.6, 9.8, 10.1, 6.7, 12.2] },
  { base: '遂平', values: [10.9, 8.1, 8.8, 7.8, 12.9, 7.3, 9.3] },
];

function demoAdjustedStockValue(base: string, index: number) {
  return inventoryAdjusted.find((row) => row.base === base)?.values[index] ?? 0;
}

const _bases = [
  {
    name: '华东',
    void: 2.02,
    change: 2.46,
    fill: 90.69,
    delivery: 100,
    stock: 8.32,
    diagnosis: '订单满足率环比 -6.23pp，预制食材与休闲缺货突出',
  },
  {
    name: '华南',
    void: 3.62,
    change: 4.09,
    fill: 93.6,
    delivery: 99.85,
    stock: 8.15,
    diagnosis: '改单率 4.09%，火锅料供应缺口需关注',
  },
  {
    name: '西南',
    void: 5.21,
    change: 2.84,
    fill: 92.65,
    delivery: 99.2,
    stock: 8.24,
    diagnosis: '水饺新配方产能下降 30%',
  },
  {
    name: '遂平',
    void: 3.21,
    change: 3.44,
    fill: 92.69,
    delivery: 99.8,
    stock: 9.67,
    diagnosis: '水饺人员不足与质量问题叠加',
  },
  {
    name: '郑州',
    void: 3.06,
    change: 1.2,
    fill: 92.7,
    delivery: 85.48,
    stock: 10.64,
    diagnosis: '准交率 85.48%，装车与派车为关键瓶颈',
  },
];

const cadence = [
  { day: '24', title: '销售政策更新', owner: '计划管理部', done: true },
  { day: '25', title: '需求计划评估', owner: '平台计划 / 基地计划', done: true },
  { day: '27', title: '区域基地评审', owner: '计划管理部', done: false },
  { day: '28', title: '郑遂评审与调拨计划', owner: '计划管理部', done: false },
  { day: '29', title: '保供方案评估', owner: '计划 / 运营', done: false },
  { day: '30', title: '产销协同会前会', owner: '计划 / 企管', done: false },
];

const suggestedQuestions = [
  '生成本周产销协同会议摘要',
  '哪些基地订单满足率未达目标？',
  '水饺缺货的根因和措施？',
  '哪些库存组合超过12天？',
  '郑州准交率如何改善？',
  '列出本周到期任务',
];

function answerQuestion(question: string) {
  if (question.includes('基地') && question.includes('满足率'))
    return '本月五大基地订单满足率均未达到 95% 目标。华东最低，为 90.69%，环比下降 6.23pp；其后依次是西南 92.65%、遂平 92.69%、郑州 92.70%、华南 93.60%。建议优先处理华东预制食材和休闲品类缺货。';
  if (question.includes('水饺'))
    return '水饺月度订单满足率 86.68%，缺货 22.84 万件。主要根因是冷鲜肉质量问题导致封存降速、遂平三条线双班人员不足，以及西南新配方使产能下降 30%。当前动作包括郑州日产提升至 2.8 万件、遂平提升至 2.4 万件、华南支援 3.6 万件，并逐步恢复单线 40—45T 产能。';
  if (question.includes('库存') || question.includes('12天'))
    return '当前超过 12 天的组合共 5 个：郑州×火锅料 20.1 天、华东×面点 15.5 天、郑州×汤圆 15.0 天、遂平×面点 13.1 天、华南×馄饨 12.2 天。其中郑州×火锅料风险最高，需加快政策品拉货并调整后续下单节奏。';
  if (question.includes('郑州') || question.includes('准交率'))
    return '郑州准交率为 85.48%，超时主要集中在开单、派车和装车。建议按交期顺序占货开单，禁止负时间派车并区分常规/紧急订单，同时将 DC 订单外移分流、提前启用外租库；8 月目标 90%，9 月目标 93%。';
  if (question.includes('到期') || question.includes('任务'))
    return '本周优先闭环 4 项：① 8月26日前恢复郑州/遂平水饺产能；② 8月27日前完成华东预制食材与休闲补缺；③ 8月28日前确认西南代工与调拨方案；④ 8月29日前完成火锅料库存消化节奏复盘。';
  return '本周 13 项核心指标中，12 项设有目标，其中 3 项达标：作废率、可发货天数和产品新鲜度；大日期数量为无目标数量观察项。销售预算达成率、销售提报准确率、销售预测达成率、需求预测准确率、需求预测达成率、生产计划达成率及其余订单指标仍需改善。首要矛盾是水饺和预制食材缺货、郑州准交率偏低，以及火锅料库存偏高。';
}

function matrixClass(value: number, mode: 'rate' | 'stock') {
  if (mode === 'rate')
    return value < 90 ? 'heat-critical' : value <= 95 ? 'heat-watch' : 'heat-good';
  return value > 15 ? 'heat-critical' : value >= 12 || value <= 8 ? 'heat-watch' : 'heat-good';
}

const matrixListMeta: Record<
  MatrixMode,
  { label: string; target: string; unit: '%' | '天' | '万件' }
> = {
  rate: { label: '订单满足率', target: '> 95%', unit: '%' },
  stock: { label: '可发货天数', target: '< 12天', unit: '天' },
  plan: { label: '生产计划达成率', target: '≥ 100%', unit: '%' },
  inventory: { label: '库存量', target: '无目标', unit: '万件' },
  delivery: { label: '准交率', target: '> 98.5%', unit: '%' },
  change: { label: '改单率', target: '< 2%', unit: '%' },
  void: { label: '作废率', target: '< 6%', unit: '%' },
};

const matrixThresholdText: Record<MatrixMode, string> = {
  rate: '健康 >95% · 预警 90%–95% · 严重 <90%',
  stock: '健康 8–12天(不含边界) · 预警 ≤8天或12–15天 · 严重 >15天',
  plan: '健康 >99% · 预警 >95%–99% · 严重 ≤95%',
  inventory: '无目标观察指标 · 不自动判定达标状态',
  delivery: '健康 >98.5% · 预警 94%–98.5% · 严重 <94%',
  change: '健康 <2% · 预警 2%–5% · 严重 >5%',
  void: '健康 <6% · 预警 6%–10% · 严重 >10%',
};

function matrixRiskLevel(mode: MatrixMode, value: number): MatrixRiskLevel {
  if (mode === 'rate') return value < 90 ? '严重' : value <= 95 ? '预警' : '健康';
  if (mode === 'stock') return value > 15 ? '严重' : value >= 12 || value <= 8 ? '预警' : '健康';
  if (mode === 'plan') return value <= 95 ? '严重' : value <= 99 ? '预警' : '健康';
  if (mode === 'inventory') return '健康';
  if (mode === 'delivery') return value < 94 ? '严重' : value <= 98.5 ? '预警' : '健康';
  if (mode === 'change') return value > 5 ? '严重' : value >= 2 ? '预警' : '健康';
  return value > 10 ? '严重' : value >= 6 ? '预警' : '健康';
}

function worstRiskLevel(levels: MatrixRiskLevel[]): MatrixRiskLevel {
  if (levels.includes('严重')) return '严重';
  if (levels.includes('预警')) return '预警';
  return '健康';
}

function buildMatrixRiskRows(mode: MatrixMode): MatrixRiskRow[] {
  if (mode === 'rate')
    return satisfaction
      .flatMap((row) =>
        row.values.map((value, index) => ({
          scope: `${row.base} × ${categories[index]}`,
          value,
          gap: value - 95,
          level: matrixRiskLevel(mode, value),
          granularity: '基地 × 品类' as const,
        })),
      )
      .sort((a, b) => a.gap - b.gap);
  if (mode === 'stock')
    return inventory
      .flatMap((row) =>
        row.values.map((value, index) => ({
          scope: `${row.base} × ${categories[index]}`,
          value,
          adjusted: demoAdjustedStockValue(row.base, index),
          gap: value - 12,
          level: matrixRiskLevel(mode, value),
          granularity: '基地 × 品类' as const,
        })),
      )
      .sort((a, b) => b.gap - a.gap);
  if (mode === 'plan' || mode === 'inventory') return [];
  const metricByMode: Record<
    Exclude<MatrixMode, 'rate' | 'stock' | 'plan' | 'inventory'>,
    MetricName
  > = { delivery: '准交率', change: '改单率', void: '作废率' };
  const targetByMode = { delivery: 98.5, change: 2, void: 6 } as const;
  const metric = metricByMode[mode];
  const target = targetByMode[mode];
  const lowerBetter = mode !== 'delivery';
  return base830
    .map((row) => {
      const value = row[metric];
      const gap = lowerBetter ? value - target : value - target;
      return {
        scope: row.name,
        value,
        gap,
        level: matrixRiskLevel(mode, value),
        granularity: '基地汇总' as const,
      };
    })
    .sort((a, b) => (lowerBetter ? b.gap - a.gap : a.gap - b.gap));
}

type AutoDispatchCandidate = { scopeType: TaskScope; scope: string; metric: string };

function severeProductionMetric(values: ProductionDrillValues): ProductionDrillMetricName | null {
  return (
    productionMetricNames.find((name) => {
      const value = values[name];
      if (name === '可发货天数') return matrixRiskLevel('stock', value) === '严重';
      if (name === '订单满足率') return matrixRiskLevel('rate', value) === '严重';
      if (name === '订单缺货量') return value > 3;
      if (name === '库存量') return false;
      return matrixRiskLevel('plan', value) === '严重';
    }) || null
  );
}

function buildAutoDispatchCandidates(): AutoDispatchCandidate[] {
  const candidates: AutoDispatchCandidate[] = [];
  categorySatisfaction830.forEach((item) => {
    if (matrixRiskLevel('rate', item.current) === '严重')
      candidates.push({ scopeType: '品类', scope: item.name, metric: '订单满足率' });
  });
  categoryStockDetail823.forEach((item) => {
    const values = [item.adjusted, item.currentMonth].filter(
      (value): value is number => value !== null,
    );
    if (values.some((value) => matrixRiskLevel('stock', value) === '严重'))
      candidates.push({ scopeType: '品类', scope: item.name, metric: '可发货天数' });
  });
  baseComparison823.forEach((row) => {
    const metrics: Array<{ metric: MetricName; mode: MatrixMode; value: number }> = [
      { metric: '订单满足率', mode: 'rate', value: row.fillRate },
      { metric: '可发货天数', mode: 'stock', value: row.stockDays },
      { metric: '作废率', mode: 'void', value: row.voidRate },
      { metric: '改单率', mode: 'change', value: row.changeRate },
      { metric: '准交率', mode: 'delivery', value: row.deliveryRate },
    ];
    metrics
      .filter((item) => matrixRiskLevel(item.mode, item.value) === '严重')
      .forEach((item) =>
        candidates.push({ scopeType: '基地', scope: row.name, metric: item.metric }),
      );
  });
  crossMatrixModes.forEach((mode) => {
    buildMatrixRiskRows(mode)
      .filter((row) => row.level === '严重')
      .forEach((row) =>
        candidates.push({
          scopeType: '交叉分析',
          scope: row.scope,
          metric: matrixListMeta[mode].label,
        }),
      );
  });
  baseProductHierarchy.forEach((category) => {
    const metric = severeProductionMetric(demoCategoryDrillMetrics(category.name));
    if (metric) candidates.push({ scopeType: '品类', scope: category.name, metric });
  });
  base830.forEach((base) => {
    const metric = severeProductionMetric(demoBaseDrillMetrics(base.name));
    if (metric) candidates.push({ scopeType: '基地', scope: base.name, metric });
  });
  salesOrgHierarchy.forEach((region) => {
    const paths = [
      region.name,
      ...(region.children || []).flatMap((node) =>
        node.children?.length
          ? [
              `${region.name} / ${node.name}`,
              ...node.children.map((team) => `${region.name} / ${node.name} / ${team.name}`),
            ]
          : [`${region.name} / ${node.name}`],
      ),
    ];
    const severeMetrics = paths
      .flatMap((path) => {
        const values = demoSalesOrgMetrics(path);
        return [
          { metric: '销售预算达成率', value: values.budget, severe: 80 },
          { metric: '销售提报准确率', value: values.reporting, severe: 90 },
        ].filter((item) => item.value < item.severe);
      })
      .sort((a, b) => a.value - b.value);
    if (severeMetrics[0])
      candidates.push({
        scopeType: '销售组织',
        scope: region.name,
        metric: severeMetrics[0].metric,
      });
  });
  return Array.from(
    new Map(
      candidates.map((item) => [`${item.scopeType}|${item.scope}|${item.metric}`, item]),
    ).values(),
  );
}

const autoDispatchCandidates = buildAutoDispatchCandidates();

function mergeAutoDispatchedTasks(tasks: AssignedTask[]) {
  const candidateKeys = new Set(
    autoDispatchCandidates.map((item) => `${item.scopeType}|${item.scope}|${item.metric}`),
  );
  const governedTasks = tasks.filter(
    (task) =>
      task.status === '已完成' ||
      !task.id.startsWith('ai-') ||
      candidateKeys.has(`${task.scopeType}|${task.scope}|${task.metric}`),
  );
  const existingKeys = new Set(
    governedTasks.map((task) => `${task.scopeType}|${task.scope}|${task.metric}`),
  );
  const due = new Date();
  due.setDate(due.getDate() + 3);
  const dueDate = due.toISOString().slice(0, 10);
  const createdAt = new Date().toISOString();
  const ownerByScope: Record<TaskScope, string> = {
    品类: '品类计划负责人',
    基地: '基地计划负责人',
    交叉分析: '产销协同责任人',
    销售组织: '销售运营负责人',
  };
  const newTasks: AssignedTask[] = autoDispatchCandidates
    .filter((item) => !existingKeys.has(`${item.scopeType}|${item.scope}|${item.metric}`))
    .map((item, index) => ({
      id: `ai-${Date.now()}-${index}`,
      scopeType: item.scopeType,
      scope: item.scope,
      metric: item.metric,
      owner: ownerByScope[item.scopeType],
      content: `AI识别${taskScopeDisplay(item.scopeType, item.scope)}${item.metric}达到严重阈值，请完成原因核查并落实纠偏动作。`,
      due: dueDate,
      status: '进行中',
      createdAt,
      analysisPeriod: '月度视角',
      statisticType: metricStatisticType(item.metric),
      dataCutoff: '2026.08.30',
    }));
  return { tasks: [...newTasks, ...governedTasks], addedCount: newTasks.length };
}

const workspaceMeta = {
  coordination: {
    eyebrow: 'S&OP CONTROL TOWER',
    title: '产销协同工作台V0.1',
    search: '搜索经营异常',
  },
  demand: { eyebrow: 'DEMAND OPERATIONS', title: '需求运营管理', search: '搜索需求异常' },
  plan: { eyebrow: 'S&OP WORKBENCH', title: '产销协同看板', search: '搜索风险项' },
  'sales-plan': { eyebrow: 'SALES PLANNING', title: '销售计划', search: '搜索经销商名称或编码' },
  digital: { eyebrow: 'S&OP DIGITAL COLLEAGUE', title: '产销协同数字人', search: '搜索数字人工作' },
  intelligent: {
    eyebrow: 'S&OP INTELLIGENT WORKBENCH',
    title: '产销协同智能工作台',
    search: '搜索智能协同工作',
  },
  delivery: { eyebrow: 'DELIVERY OPERATIONS', title: '交付运营管理', search: '搜索交付订单' },
} as const;

function CoordinationDashboardPage({ onOpenPlan }: { onOpenPlan: () => void }) {
  const [focus, setFocus] = useState('品类经营总览');
  const metrics = [
    {
      name: '销售预算达成',
      value: '61.0%',
      detail: '4.61亿 / 7.56亿',
      state: '正常',
      tone: 'good',
    },
    {
      name: '销售计划准确率',
      value: '95.6%',
      detail: '842万件 / 881万件',
      state: '预警',
      tone: 'watch',
    },
    {
      name: '需求预测准确率',
      value: '95.5%',
      detail: '841万件 / 881万件',
      state: '正常',
      tone: 'good',
    },
    {
      name: '生产计划达成',
      value: '61.7%',
      detail: '512万件 / 830万件',
      state: '预警',
      tone: 'watch',
    },
    {
      name: '当前库存',
      value: '50.9万件',
      detail: '周转 7天 / 目标 6天',
      state: '预警',
      tone: 'watch',
    },
    {
      name: '库存健康度',
      value: '82天',
      detail: '风险 6.5万件 / 5 SKU',
      state: '预警',
      tone: 'watch',
    },
    { name: '订单缺口', value: '1.4万件', detail: '310张待补订单', state: '风险', tone: 'bad' },
    {
      name: '订单履约',
      value: '97.5%',
      detail: '准交率 94.6% / 目标95%',
      state: '预警',
      tone: 'watch',
    },
  ];
  const categoryRows = [
    {
      name: '水饺',
      sales: '3.2亿 / 62%',
      plan: '402万件 / 96%',
      production: '386万件 / 96.5%',
      inventory: '18万件 / +20%',
      delivery: '94.2% / 96.1%',
      result: '产能承压',
      tone: 'watch',
    },
    {
      name: '汤圆',
      sales: '1.4亿 / 58%',
      plan: '178万件 / 91%',
      production: '169万件 / 93.9%',
      inventory: '13.5万件 / +35%',
      delivery: '95.1% / 92.1%',
      result: '库存交付双风险',
      tone: 'bad',
    },
    {
      name: '馄饨',
      sales: '1.5亿 / 60%',
      plan: '186万件 / 93%',
      production: '173万件 / 93.5%',
      inventory: '7.2万件 / -10%',
      delivery: '93.8% / 95.4%',
      result: '产能缺口',
      tone: 'bad',
    },
    {
      name: '面点',
      sales: '0.8亿 / 67%',
      plan: '95万件 / 93%',
      production: '92万件 / 96.8%',
      inventory: '5.8万件 / -3%',
      delivery: '97.3% / 98.2%',
      result: '健康',
      tone: 'good',
    },
    {
      name: '粽子',
      sales: '0.6亿 / 50%',
      plan: '72万件 / 90%',
      production: '65万件 / 90.3%',
      inventory: '8.5万件 / +70%',
      delivery: '91.5% / 90.8%',
      result: '库存积压',
      tone: 'bad',
    },
  ];
  const focusCopy: Record<string, string> = {
    品类经营总览: '从销售、计划、生产、库存到交付统一观察五大品类经营健康度。',
    销售承接分析: '销售达成率 61.0%，华南与西南承接进度偏慢，需校准渠道增量。',
    供需平衡分析: '当前产能缺口 8.3 万件，集中在 305 馄饨及重点水饺规格。',
    交付履约分析: '订单满足率 94.6%、准交率 96.2%，郑州装车节拍是主要约束。',
    生产产能分析: '遂平与华南具备提产空间，预计可覆盖 5 万件重点缺口。',
    库存结构分析: '库存 50.9 万件总体偏高，西南滞库与华东缺货同时存在。',
  };
  return (
    <div className="page workspace-page coordination-page">
      <section className="coordination-toolbar">
        <div>
          <h2>{'产销协同工作台V0.1'}</h2>
          <p>{'全链路经营健康与异常协同'}</p>
        </div>
        <div>
          <button>
            {'2026年9月'}
            <ChevronDown />
          </button>
          <button>
            {'全部基地'}
            <ChevronDown />
          </button>
          <span>{'演示假设'}</span>
        </div>
      </section>
      <section className="summary-strip coord-ai-summary">
        <div className="summary-main">
          <span className="summary-tag">
            <Sparkles />
            {'AI 整体分析'}
          </span>
          <p className="summary-copy">
            {'本月计划需求 '}
            <b>{'881 万件'}</b>
            {'，销售计划准确率 '}
            <b>{'95.6%'}</b>
            {'；生产计划完成 61.7%，库存与交付指标均低于目标。'}
          </p>
          <strong>{'建议：遂平提产 2 万件、华南双班增产 3 万件并启动 ODM 寻源。'}</strong>
        </div>
        <div className="summary-note">
          <small>{'供需侧'}</small>
          <p>
            {'产能缺口 '}
            <b>{'8.3 万件'}</b>
            {'，集中于 305 馄饨等重点品类。'}
          </p>
        </div>
        <div className="summary-note">
          <small>{'库存交付侧'}</small>
          <p>
            {'库存 '}
            <b>{'50.9 万件'}</b>
            {'且结构错配，准交率低于目标。'}
          </p>
        </div>
      </section>
      <section>
        <div className="section-heading">
          <div>
            <span>{'经营总览'}</span>
            <h2>{'核心经营指标'}</h2>
          </div>
          <p>{'全部基地口径 · 8 个指标'}</p>
        </div>
        <div className="coord-metric-grid">
          {metrics.map((item) => {
            const opensPlan = item.name === '生产计划达成';
            return (
              <article
                className={`panel ${opensPlan ? 'coord-metric-link' : ''}`}
                role={opensPlan ? 'button' : undefined}
                tabIndex={opensPlan ? 0 : undefined}
                aria-label={opensPlan ? '进入产销协同工作台' : undefined}
                onClick={opensPlan ? onOpenPlan : undefined}
                onKeyDown={
                  opensPlan
                    ? (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onOpenPlan();
                        }
                      }
                    : undefined
                }
                key={item.name}
              >
                <div>
                  <small>{item.name}</small>
                  <em className={item.tone}>{item.state}</em>
                </div>
                <strong>{item.value}</strong>
                <p>{item.detail}</p>
              </article>
            );
          })}
        </div>
      </section>
      <section className="panel coord-analysis">
        <div className="coord-tabs">
          {Object.keys(focusCopy).map((tab) => (
            <button
              className={focus === tab ? 'active' : ''}
              onClick={() => setFocus(tab)}
              key={tab}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="coord-focus">
          <span>
            <Sparkles />
            {focus}
          </span>
          <p>{focusCopy[focus]}</p>
        </div>
        <div className="coord-table">
          <div className="coord-head">
            <span>{'品类'}</span>
            <span>{'销售类'}</span>
            <span>{'计划类'}</span>
            <span>{'生产类'}</span>
            <span>{'库存类'}</span>
            <span>{'交付类'}</span>
            <span>{'结论'}</span>
          </div>
          {categoryRows.map((row) => (
            <div className="coord-row" key={row.name}>
              <strong>{row.name}</strong>
              <span>{row.sales}</span>
              <span>{row.plan}</span>
              <span>{row.production}</span>
              <span>{row.inventory}</span>
              <span>{row.delivery}</span>
              <em className={row.tone}>{row.result}</em>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function DemandOperationsPage() {
  const demandItems = [
    {
      name: '水饺',
      forecast: '42.6万件',
      actual: '48.9万件',
      bias: '+14.8%',
      signal: '需求上扬',
      level: 'bad',
    },
    {
      name: '预制食材',
      forecast: '31.8万件',
      actual: '35.2万件',
      bias: '+10.7%',
      signal: '促销拉动',
      level: 'watch',
    },
    {
      name: '火锅料',
      forecast: '28.4万件',
      actual: '25.1万件',
      bias: '-11.6%',
      signal: '库存承压',
      level: 'bad',
    },
    {
      name: '休闲',
      forecast: '22.7万件',
      actual: '23.4万件',
      bias: '+3.1%',
      signal: '需求平稳',
      level: 'good',
    },
  ];
  return (
    <div className="page workspace-page demand-page">
      <section className="workspace-hero demand-hero">
        <div>
          <span>
            <Sparkles />
            {'AI 需求信号研判'}
          </span>
          <h2>{'本周需求波动可控，3 个品类需重排预测'}</h2>
          <p>
            {
              '水饺受渠道促销拉动超预测 14.8%，火锅料连续两周低于预测，建议联动库存调整下期需求计划。'
            }
          </p>
        </div>
        <div className="hero-score">
          <strong>{'87.6%'}</strong>
          <small>{'预测准确率'}</small>
        </div>
      </section>
      <section>
        <div className="section-heading">
          <div>
            <span>{'需求健康'}</span>
            <h2>{'需求计划核心指标'}</h2>
          </div>
          <p>{'数据截至 2026.08.23'}</p>
        </div>
        <div className="ops-metric-grid">
          <article>
            <small>{'预测准确率'}</small>
            <strong>{'87.6%'}</strong>
            <em className="good">{'环比 +2.4pp'}</em>
          </article>
          <article>
            <small>{'预测偏差率'}</small>
            <strong>{'8.3%'}</strong>
            <em className="good">{'目标内'}</em>
          </article>
          <article>
            <small>{'需求变更率'}</small>
            <strong>{'6.8%'}</strong>
            <em className="bad">{'超目标 1.8pp'}</em>
          </article>
          <article>
            <small>{'活动纳入率'}</small>
            <strong>{'94.2%'}</strong>
            <em className="watch">{'待确认 3 项'}</em>
          </article>
        </div>
      </section>
      <section>
        <div className="section-heading">
          <div>
            <span>{'品类洞察'}</span>
            <h2>{'预测与实际需求偏差'}</h2>
          </div>
          <p>{'按绝对偏差排序'}</p>
        </div>
        <div className="panel demand-board">
          <div className="board-head">
            <span>{'品类'}</span>
            <span>{'计划预测'}</span>
            <span>{'实际需求'}</span>
            <span>{'偏差'}</span>
            <span>{'信号判断'}</span>
          </div>
          {demandItems.map((item) => (
            <div className="board-row" key={item.name}>
              <strong>{item.name}</strong>
              <span>{item.forecast}</span>
              <span>{item.actual}</span>
              <b className={item.level}>{item.bias}</b>
              <em className={`signal ${item.level}`}>{item.signal}</em>
            </div>
          ))}
        </div>
      </section>
      <section>
        <div className="section-heading">
          <div>
            <span>{'协同动作'}</span>
            <h2>{'需求共识待办'}</h2>
          </div>
          <p>{'销售、市场与计划共同确认'}</p>
        </div>
        <div className="decision-grid">
          <article className="panel">
            <i>{'01'}</i>
            <div>
              <h3>{'确认水饺渠道增量'}</h3>
              <p>{'华东大促追加 6.3 万件，需在 8 月 25 日前锁定。'}</p>
            </div>
            <b>{'销售负责'}</b>
          </article>
          <article className="panel">
            <i>{'02'}</i>
            <div>
              <h3>{'下调火锅料滚动预测'}</h3>
              <p>{'连续两周低于预测，建议下期需求计划下调 8%。'}</p>
            </div>
            <b>{'计划负责'}</b>
          </article>
          <article className="panel">
            <i>{'03'}</i>
            <div>
              <h3>{'补齐活动需求参数'}</h3>
              <p>{'3 项九月活动缺少门店覆盖和转化率假设。'}</p>
            </div>
            <b>{'市场负责'}</b>
          </article>
        </div>
      </section>
    </div>
  );
}

function SalesPlanPage({ runId }: { runId: number }) {
  const [generationStage, setGenerationStage] = useState<'processing' | 'forecasting' | 'ready'>(
    'processing',
  );
  useEffect(() => {
    setGenerationStage('processing');
    const forecastTimer = window.setTimeout(() => setGenerationStage('forecasting'), 2000);
    const readyTimer = window.setTimeout(() => setGenerationStage('ready'), 4000);
    return () => {
      window.clearTimeout(forecastTimer);
      window.clearTimeout(readyTimer);
    };
  }, [runId]);
  const salesPlans = [
    {
      dealer: '北国超市石家庄市青园店',
      code: '20159845',
      target: '¥1,043.85',
      reported: '¥890.27',
      progress: 85.3,
      status: '销售已提报',
    },
    {
      dealer: '盒马鲜生佛山前置仓容桂君安公寓站店（定制）',
      code: '20159838',
      target: '¥396.79',
      reported: '¥344.24',
      progress: 86.8,
      status: '销售已提报',
    },
    {
      dealer: '北京盒马沃德中心前置仓店',
      code: '20159629',
      target: '¥735.56',
      reported: '¥649.54',
      progress: 88.3,
      status: '销售已提报',
    },
    {
      dealer: '盒马鲜生深圳前置仓宝地智能谷站（定制）',
      code: '20160128',
      target: '¥536.02',
      reported: '¥473.64',
      progress: 88.4,
      status: '区域已审批',
    },
    {
      dealer: '苏果南京LIFE小青路店（5182）',
      code: '20155265',
      target: '¥459.31',
      reported: '¥410.64',
      progress: 89.4,
      status: '销售已提报',
    },
    {
      dealer: '重庆盒马前置仓华科蔚来云著站OEM',
      code: '20160384',
      target: '¥937.32',
      reported: '¥0',
      progress: 0,
      status: '待提交',
    },
    {
      dealer: '盒马鲜生深圳前置仓高新产业园站（定制）',
      code: '20159894',
      target: '¥524.46',
      reported: '¥0',
      progress: 0,
      status: '待提交',
    },
    {
      dealer: '盒马鲜生杭州前置仓良北农贸市场站',
      code: '20159921',
      target: '¥1,960.25',
      reported: '¥1,778.38',
      progress: 90.7,
      status: '销售已提报',
    },
  ];
  const generationCopy =
    generationStage === 'processing'
      ? { title: '正在处理销售历史数据', detail: '汇总上月计划偏差、销售实绩与可用产量，请稍候…' }
      : { title: '正在生成 AI 销售预测', detail: '结合历史偏差修正 M1～M+3 月预测结果，请稍候…' };
  return (
    <div className="sales-plan-page">
      <section className="panel sales-plan-board">
        <header className="sales-plan-toolbar">
          <div className="sales-plan-title">
            <h2>{'计划列表'}</h2>
            <div className="sales-plan-steps">
              <span className={generationStage === 'processing' ? 'active' : 'done'}>
                {generationStage === 'processing' && <em>{'处理中'}</em>}
                <b>
                  {generationStage === 'processing' ? <span className="sales-plan-spinner" /> : '1'}
                </b>
                {'数据处理'}
              </span>
              <i>{'→'}</i>
              <span
                className={
                  generationStage === 'forecasting'
                    ? 'active'
                    : generationStage === 'ready'
                      ? 'done'
                      : ''
                }
              >
                {generationStage === 'forecasting' && <em>{'处理中'}</em>}
                <b>
                  {generationStage === 'forecasting' ? (
                    <span className="sales-plan-spinner" />
                  ) : (
                    '2'
                  )}
                </b>
                {'AI 预测生成'}
              </span>
              <i>{'→'}</i>
              <span className={generationStage === 'ready' ? 'current' : ''}>
                <b>{'3'}</b>
                {'计划提报'}
              </span>
            </div>
          </div>
          <div className="sales-plan-period">
            <div className="sales-plan-mode">
              <button className="selected">{'月初'}</button>
              <button>{'纠偏'}</button>
            </div>
            <button className="sales-plan-month">
              {'2026 年 10 月'}
              <ChevronDown />
            </button>
          </div>
        </header>
        {generationStage === 'ready' ? (
          <>
            <div className="sales-plan-filters">
              <div>
                <button>
                  {'全部大区'}
                  <ChevronDown />
                </button>
                <button>
                  {'全部省区'}
                  <ChevronDown />
                </button>
                <button>
                  {'全部状态'}
                  <ChevronDown />
                </button>
              </div>
              <label>
                <Search />
                <input aria-label="搜索经销商" placeholder="搜索经销商名称或编码" />
              </label>
            </div>
            <div className="sales-plan-table-wrap">
              <div className="sales-plan-row sales-plan-head">
                <span>{'序号'}</span>
                <span>{'经销商'}</span>
                <span>{'目标金额'}</span>
                <span>{'提报进度'}</span>
                <span>{'库存健康'}</span>
                <span>{'健康度分析'}</span>
                <span>{'操作'}</span>
              </div>
              {salesPlans.map((item, index) => (
                <article className="sales-plan-row" key={item.code}>
                  <span className="sales-plan-index">{String(index + 1).padStart(2, '0')}</span>
                  <div className="sales-plan-dealer">
                    <strong>{item.dealer}</strong>
                    <div>
                      <small>{item.code}</small>
                      <em
                        className={
                          item.status === '待提交'
                            ? 'pending'
                            : item.status === '区域已审批'
                              ? 'approved'
                              : ''
                        }
                      >
                        {item.status}
                      </em>
                    </div>
                  </div>
                  <strong className="sales-plan-target">{item.target}</strong>
                  <div className="sales-plan-progress">
                    <div>
                      <i>
                        <b style={{ width: `${item.progress}%` }} />
                      </i>
                      <strong>
                        {formatNumber(item.progress, 1)}
                        {'%'}
                      </strong>
                    </div>
                    <p>
                      <span>{'提报金额'}</span>
                      <b>{item.reported}</b>
                      <span>{'目标金额'}</span>
                      <b>{item.target}</b>
                    </p>
                  </div>
                  <div className="sales-plan-stock">
                    <span>{'当前库存　-'}</span>
                    <span>{'周转天数　-'}</span>
                    <span>{'平均货龄　-'}</span>
                  </div>
                  <div className="sales-plan-health">
                    <em>{'数据不足'}</em>
                    <span>{'▸ 历史与本次提报对比'}</span>
                  </div>
                  <button className="sales-plan-action">{'开始提报'}</button>
                </article>
              ))}
            </div>
          </>
        ) : (
          <div
            className="sales-plan-generating"
            key={generationStage}
            role="status"
            aria-live="polite"
          >
            <span>
              <Sparkles />
            </span>
            <div>
              <strong>{generationCopy.title}</strong>
              <p>{generationCopy.detail}</p>
            </div>
            <div className="sales-plan-generation-bar">
              <i />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function DeliveryOperationsPage() {
  const deliveries = [
    {
      order: 'SO-0823-1762',
      route: '郑州 → 华东DC',
      promise: '08.24 10:00',
      status: '装车延迟',
      delay: '2.5h',
    },
    {
      order: 'SO-0823-1658',
      route: '遂平 → 西南DC',
      promise: '08.24 14:00',
      status: '待派车',
      delay: '1.8h',
    },
    {
      order: 'SO-0822-1481',
      route: '郑州 → 华南DC',
      promise: '08.24 16:00',
      status: '运输中',
      delay: '正常',
    },
    {
      order: 'SO-0822-1396',
      route: '华东 → 经销商',
      promise: '08.24 18:00',
      status: '待签收',
      delay: '正常',
    },
  ];
  return (
    <div className="page workspace-page delivery-page">
      <section className="workspace-hero delivery-hero">
        <div>
          <span>
            <Sparkles />
            {'AI 交付风险研判'}
          </span>
          <h2>{'准交风险集中在郑州装车与遂平派车'}</h2>
          <p>
            {
              '未来 24 小时共有 18 笔订单存在延期风险，其中 7 笔影响重点客户，建议优先释放月台与车辆资源。'
            }
          </p>
        </div>
        <div className="hero-score">
          <strong>{'94.37%'}</strong>
          <small>{'本月准交率'}</small>
        </div>
      </section>
      <section>
        <div className="section-heading">
          <div>
            <span>{'交付健康'}</span>
            <h2>{'订单履约核心指标'}</h2>
          </div>
          <p>{'实时履约口径'}</p>
        </div>
        <div className="ops-metric-grid">
          <article>
            <small>{'订单满足率'}</small>
            <strong>{'92.71%'}</strong>
            <em className="bad">{'距目标 -2.29pp'}</em>
          </article>
          <article>
            <small>{'准交率'}</small>
            <strong>{'94.37%'}</strong>
            <em className="bad">{'距目标 -4.13pp'}</em>
          </article>
          <article>
            <small>{'在途订单'}</small>
            <strong>{'286'}</strong>
            <em className="good">{'运行正常'}</em>
          </article>
          <article>
            <small>{'风险订单'}</small>
            <strong>{'18'}</strong>
            <em className="bad">{'重点客户 7 笔'}</em>
          </article>
        </div>
      </section>
      <section>
        <div className="section-heading">
          <div>
            <span>{'履约链路'}</span>
            <h2>{'今日订单状态分布'}</h2>
          </div>
          <p>{'共 1,248 笔订单'}</p>
        </div>
        <div className="delivery-flow panel">
          {[
            { n: '待分配', v: 76, p: 6 },
            { n: '待备货', v: 184, p: 15 },
            { n: '待装车', v: 126, p: 10 },
            { n: '运输中', v: 576, p: 46 },
            { n: '已签收', v: 286, p: 23 },
          ].map((item, index) => (
            <article key={item.n}>
              <div>
                <span>{index + 1}</span>
                <strong>{item.n}</strong>
                <b>{item.v}</b>
              </div>
              <i>
                <em style={{ width: `${item.p}%` }} />
              </i>
            </article>
          ))}
        </div>
      </section>
      <section>
        <div className="section-heading">
          <div>
            <span>{'异常穿透'}</span>
            <h2>{'重点交付订单'}</h2>
          </div>
          <p>{'按承诺时间与客户等级排序'}</p>
        </div>
        <div className="panel delivery-table">
          <div className="delivery-head">
            <span>{'订单号'}</span>
            <span>{'交付线路'}</span>
            <span>{'承诺时间'}</span>
            <span>{'当前状态'}</span>
            <span>{'预计延迟'}</span>
          </div>
          {deliveries.map((item) => (
            <div className="delivery-row" key={item.order}>
              <strong>{item.order}</strong>
              <span>{item.route}</span>
              <span>{item.promise}</span>
              <em className={item.delay === '正常' ? 'good' : 'bad'}>{item.status}</em>
              <b className={item.delay === '正常' ? 'good' : 'bad'}>{item.delay}</b>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function IntelligentWorkbenchPage({
  tasks,
  onOpenV02,
  onOpenDigital,
  onOpenTask,
  onCreateTask,
  live,
  periodLabel,
  periodRange,
}: {
  live?: ReturnType<typeof useWorkspace>;
  periodLabel?: string;
  periodRange?: string;
  tasks: AssignedTask[];
  onOpenV02: (scope?: AnalysisScope, dimension?: ProductionDimension) => void;
  onOpenDigital: () => void;
  onOpenTask: (task: AssignedTask) => void;
  onCreateTask: (task: AssignedTask) => void;
}) {
  const [decisionStates, setDecisionStates] = useState<
    Record<string, 'adopted' | 'tasked' | 'dismissed' | 'editing'>
  >(() =>
    Object.fromEntries(
      tasks
        .filter((task) => task.id.startsWith('ai-intelligent-'))
        .map((task) => [task.id.replace('ai-intelligent-', ''), 'tasked' as const]),
    ),
  );
  const [notice, setNotice] = useState('');
  const [intelligentTaskStatus, setIntelligentTaskStatus] = useState<TaskStatusFilter>('全部');
  const [showAllIntelligentTasks, setShowAllIntelligentTasks] = useState(false);
  const [historyDialog, setHistoryDialog] = useState<'warning' | 'action' | null>(null);
  useEffect(() => {
    const taskedSuggestionIds = tasks
      .filter((task) => task.id.startsWith('ai-intelligent-'))
      .map((task) => task.id.replace('ai-intelligent-', ''));
    if (!taskedSuggestionIds.length) return;
    setDecisionStates((states) => ({
      ...states,
      ...Object.fromEntries(taskedSuggestionIds.map((id) => [id, 'tasked' as const])),
    }));
  }, [tasks]);
  const metricTemplates = [
    {
      name: '销售预算达成率',
      value: '61.00',
      unit: '%',
      statistic: '累计指标',
      period: '本月累计',
      previous: '58.50%',
      same: '63.70%',
      delta: '+2.50pp',
      yoy: '-2.70pp',
      target: '健康 > 95%',
      gap: '差距 -34.00pp',
      status: '未达',
      tone: 'critical',
      deltaDirection: 'up',
      yoyDirection: 'down',
      scope: 'sales' as AnalysisScope,
    },
    {
      name: '生产计划达成率',
      value: '61.70',
      unit: '%',
      statistic: '累计指标',
      period: '本月累计',
      previous: '65.30%',
      same: '68.40%',
      delta: '-3.60pp',
      yoy: '-6.70pp',
      target: '健康 > 99%',
      gap: '差距 -37.30pp',
      status: '未达',
      tone: 'critical',
      deltaDirection: 'down',
      yoyDirection: 'down',
      scope: 'production' as AnalysisScope,
    },
    {
      name: '库存量',
      value: '86.40',
      unit: '万件',
      statistic: '快照指标',
      period: '最新快照 · 截至2026.08.30',
      previous: '90.20万件',
      same: '94.60万件',
      delta: '-3.80万件',
      yoy: '-8.20万件',
      target: '无目标',
      gap: '数量观察项',
      status: '无目标',
      tone: 'neutral',
      deltaDirection: 'down',
      yoyDirection: 'down',
      scope: 'overview' as AnalysisScope,
    },
    {
      name: '订单满足率',
      value: '92.10',
      unit: '%',
      statistic: '累计指标',
      period: '本月累计',
      previous: '95.20%',
      same: '96.00%',
      delta: '-3.10pp',
      yoy: '-4.00pp',
      target: '目标 > 95%',
      gap: '差距 -2.90pp',
      status: '未达',
      tone: 'critical',
      deltaDirection: 'down',
      yoyDirection: 'down',
      scope: 'production' as AnalysisScope,
    },
  ];
  const comparison = live ? comparisonValues(live.data, live.previous, live.annual) : null;
  const _liveMetricSummary = useMemo(() => {
    if (!live?.data) return { metrics: 0, readySources: 0, sourceCount: 0, failedSources: 0 };
    const metrics = Object.values(deriveMetrics(live.data)).filter(
      (metric) => metric.value !== null,
    ).length;
    const sourceCount = live.data.sections.length;
    const failedSources = live.data.sections.filter((section) => section.status === 'error').length;
    const readySources = live.data.sections.filter(
      (section) => section.status === 'ready' && section.rows.length > 0,
    ).length;
    return { metrics, readySources, sourceCount, failedSources };
  }, [live?.data]);
  const _liveBriefingHighlights = useMemo(() => {
    if (!live?.data) return '';
    const metrics = deriveMetrics(live.data);
    const item = (name: string) =>
      metrics[name]?.value === null || metrics[name]?.value === undefined
        ? ''
        : `${name}${formatNumber(metrics[name].value)}${metrics[name].unit}`;
    const items = [item('未税销售额'), item('销售提报准确率'), item('日发货量')].filter(Boolean);
    const planned = metrics['客户计划量']?.value;
    const actual = metrics['客户实际发货量']?.value;
    if (planned !== null && planned !== undefined && actual !== null && actual !== undefined)
      items.push(`客户计划/实际发货量${formatNumber(planned)}/${formatNumber(actual)}万件`);
    return items.length ? `；${items.join('，')}` : '';
  }, [live?.data]);
  const pageBriefing = summarizePage(live?.data, live?.busy);
  const liveInsights = useMemo(
    () => deriveWorkbenchInsights(live?.data, live?.previous),
    [live?.data, live?.previous],
  );
  const businessMetrics = metricTemplates.map((item) => {
    if (!comparison) return item;
    const datum = comparison[item.name as OverviewMetricName];
    const value = datum.current;
    const present = Number.isFinite(value);
    const delta = (n: number | null) =>
      Number.isFinite(n)
        ? `${n! > 0 ? '+' : ''}${formatNumber(n)}${item.unit === '%' ? 'pp' : item.unit}`
        : '-';
    const target = (
      { 销售预算达成率: 95, 生产计划达成率: 99, 订单满足率: 95 } as Record<string, number>
    )[item.name];
    const hasTarget = Number.isFinite(target),
      met = hasTarget && present && value > target;
    return {
      ...item,
      value: present ? formatNumber(value) : '-',
      unit: present ? item.unit : '',
      previous: Number.isFinite(datum.previous)
        ? `${formatNumber(datum.previous)}${item.unit}`
        : '-',
      same: datum.same === null ? '-' : `${formatNumber(datum.same)}${item.unit}`,
      delta: delta(datum.change),
      yoy: delta(datum.yoy),
      target: item.name === '库存量' ? '无目标' : hasTarget ? `健康 > ${target}%` : '目标待接入',
      gap:
        item.name === '库存量'
          ? '数量观察项'
          : hasTarget && present
            ? `距健康线 ${formatNumber(value - target)}pp`
            : live?.busy && !present
              ? '正在读取业务数据'
              : present
                ? '指标已计算'
                : '待配置目标',
      status: present
        ? item.name === '库存量'
          ? '已更新'
          : hasTarget
            ? met
              ? '达标'
              : '未达'
            : '已更新'
        : live?.busy
          ? '读取中'
          : '开发中',
      tone: hasTarget && present ? (met ? 'good' : 'critical') : 'neutral',
      period:
        item.statistic === '快照指标' ? `最新快照 · 截至${live?.data?.end || '-'}` : '本期累计',
      deltaDirection: Number.isFinite(datum.change) ? (datum.change < 0 ? 'down' : 'up') : 'none',
      yoyDirection: datum.yoy === null ? 'none' : datum.yoy < 0 ? 'down' : 'up',
    };
  });
  const demoWarningEvents = [
    {
      id: 'leisure-fulfillment',
      rank: '01',
      scope: '休闲品类',
      metric: '订单满足率 92.80%',
      range: '预警区间 90%—95%',
      gap: '距目标 -2.20pp',
      diagnosis: '近两日满足率持续下降，暂未跌破严重阈值，建议关注活动需求与可承诺库存变化。',
      confidence: 82,
      evidence: '订单行、ATP库存',
      trend: '连续2天下降',
      dimension: 'category' as ProductionDimension,
    },
    {
      id: 'south-plan',
      rank: '02',
      scope: '华南基地',
      metric: '生产计划达成率 94.60%',
      range: '预警区间 90%—95%',
      gap: '距目标 -5.40pp',
      diagnosis: '完工入库节奏低于计划，当前属于提前预警，需持续观察未完工工单的集中程度。',
      confidence: 76,
      evidence: '生产计划、完工入库',
      trend: '较上期 -1.80pp',
      dimension: 'base' as ProductionDimension,
    },
  ];
  const warningEvents = live ? liveInsights.warnings : demoWarningEvents;
  const demoActionSuggestions = [
    {
      id: 'hotpot-stock',
      rank: '01',
      trigger: '日历驱动',
      triggerNote: '销售计划预测生成',
      scope: '月度销售计划生成',
      metric: '每月25日自动触发',
      gap: '预测周期 M1～M+3月',
      diagnosis: '上个月销售计划偏差达到40%，基于上个月偏差内容和产量，已为您做了新的调整。',
      evidence: '上月计划偏差、销售实绩、可用产量',
      confidence: 88,
      owner: '计划管理Agent',
      due: '每月25日',
      action: '基于日历驱动生成销售计划预测及提报事件，生成M1～M+3月的销售计划预测结果。',
      impact: '形成M1～M+3月滚动销售计划预测',
      dimension: 'category' as ProductionDimension,
    },
    {
      id: 'east-prepared',
      rank: '02',
      trigger: '严重指标',
      triggerNote: '订单满足率跌破严重阈值',
      scope: '华东 × 预制食材',
      metric: '订单满足率 65.55%',
      gap: '低于目标 29.45pp',
      diagnosis: '促销增量未完全进入计划，可承诺库存不足是主要可能原因。',
      evidence: '订单行、活动需求、ATP库存',
      confidence: 78,
      owner: '华东计划负责人',
      due: '今天 18:00',
      action: '确认促销增量并重新计算供应缺口',
      impact: '预计恢复满足率 8—12pp',
      dimension: 'cross' as ProductionDimension,
    },
    {
      id: 'zhengzhou-delivery',
      rank: '03',
      trigger: '事件驱动',
      triggerNote: '装车波次集中事件',
      scope: '郑州基地',
      metric: '7笔重点订单存在延期风险',
      gap: '最晚承诺时间明天 10:00',
      diagnosis: '承运资源与月台节拍无法覆盖集中装车波次，若不干预将影响重点客户承诺。',
      evidence: '装车计划、承运资源、订单承诺',
      confidence: 86,
      owner: '郑州交付负责人',
      due: '今天 16:00',
      action: '拆分装车波次并补充承运资源',
      impact: '预计避免7笔重点订单延期',
      dimension: 'base' as ProductionDimension,
    },
  ];
  const actionSuggestions = live ? liveInsights.actions : demoActionSuggestions;
  const warningHistory = [
    {
      date: '09月19日',
      scope: '华北基地',
      metric: '生产计划达成率 93.20%',
      result: '已恢复至 97.80%',
    },
    {
      date: '09月18日',
      scope: '火锅料品类',
      metric: '可发货天数 14.30天',
      result: '已恢复至 11.80天',
    },
  ];
  const actionHistory = [
    { date: '09月19日', scope: '华东经销业务', metric: '5笔重点订单延期风险', result: '已建任务' },
    { date: '09月17日', scope: '休闲品类', metric: '临期库存例行复盘', result: '方案已采纳' },
  ];
  const activeHistory = live ? [] : historyDialog === 'warning' ? warningHistory : actionHistory;
  const completedTaskCount = tasks.filter((task) => task.status === '已完成').length;
  const taskCount = live ? tasks.length : Math.max(tasks.length, 39);
  const warningCount = live && !live.data ? '—' : warningEvents.length;
  const pendingActionCount =
    live && !live.data ? '—' : actionSuggestions.filter((item) => !decisionStates[item.id]).length;
  const activeTaskCount =
    live && !live.data
      ? '—'
      : live
        ? taskCount - completedTaskCount
        : Math.max(8, taskCount - completedTaskCount);
  const filteredIntelligentTasks = tasks.filter(
    (task) =>
      intelligentTaskStatus === '全部' ||
      (intelligentTaskStatus === '已完成' ? task.status === '已完成' : task.status !== '已完成'),
  );
  const visibleTasks = showAllIntelligentTasks
    ? filteredIntelligentTasks
    : filteredIntelligentTasks.slice(0, 8);
  const updateDecision = (id: string, state: 'adopted' | 'tasked' | 'dismissed' | 'editing') => {
    if (live) {
      setNotice('正式决策与任务接口待接入');
      window.setTimeout(() => setNotice(''), 2600);
      return;
    }
    setDecisionStates((items) => ({ ...items, [id]: state }));
    if (state === 'tasked') {
      const suggestion = actionSuggestions.find((item) => item.id === id);
      if (suggestion && !tasks.some((task) => task.id === `ai-intelligent-${suggestion.id}`)) {
        onCreateTask({
          id: `ai-intelligent-${suggestion.id}`,
          scopeType:
            suggestion.id === 'hotpot-stock'
              ? '销售组织'
              : suggestion.dimension === 'base'
                ? '基地'
                : '交叉分析',
          scope: suggestion.scope,
          metric: suggestion.metric,
          owner: suggestion.owner,
          content: suggestion.action,
          due: suggestion.due,
          status: '进行中',
          createdAt: new Date().toISOString(),
          analysisPeriod: suggestion.id === 'hotpot-stock' ? 'M1～M+3月' : '月度视角',
          statisticType: '累计指标',
          dataCutoff: '2026.09.20',
        });
        requestAnimationFrame(() =>
          requestAnimationFrame(() =>
            document
              .getElementById('intelligent-task-center')
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
          ),
        );
      }
    }
    const message =
      state === 'adopted'
        ? '建议已采纳并记录，暂不创建执行任务。'
        : state === 'tasked'
          ? '方案已转为任务，进入统一任务中心持续跟踪。'
          : state === 'dismissed'
            ? '本次建议已标记为不采纳，可在决策记录中复盘。'
            : '已进入方案调整状态，调整后可继续转为任务。';
    setNotice(message);
    window.setTimeout(() => setNotice(''), 2600);
  };
  return (
    <div className="page workspace-page intelligent-workspace-page">
      <section className="intelligent-section intelligent-metrics-first" aria-label="经营态势">
        <div className="intelligent-section-heading">
          <div>
            <span>
              {'核心指标 · '}
              {live ? periodLabel : '月度视角'}
            </span>
          </div>
          <p>
            {live
              ? `${periodRange} · 本期累计 / 对比期 / 变化量`
              : '2026.08.01—2026.08.30 · 本月累计 / 上月同期 / 环比变化'}
          </p>
        </div>
        <div className="intelligent-core-metric-groups">
          <section
            className="production-kpi-group intelligent-core-metric-group"
            aria-label="经营指标"
          >
            <div className="business-metric-table-head">
              <strong>{'经营指标'}</strong>
              <span>
                {'智能工作台核心指标 · '}
                {businessMetrics.length}
                {'项'}
              </span>
            </div>
            <div
              className={`kpi-grid period-kpi-grid overview-flat-kpi-grid scope-kpi-count-${businessMetrics.length}`}
            >
              {businessMetrics.map((item) => (
                <button
                  type="button"
                  className="kpi-card period-kpi-card intelligent-period-kpi-card"
                  key={item.name}
                  data-context-id={`intelligent-metric-${item.name}`}
                  data-context-scope="经营指标"
                  data-context-label={item.name}
                  data-context-summary={`${item.name} ${item.value}${item.unit}，环比变化 ${item.delta}，${item.target}`}
                  onClick={() =>
                    onOpenV02(item.scope, item.scope === 'production' ? 'category' : undefined)
                  }
                >
                  <div className="kpi-name">
                    <span>{item.name}</span>
                    <i
                      className={`achievement-status ${item.tone === 'neutral' ? 'status-neutral' : item.tone === 'good' ? 'status-ok' : 'status-bad'}`}
                    >
                      {item.status}
                    </i>
                  </div>
                  <div
                    className={`kpi-period-label ${item.statistic === '快照指标' ? 'snapshot' : 'cumulative'}`}
                  >
                    <span>{item.statistic}</span>
                    {item.period}
                  </div>
                  <div className="kpi-value">
                    <strong>{item.value}</strong>
                    <span>{item.unit}</span>
                  </div>
                  <div className="kpi-comparison-head">
                    <span>{'对比指标'}</span>
                    <span>{'变化量'}</span>
                  </div>
                  <div className="kpi-comparison-rows">
                    <div>
                      <span>
                        {'上月同期 '}
                        <em>{item.previous}</em>
                      </span>
                      <b className="good">
                        {item.deltaDirection === 'none' ? null : item.deltaDirection === 'down' ? (
                          <TrendingDown />
                        ) : (
                          <TrendingUp />
                        )}
                        {item.delta}
                      </b>
                    </div>
                    <div>
                      <span>
                        {'去年同月同期 '}
                        <em>{item.same}</em>
                      </span>
                      <b className="good">
                        {item.yoyDirection === 'none' ? null : item.yoyDirection === 'down' ? (
                          <TrendingDown />
                        ) : (
                          <TrendingUp />
                        )}
                        {item.yoy}
                      </b>
                    </div>
                  </div>
                  <div className="kpi-foot">
                    <span>{item.target}</span>
                    <b
                      className={
                        item.tone === 'good' ? 'good' : item.tone === 'neutral' ? 'neutral' : 'bad'
                      }
                    >
                      {item.gap}
                    </b>
                  </div>
                </button>
              ))}
            </div>
          </section>
        </div>
        <section
          className="intelligent-operating-metrics production-kpi-group"
          aria-label="运营指标"
        >
          <div className="business-metric-table-head">
            <strong>{'运营指标'}</strong>
            <span>{'智能协同运营状态 · 3项'}</span>
          </div>
          <div className="intelligent-hero-stats">
            <button
              className="warning"
              data-context-id="intelligent-warning-summary"
              data-context-scope="工作状态"
              data-context-label="预警观察"
              data-context-summary={`${warningCount}项指标进入预警区间`}
              onClick={() =>
                document
                  .getElementById('intelligent-warning-panel')
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
            >
              <div>
                <small>{'预警观察'}</small>
                <em>{'进入预警区间'}</em>
              </div>
              <strong>{warningCount}</strong>
            </button>
            <button
              className="decision"
              data-context-id="intelligent-decision-summary"
              data-context-scope="工作状态"
              data-context-label="待决策建议"
              data-context-summary={`${pendingActionCount}项AI方案已就绪`}
              onClick={() =>
                document
                  .getElementById('intelligent-action-panel')
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
            >
              <div>
                <small>{'待决策建议'}</small>
                <em>{'AI方案已就绪'}</em>
              </div>
              <strong>{pendingActionCount}</strong>
            </button>
            <button
              className="tracking"
              data-context-id="intelligent-task-summary"
              data-context-scope="工作状态"
              data-context-label="执行中任务"
              data-context-summary={`${activeTaskCount}项任务正在统一闭环跟踪`}
              onClick={() =>
                document
                  .getElementById('intelligent-task-center')
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
            >
              <div>
                <small>{'执行中任务'}</small>
                <em>{'统一闭环跟踪'}</em>
              </div>
              <strong>{activeTaskCount}</strong>
            </button>
          </div>
        </section>
      </section>

      <section className="intelligent-hero panel">
        <div
          className="intelligent-briefing"
          data-context-id="intelligent-daily-briefing"
          data-context-scope="经营简报"
          data-context-label="AI今日经营简报"
          data-context-summary={
            live
              ? `${pageBriefing.title}。${pageBriefing.copy}`
              : '2项指标进入预警区间，3项AI方案等待决策。'
          }
        >
          <span>
            <Sparkles />
            {'AI 今日经营简报'}
          </span>
          <h2>{live ? pageBriefing.title : '2项指标进入预警区间，3项AI方案等待决策'}</h2>
          <p>
            {live
              ? pageBriefing.copy
              : '预警事项用于提前关注；严重指标、业务事件和例行日历触发的事项由AI生成分析与方案。你也可以进入V0.2看板核查明细并直接派发任务。'}
          </p>
        </div>
      </section>

      <section className="intelligent-lifecycle" id="intelligent-alerts">
        <div className="intelligent-work-grid">
          <section className="intelligent-work-column" id="intelligent-warning-panel">
            <div className="intelligent-section-heading">
              <div>
                <span>{'事件预警'}</span>
                <h2>{'进入预警区间的指标'}</h2>
              </div>
              <div className="section-heading-actions">
                <b>{warningCount}</b>
                <button aria-haspopup="dialog" onClick={() => setHistoryDialog('warning')}>
                  {'查看更多'}
                  <ArrowRight />
                </button>
              </div>
            </div>
            <div className="intelligent-alert-panel panel">
              <p className="workflow-section-note">
                {'尚未达到严重状态，先提示关注并支持进入看板核查，不自动生成处置任务。'}
              </p>
              <div className="intelligent-action-list warning-insight-list">
                {warningEvents.map((item) => (
                  <article
                    key={item.id}
                    data-context-id={`intelligent-warning-${item.id}`}
                    data-context-scope="事件预警"
                    data-context-label={`${item.scope} · ${item.metric}`}
                    data-context-summary={`${item.metric}，${item.gap}。AI分析：${item.diagnosis}`}
                  >
                    <header>
                      <span>
                        <Bell />
                      </span>
                      <div>
                        <small>
                          {'阈值预警 · '}
                          {item.range}
                        </small>
                        <strong>{item.scope}</strong>
                        <em>
                          {item.metric}
                          {' · '}
                          {item.gap}
                        </em>
                      </div>
                      <b>{'预警'}</b>
                    </header>
                    <div className="ai-analysis-block">
                      <p>
                        <span>{'AI分析'}</span>
                        {item.diagnosis}
                      </p>
                      <small>
                        {'依据：'}
                        {item.evidence}
                        {' · 可信度 '}
                        {Number.isFinite(item.confidence) ? `${item.confidence}%` : '—'}
                      </small>
                    </div>
                    <div className="suggested-plan">
                      <span>
                        <small>{'区间判断'}</small>
                        <strong>{item.range}</strong>
                      </span>
                      <span>
                        <small>{'变化趋势'}</small>
                        <b>{item.trend}</b>
                      </span>
                      <span>
                        <small>{'数据证据'}</small>
                        <b>{item.evidence}</b>
                      </span>
                    </div>
                    <div className="action-buttons">
                      <button
                        className="primary warning-action"
                        onClick={() => onOpenV02('production', item.dimension)}
                      >
                        {'进入V0.2核查明细'}
                        <ArrowRight />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
          <section className="intelligent-work-column" id="intelligent-action-panel">
            <div className="intelligent-section-heading">
              <div>
                <span>{'行动建议'}</span>
                <h2>{'AI分析与待决策方案'}</h2>
              </div>
              <div className="section-heading-actions">
                <b>{pendingActionCount}</b>
                <button aria-haspopup="dialog" onClick={() => setHistoryDialog('action')}>
                  {'查看更多'}
                  <ArrowRight />
                </button>
              </div>
            </div>
            <div className="intelligent-action-panel panel">
              <p className="workflow-section-note">
                {'严重指标、业务事件和日历任务由AI完成分析并生成可执行方案。'}
              </p>
              <div className="intelligent-action-list">
                {actionSuggestions.map((item) => {
                  const state = decisionStates[item.id];
                  const calendarDriven = item.trigger === '日历驱动';
                  const statusLabel =
                    state === 'tasked'
                      ? '已建任务'
                      : state === 'adopted'
                        ? '已采纳'
                        : state === 'dismissed'
                          ? '不采纳'
                          : state === 'editing'
                            ? '调整中'
                            : '待决策';
                  return (
                    <article
                      key={item.id}
                      className={state ? `handled state-${state}` : ''}
                      data-context-id={`intelligent-action-${item.id}`}
                      data-context-scope="行动建议"
                      data-context-label={item.scope}
                      data-context-summary={`${item.trigger}：${item.triggerNote}。AI分析：${item.diagnosis} 执行方案：${item.action}`}
                    >
                      <header>
                        <span>
                          <Sparkles />
                        </span>
                        <div>
                          <small>
                            {item.trigger}
                            {' · '}
                            {item.triggerNote}
                          </small>
                          <strong>{item.scope}</strong>
                          <em>
                            {item.metric}
                            {' · '}
                            {item.gap}
                          </em>
                        </div>
                        <b>{statusLabel}</b>
                      </header>
                      <div className="ai-analysis-block">
                        <p>
                          <span>{'AI分析'}</span>
                          {item.diagnosis}
                        </p>
                        <small>
                          {calendarDriven ? '输入依据' : '依据'}
                          {'：'}
                          {item.evidence}
                          {' · 可信度 '}
                          {Number.isFinite(item.confidence) ? `${item.confidence}%` : '—'}
                        </small>
                      </div>
                      <div className="suggested-plan">
                        <span>
                          <small>{calendarDriven ? '执行方案' : '建议方案'}</small>
                          <strong>{item.action}</strong>
                        </span>
                        <span>
                          <small>{calendarDriven ? '任务产出' : '预期影响'}</small>
                          <b>{item.impact}</b>
                        </span>
                        <span>
                          <small>
                            {calendarDriven ? '执行主体 / 触发时间' : '建议责任人 / 时限'}
                          </small>
                          <b>
                            {item.owner}
                            {' · '}
                            {item.due}
                          </b>
                        </span>
                      </div>
                      <div className="action-buttons">
                        <button onClick={() => updateDecision(item.id, 'dismissed')}>
                          {'不采纳'}
                        </button>
                        <button onClick={() => updateDecision(item.id, 'adopted')}>
                          {'仅采纳'}
                        </button>
                        <button onClick={() => updateDecision(item.id, 'editing')}>
                          {state === 'editing' ? '方案调整中' : '修改方案'}
                        </button>
                        <button
                          className="primary"
                          disabled={state === 'tasked'}
                          onClick={() => updateDecision(item.id, 'tasked')}
                        >
                          {state === 'tasked' ? (
                            <>
                              <Check />
                              {'已创建任务'}
                            </>
                          ) : state === 'editing' ? (
                            '调整后建任务'
                          ) : (
                            '采纳并建任务'
                          )}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </section>
        </div>
      </section>

      <section
        className="intelligent-task-module"
        id="intelligent-task-center"
        aria-labelledby="intelligent-task-title"
      >
        <div className="intelligent-task-heading">
          <div>
            <span>{'任务追踪 · 复用V0.2任务数据'}</span>
            <h2 id="intelligent-task-title">{'统一协同任务'}</h2>
            <p>{'AI主动处置与人工发起事项进入同一任务池，按责任、时限、结果和证据统一闭环。'}</p>
          </div>
          <div className="task-count-filters" role="group" aria-label="智能工作台任务状态筛选">
            <button
              className={`completed ${intelligentTaskStatus === '已完成' ? 'selected' : ''}`}
              onClick={() => setIntelligentTaskStatus('已完成')}
            >
              {'已完成 '}
              <b>{completedTaskCount}</b>
            </button>
            <button
              className={`incomplete ${intelligentTaskStatus === '未完成' ? 'selected' : ''}`}
              onClick={() => setIntelligentTaskStatus('未完成')}
            >
              {'未完成 '}
              <b>{tasks.length - completedTaskCount}</b>
            </button>
            <button
              className={`total ${intelligentTaskStatus === '全部' ? 'selected' : ''}`}
              onClick={() => setIntelligentTaskStatus('全部')}
            >
              {'全部 '}
              <b>{tasks.length}</b>
            </button>
          </div>
        </div>
        <div className="panel intelligent-task-board">
          {visibleTasks.length ? (
            <>
              <div className="intelligent-task-head">
                <span>{'协作模式'}</span>
                <span>{'任务来源'}</span>
                <span>{'分析对象 / 异常指标'}</span>
                <span>{'任务内容'}</span>
                <span>{'责任人'}</span>
                <span>{'完成时间'}</span>
                <span>{'状态与操作'}</span>
              </div>
              {visibleTasks.map((task) => {
                const machineLed = task.id.startsWith('ai-');
                return (
                  <article
                    className="intelligent-task-row"
                    key={task.id}
                    data-context-id={`intelligent-task-${task.id}`}
                    data-context-scope="协同任务"
                    data-context-label={`${task.scope} · ${task.metric}`}
                    data-context-summary={`${task.content} 责任人：${task.owner}，完成时间：${task.due}，状态：${task.status}`}
                  >
                    <span>
                      <em className={`collaboration-badge ${machineLed ? 'machine' : 'human'}`}>
                        {machineLed ? '机主导 · 人协作' : '人主导 · 机协助'}
                      </em>
                    </span>
                    <strong>
                      {task.scopeType}
                      <small>
                        {task.analysisPeriod || '既有任务'}
                        {' · '}
                        {task.dataCutoff || '—'}
                      </small>
                    </strong>
                    <b>
                      {task.scope}
                      <small>{task.metric}</small>
                    </b>
                    <p>{task.content}</p>
                    <span>{task.owner}</span>
                    <span>{task.due}</span>
                    <span className="assigned-task-action">
                      <em
                        className={`task-status-badge ${task.status === '已完成' ? 'completed' : 'active'}`}
                      >
                        {task.status}
                      </em>
                      <button
                        className={task.status === '已完成' ? 'done' : ''}
                        onClick={() => onOpenTask(task)}
                      >
                        {task.status === '已完成' ? (
                          <>
                            <Check />
                            {'查看结果'}
                          </>
                        ) : (
                          <>
                            <ClipboardCheck />
                            {'填写结果'}
                          </>
                        )}
                      </button>
                    </span>
                  </article>
                );
              })}
              {filteredIntelligentTasks.length > 8 && (
                <button
                  className="intelligent-task-expand"
                  onClick={() => setShowAllIntelligentTasks((value) => !value)}
                >
                  {showAllIntelligentTasks
                    ? '收起任务列表'
                    : `查看全部 ${filteredIntelligentTasks.length} 项任务`}
                  <ChevronDown />
                </button>
              )}
            </>
          ) : (
            <div className="assigned-task-empty">
              <ClipboardCheck />
              <strong>{'当前筛选条件暂无任务'}</strong>
              <p>{'切换任务状态查看其他任务。'}</p>
            </div>
          )}
        </div>
      </section>

      <section className="intelligent-bottom-grid intelligent-system-summary">
        <article
          className="panel intelligent-task-status"
          data-context-id="intelligent-closure-standard"
          data-context-scope="闭环管理"
          data-context-label="闭环标准"
          data-context-summary="动作完成不等于问题解决，任务完成后继续观察指标是否恢复。"
        >
          <header>
            <div>
              <span>{'闭环标准'}</span>
              <h2>{'动作完成不等于问题解决'}</h2>
            </div>
            <button onClick={() => onOpenV02('overview')}>
              {'回看经营指标'}
              <ArrowRight />
            </button>
          </header>
          <p>
            {'任务完成后继续观察指标是否恢复；只有“动作完成 + 指标恢复 + 经验沉淀”才视为真正闭环。'}
          </p>
        </article>
        <article
          className="panel intelligent-agent-status"
          data-context-id="intelligent-agent-status"
          data-context-scope="数字人管理"
          data-context-label="数字人状态摘要"
          data-context-summary="运行正常，自治水平61%，今日扫描24轮，待人工审核12项。"
        >
          <header>
            <span>
              <Bot />
              {'数字人状态摘要'}
            </span>
            <em>{live ? '待接入' : '运行正常'}</em>
          </header>
          <div>
            <span>
              <small>{'自治水平'}</small>
              <strong>{live ? '—' : '61%'}</strong>
            </span>
            <span>
              <small>{'今日扫描'}</small>
              <strong>{live ? '—' : '24轮'}</strong>
            </span>
            <span>
              <small>{'待人工审核'}</small>
              <strong>{live ? '—' : '12项'}</strong>
            </span>
          </div>
          <p>
            <i />
            {live ? '数字人执行状态待接入。' : '最近一次扫描已完成，未发现数据连接或技能调用异常。'}
          </p>
          <button onClick={onOpenDigital}>
            {'进入管理后台'}
            <ArrowRight />
          </button>
        </article>
      </section>
      {historyDialog &&
        createPortal(
          <div
            className="insight-history-backdrop"
            onMouseDown={() => setHistoryDialog(null)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setHistoryDialog(null);
            }}
          >
            <section
              className={`insight-history-dialog ${historyDialog}`}
              role="dialog"
              aria-modal="true"
              aria-labelledby="insight-history-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <header>
                <div>
                  <small>
                    {historyDialog === 'warning' ? '事件预警' : '行动建议'}
                    {' · 历史记录'}
                  </small>
                  <h2 id="insight-history-title">
                    {historyDialog === 'warning' ? '历史预警列表' : '历史建议列表'}
                  </h2>
                  <p>
                    {historyDialog === 'warning'
                      ? '查看过往进入预警区间的指标及恢复结果。'
                      : '查看过往AI生成的行动建议及决策结果。'}
                  </p>
                </div>
                <button
                  autoFocus
                  aria-label="关闭历史记录弹窗"
                  onClick={() => setHistoryDialog(null)}
                >
                  <X />
                </button>
              </header>
              <div className="insight-history-table">
                <div className="insight-history-head">
                  <span>{'日期'}</span>
                  <span>{'分析对象'}</span>
                  <span>{'当时数据'}</span>
                  <span>{'处理结果'}</span>
                </div>
                {activeHistory.map((item) => (
                  <article key={`${item.date}-${item.scope}`}>
                    <time>{item.date}</time>
                    <strong>{item.scope}</strong>
                    <span>{item.metric}</span>
                    <em>{item.result}</em>
                  </article>
                ))}
              </div>
              <footer>
                <span>
                  {'共 '}
                  {activeHistory.length}
                  {' 条历史记录'}
                </span>
                <button onClick={() => setHistoryDialog(null)}>{'关闭'}</button>
              </footer>
            </section>
          </div>,
          document.body,
        )}
      {notice && (
        <div className="digital-notice">
          <Check />
          {notice}
        </div>
      )}
    </div>
  );
}

function DigitalHumanWorkbenchPage({
  tasks,
  onOpenV02,
}: {
  tasks: AssignedTask[];
  onOpenV02: () => void;
}) {
  const [activeStage, setActiveStage] = useState<DigitalHumanStage>('dashboard');
  const [approvedDrafts, setApprovedDrafts] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const [scanSecondsRemaining, setScanSecondsRemaining] = useState(178);
  const [scanRounds, setScanRounds] = useState(24);
  const [executionPulse, setExecutionPulse] = useState(0);
  const [compactIdentityVisible, setCompactIdentityVisible] = useState(false);
  const completedTasks = tasks.filter((task) => task.status === '已完成').length;
  const pendingReviews = Math.max(0, 12 - approvedDrafts.length);
  const stages: Array<{
    id: DigitalHumanStage;
    index: string;
    title: string;
    subtitle: string;
    mode: string;
    count: string;
    icon: typeof Bot;
  }> = [
    {
      id: 'dashboard',
      index: '01',
      title: '看板运营',
      subtitle: '持续运营 V0.2 指标看板，形成统一事实入口',
      mode: '数据监测',
      count: '13 项指标',
      icon: LayoutGrid,
    },
    {
      id: 'diagnose',
      index: '02',
      title: '异常识别与研判',
      subtitle: '从指标与明细中识别预警、严重项',
      mode: '数字人主导',
      count: '4 项待处置',
      icon: AlertTriangle,
    },
    {
      id: 'orchestrate',
      index: '03',
      title: '责任人与任务编排',
      subtitle: '生成责任人、任务内容和处理时限建议',
      mode: '人工审核',
      count: `${pendingReviews} 项待审核`,
      icon: Users,
    },
    {
      id: 'investigate',
      index: '04',
      title: '调研与过程管理',
      subtitle: '由一线补充暗数据，数字人跟踪进度与催办',
      mode: '人主导 · AI协同',
      count: '8 项进行中',
      icon: ClipboardCheck,
    },
    {
      id: 'close',
      index: '05',
      title: '闭环验收与复盘',
      subtitle: '验证指标恢复并沉淀原因、措施和经验',
      mode: '共同决策',
      count: `${Math.max(5, completedTasks)} 项待验收`,
      icon: Check,
    },
  ];
  const selectStage = (stage: DigitalHumanStage) => {
    setActiveStage(stage);
    requestAnimationFrame(() =>
      document
        .getElementById('digital-stage-workspace')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  };
  const approveDraft = (id: string) => {
    if (approvedDrafts.includes(id)) return;
    setApprovedDrafts((items) => [...items, id]);
    setNotice('已生成本页任务预览，尚未派发或写入业务系统。');
    setTimeout(() => setNotice(''), 2600);
  };
  useEffect(() => {
    const executionTimer = window.setInterval(() => {
      setScanSecondsRemaining((current) => {
        if (current <= 1) {
          setScanRounds((rounds) => rounds + 1);
          setExecutionPulse((pulse) => pulse + 1);
          return 180;
        }
        return current - 1;
      });
    }, 1000);
    return () => {
      window.clearInterval(executionTimer);
    };
  }, []);
  const scanCountdownLabel = `${String(Math.floor(scanSecondsRemaining / 60)).padStart(2, '0')}:${String(scanSecondsRemaining % 60).padStart(2, '0')}`;
  const executionActivities = [
    { time: '刚刚', text: '完成基地与品类六指标扫描', result: '发现 4 项需跟踪' },
    {
      time: '1分钟前',
      text: '同步异常任务完成状态',
      result: `${Math.max(8, tasks.length)} 项任务在跟踪`,
    },
    { time: '3分钟前', text: '校验责任人与处理时限', result: `${pendingReviews} 项等待人工审核` },
  ];
  const reviewItems = [
    {
      id: 'water',
      level: '严重',
      target: '华东 × 预制食材',
      metric: '订单满足率 65.55%',
      owner: '华东计划负责人',
      due: '今天 18:00',
      reason: '连续两周低于目标，建议核查促销增量与可承诺库存。',
    },
    {
      id: 'zhengzhou',
      level: '严重',
      target: '郑州基地',
      metric: '准交率 83.28%',
      owner: '郑州交付负责人',
      due: '明天 12:00',
      reason: '装车节拍与承运资源可能形成约束，需要一线确认。',
    },
    {
      id: 'hotpot',
      level: '预警',
      target: '火锅料品类',
      metric: '可发货天数 16.90天',
      owner: '火锅料计划负责人',
      due: '09月19日',
      reason: '库存覆盖偏高，建议核查临期结构与后续活动消耗。',
    },
  ];
  const dashboardGroups = [
    {
      name: '销售指标',
      metrics: [
        { name: '销售预算达成', value: '61.00%', target: '目标 ≥ 70%', state: '未达' },
        { name: '销售计划准确率', value: '95.60%', target: '目标 ≥ 98%', state: '预警' },
      ],
    },
    {
      name: '计划指标',
      metrics: [
        { name: '需求预测准确率', value: '95.50%', target: '目标 ≥ 98%', state: '预警' },
        { name: '生产计划达成', value: '61.70%', target: '目标 ≥ 95%', state: '未达' },
      ],
    },
    {
      name: '订单指标',
      metrics: [
        { name: '订单满足率', value: '92.07%', target: '目标 ≥ 95%', state: '严重' },
        { name: '准交率', value: '93.05%', target: '目标 ≥ 98.5%', state: '严重' },
      ],
    },
    {
      name: '库存指标',
      metrics: [
        { name: '可发货天数', value: '10.23天', target: '目标 ≤ 12天', state: '健康' },
        { name: '大日期数量', value: '6.50万件', target: '无目标', state: '健康' },
      ],
    },
  ];
  const v02CoreMetrics = [
    {
      name: '销售预算达成率',
      value: '61.00%',
      detail: '月度累计 · 距目标 -39.00pp',
      status: '未达目标',
      tone: 'critical',
      icon: TrendingUp,
    },
    {
      name: '生产计划达成率',
      value: '61.70%',
      detail: '月度累计 · 距目标 -38.30pp',
      status: '未达目标',
      tone: 'critical',
      icon: Factory,
    },
    {
      name: '库存量',
      value: '86.40万件',
      detail: '截至 2026.08.30 · 快照指标',
      status: '数量观察',
      tone: 'neutral',
      icon: Boxes,
    },
  ];
  return (
    <div
      className="page workspace-page digital-human-page"
      onScroll={(event) => setCompactIdentityVisible(event.currentTarget.scrollTop > 120)}
    >
      {compactIdentityVisible && (
        <div className="digital-compact-identity">
          <div className="compact-person">
            <img src="/images/sop-digital-human-avatar-cartoon.png" alt="产销协同数字人头像" />
            <span>
              <strong>
                <i />
                {'产销协同数字人'}
              </strong>
              <small>
                {'正在执行：'}
                {stages.find((stage) => stage.id === activeStage)?.title}
              </small>
            </span>
          </div>
          <div className="compact-stats">
            <span>
              <small>{'自治水平'}</small>
              <b>{'61%'}</b>
            </span>
            <span>
              <small>{'自主完成'}</small>
              <b>{'73'}</b>
            </span>
            <span className="needs-review">
              <small>{'待人工审核'}</small>
              <b>{pendingReviews}</b>
            </span>
          </div>
          <button
            onClick={() =>
              document
                .querySelector<HTMLElement>('.digital-human-page')
                ?.scrollTo({ top: 0, behavior: 'smooth' })
            }
          >
            {'返回数字人主页 ↑'}
          </button>
        </div>
      )}
      <section className="digital-hero panel">
        <div className="digital-identity">
          <div className="digital-avatar">
            <img src="/images/sop-digital-human-avatar-cartoon.png" alt="产销协同数字人头像" />
            <span />
          </div>
          <div>
            <p className="digital-kicker">
              <Bot />
              {'产销协同数字人 · 运行中'}
            </p>
            <h2>{'这是我的工作台，我负责持续发现问题并推动闭环'}</h2>
            <p>
              {
                '当前受暗数据限制，我先完成指标扫描、异常研判、任务草拟和过程跟踪；关键派发、现场事实补充与闭环验收由你决策。随着知识与规则沉淀，我会逐步提高自主完成比例。'
              }
            </p>
          </div>
        </div>
        <div className="autonomy-card">
          <div>
            <span>{'当前自治水平'}</span>
            <strong>{'61%'}</strong>
          </div>
          <div className="autonomy-track">
            <i />
          </div>
          <small>{'人机协同阶段 · 目标 100% 自主闭环'}</small>
        </div>
      </section>

      <section className="digital-metric-section" aria-labelledby="v02-core-metric-title">
        <div className="digital-metric-heading">
          <div>
            <span>{'V0.2 看板'}</span>
            <h2 id="v02-core-metric-title">{'核心经营指标'}</h2>
          </div>
          <button onClick={onOpenV02}>
            {'查看完整看板'}
            <ArrowRight />
          </button>
        </div>
        <div className="digital-core-metric-grid">
          {v02CoreMetrics.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.name} onClick={onOpenV02}>
                <span className={`core-metric-icon ${item.tone}`}>
                  <Icon />
                </span>
                <span>
                  <small>{item.name}</small>
                  <strong>{item.value}</strong>
                  <em>{item.detail}</em>
                </span>
                <b className={item.tone}>{item.status}</b>
              </button>
            );
          })}
        </div>
      </section>

      <section
        className="digital-metric-section task-metric-section"
        aria-labelledby="digital-task-metric-title"
      >
        <div className="digital-metric-heading">
          <div>
            <span>{'工作统计'}</span>
            <h2 id="digital-task-metric-title">{'数字人任务指标'}</h2>
          </div>
          <p>{'本周实时更新'}</p>
        </div>
        <div className="digital-stat-grid">
          <button onClick={() => selectStage('close')}>
            <span className="stat-icon done">
              <Check />
            </span>
            <small>{'本周已完成工作'}</small>
            <strong>{128 + completedTasks}</strong>
            <em>{'较上周 +18'}</em>
          </button>
          <button onClick={() => selectStage('diagnose')}>
            <span className="stat-icon auto">
              <Sparkles />
            </span>
            <small>{'数字人自主完成'}</small>
            <strong>{'73'}</strong>
            <em>{'占全部工作 57%'}</em>
          </button>
          <button className="attention" onClick={() => selectStage('orchestrate')}>
            <span className="stat-icon review">
              <Users />
            </span>
            <small>{'待人工审核'}</small>
            <strong>{pendingReviews}</strong>
            <em>{'需要确认派发与责任人'}</em>
          </button>
          <button onClick={() => selectStage('investigate')}>
            <span className="stat-icon evidence">
              <ClipboardCheck />
            </span>
            <small>{'待人工补充信息'}</small>
            <strong>{'8'}</strong>
            <em>{'现场原因与处置结果'}</em>
          </button>
        </div>
      </section>

      <section className="digital-process-section">
        <div className="section-heading">
          <div>
            <span>{'工作步骤'}</span>
            <h2>{'数字人的异常闭环工作流'}</h2>
          </div>
          <p>{'左右滑动查看全部 · 点击环节进入功能页'}</p>
        </div>
        <div className="digital-execution-strip" aria-live="polite">
          <div className="execution-current">
            <span className="execution-live-dot" />
            <div>
              <small>{'持续执行中'}</small>
              <strong>
                {executionPulse % 2 === 0
                  ? '正在扫描指标变化与任务状态'
                  : '正在校验异常对象与责任人'}
              </strong>
            </div>
          </div>
          <div className="execution-meta">
            <span>
              <small>{'今日执行'}</small>
              <b>
                {scanRounds}
                {' 轮'}
              </b>
            </span>
            <span>
              <small>{'本轮状态'}</small>
              <b>{'4/5 环节并行'}</b>
            </span>
            <span>
              <small>{'下次扫描'}</small>
              <b>{scanCountdownLabel}</b>
            </span>
          </div>
          <div className="execution-activity-list">
            {executionActivities.map((item) => (
              <div key={item.text}>
                <time>{item.time}</time>
                <span>{item.text}</span>
                <b>{item.result}</b>
              </div>
            ))}
          </div>
        </div>
        <div className="digital-process">
          {stages.map((stage, index) => {
            const Icon = stage.icon;
            const runState =
              stage.id === 'dashboard'
                ? '执行中'
                : stage.id === 'orchestrate'
                  ? '等待人工'
                  : stage.id === 'investigate'
                    ? '跟踪中'
                    : stage.id === 'diagnose'
                      ? '本轮完成'
                      : '持续验收';
            return (
              <div className="process-node-wrap" key={stage.id}>
                <button
                  className={`process-node ${activeStage === stage.id ? 'active' : ''}`}
                  onClick={() => selectStage(stage.id)}
                  aria-pressed={activeStage === stage.id}
                >
                  <span className="process-index">{stage.index}</span>
                  <span className={`process-run-state state-${stage.id}`}>{runState}</span>
                  <span className="process-icon">
                    <Icon />
                  </span>
                  <strong>{stage.title}</strong>
                  <p>{stage.subtitle}</p>
                  <div>
                    <em>{stage.mode}</em>
                    <b>{stage.count}</b>
                  </div>
                </button>
                {index < stages.length - 1 && <ArrowRight className="process-arrow" />}
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel digital-stage-workspace" id="digital-stage-workspace">
        <header className="stage-header">
          <div>
            <span>
              {stages.find((stage) => stage.id === activeStage)?.index}
              {' · 当前工作环节'}
            </span>
            <h2>{stages.find((stage) => stage.id === activeStage)?.title}</h2>
          </div>
          <div className="stage-tabs">
            {stages.map((stage) => (
              <button
                className={activeStage === stage.id ? 'active' : ''}
                onClick={() => setActiveStage(stage.id)}
                key={stage.id}
              >
                {stage.index}
              </button>
            ))}
          </div>
        </header>

        {activeStage === 'dashboard' && (
          <div className="stage-content live-v02-stage">
            <div className="live-v02-heading">
              <div>
                <span>
                  <LayoutGrid />
                  {'实时复用 V0.2'}
                </span>
                <h3>{'产销协同管理看板'}</h3>
                <p>{'下方是 V0.2 的真实页面组件，指标、清单、任务和样式修改会自动同步到这里。'}</p>
              </div>
              <button onClick={onOpenV02}>
                {'独立打开 V0.2'}
                <ArrowRight />
              </button>
            </div>
            <button type="button" onClick={onOpenV02}>
              {'在当前工作台打开经营看板'}
              <ArrowRight />
            </button>
          </div>
        )}

        {activeStage === 'dashboard' && (
          <div className="stage-content dashboard-stage">
            <div className="embedded-dashboard-toolbar">
              <div>
                <span>
                  <LayoutGrid />
                  {'V0.2 看板运营'}
                </span>
                <strong>{'指标事实与异常入口'}</strong>
              </div>
              <div>
                <button>
                  <CalendarDays />
                  {'2026年8月'}
                  <ChevronDown />
                </button>
                <button>
                  {'W35 · 08.24–08.30'}
                  <ChevronDown />
                </button>
                <button className="open-v02" onClick={onOpenV02}>
                  {'进入完整看板'}
                  <ArrowRight />
                </button>
              </div>
            </div>
            <div className="embedded-summary">
              <div>
                <Sparkles />
                <span>
                  <strong>{'数字人本轮看板结论'}</strong>
                  <p>
                    {
                      '12 项指标中 4 项达标、7 项未达、1 项无目标观察；订单满足率和准交率为本轮优先诊断对象。'
                    }
                  </p>
                </span>
              </div>
              <button onClick={() => selectStage('diagnose')}>
                {'查看异常研判'}
                <ArrowRight />
              </button>
            </div>
            <div className="embedded-kpi-groups">
              {dashboardGroups.map((group) => (
                <section key={group.name}>
                  <header>
                    <strong>{group.name}</strong>
                    <span>
                      {group.metrics.filter((metric) => metric.state === '健康').length}
                      {'/'}
                      {group.metrics.length}
                      {' 健康'}
                    </span>
                  </header>
                  {group.metrics.map((metric) => (
                    <button
                      key={metric.name}
                      onClick={() => metric.state !== '健康' && selectStage('diagnose')}
                    >
                      <span>
                        <small>{metric.name}</small>
                        <strong>{metric.value}</strong>
                      </span>
                      <span>
                        <em
                          className={
                            metric.state === '健康'
                              ? 'healthy'
                              : metric.state === '预警'
                                ? 'warning'
                                : 'critical'
                          }
                        >
                          {metric.state}
                        </em>
                        <small>{metric.target}</small>
                      </span>
                    </button>
                  ))}
                </section>
              ))}
            </div>
            <div className="embedded-risk-board">
              <header>
                <div>
                  <span>{'异常指标清单'}</span>
                  <h3>{'按严重程度与目标差距排序'}</h3>
                </div>
                <button onClick={() => selectStage('diagnose')}>
                  {'全部进入诊断'}
                  <ArrowRight />
                </button>
              </header>
              <div className="embedded-risk-head">
                <span>{'排序'}</span>
                <span>{'分析对象'}</span>
                <span>{'异常指标'}</span>
                <span>{'当前值'}</span>
                <span>{'严重程度'}</span>
                <span>{'任务状态'}</span>
              </div>
              {[
                {
                  rank: '01',
                  target: '华东 × 预制食材',
                  metric: '订单满足率',
                  value: '65.55%',
                  level: '严重',
                  task: 'AI已生成草稿',
                },
                {
                  rank: '02',
                  target: '郑州基地',
                  metric: '准交率',
                  value: '83.28%',
                  level: '严重',
                  task: '待人工审核',
                },
                {
                  rank: '03',
                  target: '火锅料品类',
                  metric: '可发货天数',
                  value: '16.90天',
                  level: '预警',
                  task: '待人工审核',
                },
                {
                  rank: '04',
                  target: '西南基地',
                  metric: '作废率',
                  value: '8.48%',
                  level: '预警',
                  task: '调研中',
                },
              ].map((item) => (
                <button
                  className="embedded-risk-row"
                  key={item.rank}
                  onClick={() =>
                    selectStage(
                      item.task === '调研中'
                        ? 'investigate'
                        : item.task === '待人工审核'
                          ? 'orchestrate'
                          : 'diagnose',
                    )
                  }
                >
                  <strong>{item.rank}</strong>
                  <b>{item.target}</b>
                  <span>{item.metric}</span>
                  <span>{item.value}</span>
                  <em className={item.level === '严重' ? 'critical' : 'warning'}>{item.level}</em>
                  <span>{item.task}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {activeStage === 'diagnose' && (
          <div className="stage-content">
            <div className="stage-callout">
              <Sparkles />
              <div>
                <strong>{'数字人已完成本轮指标扫描'}</strong>
                <p>
                  {
                    '基于 V0.2 的指标卡、清单和任务状态识别到 2 项严重、2 项预警；以下分析只使用可见数据，缺失事实明确标注，不替代人工判断。'
                  }
                </p>
              </div>
              <button onClick={onOpenV02}>
                {'查看 V0.2 数据底座'}
                <ArrowRight />
              </button>
            </div>
            <div className="diagnosis-table">
              <div className="diagnosis-row head">
                <span>{'严重程度'}</span>
                <span>{'异常对象'}</span>
                <span>{'异常指标'}</span>
                <span>{'AI初步研判'}</span>
                <span>{'待补证据'}</span>
                <span>{'下一步'}</span>
              </div>
              {reviewItems.map((item) => (
                <div className="diagnosis-row" key={item.id}>
                  <em className={item.level === '严重' ? 'critical' : 'warning'}>{item.level}</em>
                  <strong>{item.target}</strong>
                  <b>{item.metric}</b>
                  <p>{item.reason}</p>
                  <span>{'现场原因 / 业务动作'}</span>
                  <button onClick={() => selectStage('orchestrate')}>{'进入编排'}</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeStage === 'orchestrate' && (
          <div className="stage-content">
            <div className="stage-callout human">
              <Users />
              <div>
                <strong>{'这里是当前最重要的人工决策点'}</strong>
                <p>
                  {
                    '数字人已经生成责任人、任务内容和时限建议。当前预警任务必须人工确认；严重任务可按规则自动派发，仍允许人工复核。'
                  }
                </p>
              </div>
              <span>
                {pendingReviews}
                {' 项待审核'}
              </span>
            </div>
            <div className="task-draft-list">
              {reviewItems.map((item) => {
                const approved = approvedDrafts.includes(item.id);
                return (
                  <article key={item.id} className={approved ? 'approved' : ''}>
                    <div className="task-draft-main">
                      <em className={item.level === '严重' ? 'critical' : 'warning'}>
                        {item.level}
                      </em>
                      <div>
                        <h3>
                          {item.target}
                          {' · '}
                          {item.metric}
                        </h3>
                        <p>{item.reason}</p>
                      </div>
                    </div>
                    <div className="task-draft-meta">
                      <span>
                        <small>{'AI推荐责任人'}</small>
                        <strong>{item.owner}</strong>
                      </span>
                      <span>
                        <small>{'建议完成时间'}</small>
                        <strong>{item.due}</strong>
                      </span>
                      <span>
                        <small>{'派发策略'}</small>
                        <strong>
                          {item.level === '严重' ? '规则允许自动派发' : '必须人工确认'}
                        </strong>
                      </span>
                    </div>
                    <div className="task-draft-actions">
                      <button className="secondary">{'调整任务'}</button>
                      <button
                        className="primary"
                        disabled={approved}
                        onClick={() => approveDraft(item.id)}
                      >
                        {approved ? (
                          <>
                            <Check />
                            {'已确认派发'}
                          </>
                        ) : (
                          '确认并派发'
                        )}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        )}

        {activeStage === 'investigate' && (
          <div className="stage-content">
            <div className="stage-callout evidence">
              <ClipboardCheck />
              <div>
                <strong>{'人补事实，数字人负责跟踪、校验和催办'}</strong>
                <p>
                  {
                    '暗数据不做臆测。现场人员补充根因、影响范围和措施后，数字人将更新任务进度并判断是否具备闭环条件。'
                  }
                </p>
              </div>
              <span>{'8 项进行中'}</span>
            </div>
            <div className="investigation-grid">
              {[
                {
                  name: '郑州准交率异常',
                  owner: '郑州交付负责人',
                  progress: 75,
                  missing: '待补：装车排队记录',
                  time: '剩余 6 小时',
                },
                {
                  name: '华东 × 预制食材满足率',
                  owner: '华东计划负责人',
                  progress: 48,
                  missing: '待补：促销增量确认',
                  time: '剩余 1 天',
                },
                {
                  name: '火锅料库存覆盖偏高',
                  owner: '火锅料计划负责人',
                  progress: 30,
                  missing: '待补：临期库存结构',
                  time: '剩余 2 天',
                },
              ].map((item) => (
                <article key={item.name}>
                  <div>
                    <strong>{item.name}</strong>
                    <em>{item.time}</em>
                  </div>
                  <p>
                    {'责任人：'}
                    {item.owner}
                  </p>
                  <div className="progress-track">
                    <i style={{ width: `${item.progress}%` }} />
                  </div>
                  <span>
                    {item.progress}
                    {'% · '}
                    {item.missing}
                  </span>
                  <button>{'补充调研结果'}</button>
                </article>
              ))}
            </div>
          </div>
        )}

        {activeStage === 'close' && (
          <div className="stage-content">
            <div className="stage-callout close">
              <Check />
              <div>
                <strong>{'不是“任务完成”，而是“指标恢复 + 经验沉淀”'}</strong>
                <p>
                  {
                    '验收通过后，完成原因、纠偏措施和验证结果会回传到任务与知识库，供下一次异常判断与自动处置复用。'
                  }
                </p>
              </div>
              <span>{'5 项待验收'}</span>
            </div>
            <div className="closure-list">
              {[
                {
                  name: '遂平水饺订单满足率',
                  result: '91.8% → 95.4%',
                  cause: '临时产能未纳入承诺量',
                  action: '补充双班产能并刷新 ATP',
                  state: '建议通过',
                },
                {
                  name: '西南作废率异常',
                  result: '8.48% → 6.32%',
                  cause: '渠道重复提报与审批延迟',
                  action: '合并需求并前置审批校验',
                  state: '继续观察',
                },
                {
                  name: '郑州装车延迟',
                  result: '平均延迟 2.5h → 0.7h',
                  cause: '波次集中且承运资源不足',
                  action: '拆分波次并增补承运资源',
                  state: '建议通过',
                },
              ].map((item) => (
                <article key={item.name}>
                  <div>
                    <strong>{item.name}</strong>
                    <em className={item.state === '建议通过' ? 'good' : 'watch'}>{item.state}</em>
                  </div>
                  <b>{item.result}</b>
                  <p>
                    <span>{'确认根因'}</span>
                    {item.cause}
                  </p>
                  <p>
                    <span>{'有效措施'}</span>
                    {item.action}
                  </p>
                  <div>
                    <button className="secondary">{'退回补充'}</button>
                    <button className="primary">{'确认闭环'}</button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="digital-evolution panel">
        <div>
          <span>{'自治演进'}</span>
          <h2>{'人不是退出闭环，而是从执行者转为规则制定者与例外决策者'}</h2>
        </div>
        <div className="evolution-steps">
          <article className="current">
            <i>{'现在'}</i>
            <strong>{'人机协同'}</strong>
            <p>{'AI识别与建议，人确认派发、补充暗数据并验收。'}</p>
          </article>
          <ArrowRight />
          <article>
            <i>{'下一阶段'}</i>
            <strong>{'规则内自治'}</strong>
            <p>{'成熟规则下自动派发、催办和初步验收，例外升级给人。'}</p>
          </article>
          <ArrowRight />
          <article>
            <i>{'目标态'}</i>
            <strong>{'自主闭环'}</strong>
            <p>{'数字人自主完成常规闭环，人负责策略、授权和重大例外。'}</p>
          </article>
        </div>
      </section>
      {notice && (
        <div className="digital-notice">
          <Check />
          {notice}
        </div>
      )}
    </div>
  );
}

export default function Home({
  initialWorkspace = 'intelligent',
  embedMode = false,
  liveData = false,
}: { initialWorkspace?: WorkspaceName; embedMode?: boolean; liveData?: boolean } = {}) {
  const [matrixMode, setMatrixMode] = usePageViewField<MatrixMode>(
    React,
    apsView,
    'matrixMode',
    'rate',
  );
  const [selectedBase, setSelectedBase] = usePageViewField(
    React,
    apsView,
    'selectedBase',
    '全部基地',
  );
  const [overviewRiskPerspective, setOverviewRiskPerspective] = useState<'production' | 'sales'>(
    'production',
  );
  const [salesRiskLevel, setSalesRiskLevel] = useState<'大区' | '省区' | '销售组'>('大区');
  const [baseTab, setBaseTab] = usePageViewField<BaseMetricTab>(
    React,
    apsView,
    'baseTab',
    'overview',
  );
  const [selectedBaseRowKey, setSelectedBaseRowKey] = usePageViewField(
    React,
    apsView,
    'selectedBaseRowKey',
    '',
  );
  const [expandedBaseRows, setExpandedBaseRows] = useState<string[]>(['华东']);
  const [expandedBaseCategoryRows, setExpandedBaseCategoryRows] = useState<string[]>([
    '华东::休闲',
  ]);
  const [expandedBaseItemRows, setExpandedBaseItemRows] = useState<string[]>([
    '华东::休闲::饼类系列',
  ]);
  const [search, _setSearch] = usePageViewField(React, apsView, 'search', '');
  const [dateOpen, setDateOpen] = useState(false);
  const [weekOpen, setWeekOpen] = useState(false);
  const [selectedYearKey, setSelectedYearKey] = usePageViewField(
    React,
    apsView,
    'selectedYearKey',
    liveData && !APS_MOCK ? String(new Date().getFullYear()) : '2026',
  );
  const [selectedMonthKey, setSelectedMonthKey] = usePageViewField(
    React,
    apsView,
    'selectedMonthKey',
    liveData && !APS_MOCK ? String(new Date().getMonth() + 1).padStart(2, '0') : '08',
  );
  const [selectedWeekKey, setSelectedWeekKey] = usePageViewField(
    React,
    apsView,
    'selectedWeekKey',
    '2026-W35',
  );
  const [selectedDay, setSelectedDay] = usePageViewField(
    React,
    apsView,
    'selectedDay',
    liveData && !APS_MOCK ? new Date().getDate() : 30,
  );
  const [timeGranularity, setTimeGranularity] = usePageViewField<TimeGranularity>(
    React,
    apsView,
    'timeGranularity',
    'month',
  );
  const [toast, setToast] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<
    Array<{ role: 'user' | 'assistant'; text: string; contexts?: string[] }>
  >([]);
  const [contextSelectionMode, setContextSelectionMode] = useState(false);
  const [selectedContexts, setSelectedContexts] = useState<DashboardContext[]>([]);
  const [chatMode, setChatMode] = useState<'collapsed' | 'sidebar' | 'expanded'>('sidebar');
  const [chatWidth, setChatWidth] = usePageViewField(React, apsView, 'chatWidth', 360);
  const [agentDetailsOpen, setAgentDetailsOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [selectedExportSections, setSelectedExportSections] = useState<string[]>([
    '核心指标',
    '指标明细',
  ]);
  const [sidebarCollapsed, setSidebarCollapsed] = usePageViewField(
    React,
    apsView,
    'sidebarCollapsed',
    false,
  );
  const [activeWorkspace, setActiveWorkspace] = usePageViewField<WorkspaceName>(
    React,
    apsView,
    'activeWorkspace',
    initialWorkspace,
  );
  const [salesPlanRunId, setSalesPlanRunId] = useState(0);
  const [analysisScope, setAnalysisScope] = usePageViewField<AnalysisScope>(
    React,
    apsView,
    'analysisScope',
    'overview',
  );
  const [productionDimension, setProductionDimension] = usePageViewField<ProductionDimension>(
    React,
    apsView,
    'productionDimension',
    'category',
  );
  const [salesMetricTab, setSalesMetricTab] = usePageViewField<SalesMetricTab>(
    React,
    apsView,
    'salesMetricTab',
    'overview',
  );
  const [selectedSalesOrg, setSelectedSalesOrg] = usePageViewField(
    React,
    apsView,
    'selectedSalesOrg',
    '',
  );
  const [expandedSalesRegions, setExpandedSalesRegions] = useState<string[]>(['华南事业部']);
  const [expandedSalesProvinces, setExpandedSalesProvinces] = useState<string[]>([
    '华南事业部::粤海经销省区',
  ]);
  const [selectedMetric, setSelectedMetric] = usePageViewField<OverviewMetricName | null>(
    React,
    apsView,
    'selectedMetric',
    null,
  );
  const [categoryTab, setCategoryTab] = usePageViewField<CategoryMetricTab>(
    React,
    apsView,
    'categoryTab',
    'overview',
  );
  const [selectedCategory, setSelectedCategory] = usePageViewField(
    React,
    apsView,
    'selectedCategory',
    '',
  );
  const [selectedCategoryRowKey, setSelectedCategoryRowKey] = usePageViewField(
    React,
    apsView,
    'selectedCategoryRowKey',
    '',
  );
  const [expandedCategoryListCategories, setExpandedCategoryListCategories] = useState<string[]>(
    [],
  );
  const [expandedCategoryListItems, setExpandedCategoryListItems] = useState<string[]>([]);
  const [assignedTasks, setAssignedTasks] = useState<AssignedTask[]>([]);
  const _completedTaskCount = assignedTasks.filter((task) => task.status === '已完成').length;
  const [taskTarget, setTaskTarget] = useState<{
    scopeType: TaskScope;
    scope: string;
    anomalies: string[];
    taskId?: string;
    linkedFrom?: string;
  } | null>(null);
  const [taskDraft, setTaskDraft] = useState({ metric: '', owner: '', content: '', due: '' });
  const [completionTargetId, setCompletionTargetId] = useState<string | null>(null);
  const [completionDraft, setCompletionDraft] = useState('');
  const currentWorkspace = workspaceMeta[activeWorkspace];
  const activeScopeHelp = scopeHelp[analysisScope];
  const activeCrossMode = matrixMode === 'delivery' ? 'rate' : matrixMode;
  const activeMatrixHelp = matrixHelp[activeCrossMode];
  const activeMatrixListMeta = matrixListMeta[activeCrossMode];
  const selectedYear =
    yearOptions.find((item) => item.key === selectedYearKey) || yearOptions[yearOptions.length - 1];
  const selectedMonth =
    monthOptions.find((item) => item.key === selectedMonthKey) || monthOptions[0];
  const daysInSelectedMonth = new Date(Number(selectedYear.key), selectedMonth.value, 0).getDate();
  const dayOptions = Array.from({ length: daysInSelectedMonth }, (_, index) => index + 1);
  const naturalWeekOptions = buildNaturalWeeks(Number(selectedYear.key), selectedMonth.value);
  const selectedWeek =
    naturalWeekOptions.find((item) => item.key === selectedWeekKey) ||
    naturalWeekOptions.find((item) => selectedDay >= item.startDay && selectedDay <= item.endDay) ||
    naturalWeekOptions[naturalWeekOptions.length - 1];
  const selectedPeriodLabel = `${selectedYear.label}${selectedMonth.label}`;
  const selectedDateLabel = `${selectedPeriodLabel}${selectedDay}日`;
  const selectedPeriodEndDay = timeGranularity === 'week' ? selectedWeek.endDay : selectedDay;
  const effectiveEnd = liveData
    ? effectivePeriodEnd(Number(selectedYear.key), selectedMonth.value, selectedPeriodEndDay)
    : {
        year: Number(selectedYear.key),
        month: selectedMonth.value,
        day: selectedPeriodEndDay,
        iso: `${selectedYear.key}-${selectedMonth.key}-${String(selectedPeriodEndDay).padStart(2, '0')}`,
      };
  const effectiveDateLabel = `${effectiveEnd.year}年${effectiveEnd.month}月${effectiveEnd.day}日`;
  const weekStartLabel = `${selectedMonth.key}.${String(selectedWeek.startDay).padStart(2, '0')}`;
  const weekEndLabel = `${String(effectiveEnd.month).padStart(2, '0')}.${String(effectiveEnd.day).padStart(2, '0')}`;
  const effectiveWeekRange = `${weekStartLabel}–${weekEndLabel}`;
  const periodMeta = {
    year: {
      label: '年度累计',
      shortLabel: '年度',
      current: '本年累计',
      previous: '去年同期',
      change: '同比变化',
      same: '前年同期',
      yoy: '较前年',
      range: `${effectiveEnd.year}.01.01—${effectiveEnd.iso.replaceAll('-', '.')}`,
    },
    month: {
      label: '月度累计',
      shortLabel: '月度',
      current: '本月累计',
      previous: '上月同期',
      change: '环比变化',
      same: '去年同月同期',
      yoy: '同比变化',
      range: `${effectiveEnd.year}.${String(effectiveEnd.month).padStart(2, '0')}.01—${effectiveEnd.iso.replaceAll('-', '.')}`,
    },
    week: {
      label: '周度累计',
      shortLabel: '周度',
      current: '本周累计',
      previous: '上周同期',
      change: '周环比',
      same: '去年同周同期',
      yoy: '同比变化',
      range: `${selectedYear.key} ${selectedWeek.label}（${effectiveWeekRange}）`,
    },
    day: {
      label: '日度',
      shortLabel: '日度',
      current: '当日',
      previous: '前一日',
      change: '较前日',
      same: '去年同日',
      yoy: '同比变化',
      range: effectiveDateLabel,
    },
  }[timeGranularity];
  const dataCutoff = effectiveEnd.iso.replaceAll('-', '.');
  const activeAnalysisPeriod =
    timeGranularityOptions.find((item) => item.key === timeGranularity)?.label || periodMeta.label;
  const _overviewPeriodLabel = activeAnalysisPeriod;
  const liveDate = effectiveEnd.iso;
  const live = useWorkspace(
    liveData && ['intelligent', 'plan'].includes(activeWorkspace),
    liveDate,
    timeGranularity,
  );
  const attainmentTarget =
    timeGranularity === 'month' ? ((effectiveEnd.day - 1) / daysInSelectedMonth) * 100 - 3 : null;
  const metricMetaWithDynamicTargets = demoOverviewMetricMeta.map((meta) =>
    ['销售提报达成率', '需求预测达成率'].includes(meta.name)
      ? {
          ...meta,
          target: attainmentTarget,
          targetText:
            attainmentTarget === null
              ? '仅确认月度口径'
              : `健康 > ${formatNumber(attainmentTarget, 2)}%（动态）`,
        }
      : meta,
  );
  const confirmedLiveTargets = new Set<OverviewMetricName>([
    '销售预算达成率',
    '销售提报准确率',
    '销售提报达成率',
    '需求预测准确率',
    '需求预测达成率',
    '生产计划达成率',
    '订单满足率',
    '订单缺货量',
    '可发货天数',
  ]);
  const overviewMetricMeta = liveData
    ? metricMetaWithDynamicTargets.map((meta) =>
        confirmedLiveTargets.has(meta.name) || meta.target === null
          ? meta
          : { ...meta, target: null, targetText: '目标待确认' },
      )
    : metricMetaWithDynamicTargets;
  const liveMetricNotes = useMemo(() => (live.data ? deriveMetrics(live.data) : {}), [live.data]);
  const liveScope = selectedBase === '全部基地' ? {} : { base: selectedBase };
  const scopedLiveValues = useMemo(
    () => createMetricReader(live.data, live.previous, live.annual),
    [live.data, live.previous, live.annual],
  );
  const categoryDrillMetrics = (
    category: string,
    item?: string,
    material?: string,
  ): ProductionDrillValues =>
    liveData
      ? scopedLiveValues({ ...liveScope, category, item, material })
      : demoCategoryDrillMetrics(category, item, material);
  const baseDrillMetrics = (
    base: string,
    category?: string,
    item?: string,
    material?: string,
  ): ProductionDrillValues =>
    liveData
      ? scopedLiveValues({
          base,
          item: category,
          category: item?.endsWith('系列') ? item.slice(0, -2) : undefined,
          material,
        })
      : demoBaseDrillMetrics(base, category, item, material);
  const baseCategoryProductItems = (name: string): BaseProductItem[] =>
    liveData
      ? baseProductHierarchy.flatMap((category) =>
          category.items
            .filter((item) => item.name === name)
            .map((item) => ({ name: `${category.name}系列`, materials: item.materials })),
        )
      : demoBaseCategoryProductItems(name);
  const salesOrgMetrics = (path: string) => {
    if (!liveData) return demoSalesOrgMetrics(path);
    const [region, second, third] = path.split(' / ');
    const parent = salesOrgHierarchy.find((node) => node.name === region);
    const child = parent?.children?.find((node) => node.name === second);
    const scope = {
      region,
      province: child?.children?.length ? second : undefined,
      sales_group: third ?? (second && !child?.children?.length ? second : undefined),
    };
    const values = scopedLiveValues(scope),
      comparison = values.__comparison;
    return {
      budget: values['销售预算达成率'],
      reporting: values['销售提报准确率'],
      sales: values.__sales,
      budgetPrevious: comparison['销售预算达成率'].previous,
      reportingPrevious: comparison['销售提报准确率'].previous,
    };
  };
  const adjustedStockValue = (base: string, index: number) =>
    liveData ? NaN : demoAdjustedStockValue(base, index);
  const activeComparison = liveData
    ? scopedLiveValues(liveScope).__comparison
    : timeGranularity === 'year'
      ? yearlyComparison
      : timeGranularity === 'week'
        ? weeklyComparison
        : timeGranularity === 'day'
          ? dailyComparison
          : monthlyComparison;
  const availableTimeGranularities =
    analysisScope === 'overview' ? timeGranularityOptions.slice(0, 2) : timeGranularityOptions;
  const activeTimeGranularityIndex = Math.max(
    0,
    availableTimeGranularities.findIndex((item) => item.key === timeGranularity),
  );
  const periodConfig = {
    current: Object.fromEntries(
      overviewMetricMeta.map((item) => [item.name, activeComparison[item.name].current]),
    ) as OverviewMetricSnapshot,
    previous: Object.fromEntries(
      overviewMetricMeta.map((item) => [item.name, activeComparison[item.name].previous]),
    ) as OverviewMetricSnapshot,
    relation: `${periodMeta.label}口径`,
  };
  const categoryTabMetric: Partial<Record<CategoryMetricTab, ProductionDrillMetricName>> = {
    forecast: '需求预测准确率',
    plan: '生产计划达成率',
    inventory: '库存量',
    stock: '可发货天数',
    shortage: '订单缺货量',
    satisfaction: '订单满足率',
  };
  const activeCategoryMetric = categoryTabMetric[categoryTab];
  const activeBaseMetric = categoryTabMetric[baseTab];
  const categoryPeriodDatum = (
    name: ProductionDrillMetricName,
    values: ProductionDrillValues,
  ): ComparisonDatum => {
    if (liveData)
      return (
        (values as ProductionDrillValues & { __comparison?: Record<string, ComparisonDatum> })
          .__comparison?.[name] ?? {
          current: values[name],
          previous: NaN,
          change: NaN,
          same: null,
          yoy: null,
        }
      );
    const reference = activeComparison[name];
    const monthlyReference = monthlyComparison[name];
    const isPercentage =
      name === '需求预测准确率' || name === '生产计划达成率' || name === '订单满足率';
    const normalize = (value: number) =>
      isPercentage ? Math.min(100, Math.max(0, value)) : Math.max(0, value);
    const current = normalize(values[name] * (reference.current / monthlyReference.current));
    const previous = normalize(current * (reference.previous / reference.current));
    const same =
      reference.same === null ? null : normalize(current * (reference.same / reference.current));
    return {
      current,
      previous,
      change: current - previous,
      same,
      yoy: same === null ? null : current - same,
    };
  };
  const activeProductionMetricNames = productionMetricNames.filter((metricName) =>
    productionMetricGranularities[metricName].includes(timeGranularity),
  );
  const activeProductionMetricTabs = productionMetricTabs.filter((item) =>
    productionMetricGranularities[item.label].includes(timeGranularity),
  );
  const activeCrossMatrixModes = crossMatrixModes.filter((mode) =>
    productionMetricGranularities[crossMetricByMode[mode]].includes(timeGranularity),
  );
  const matrixPeriodRatio = (mode: MatrixMode) => {
    if (liveData) return 1;
    if (!crossMatrixModes.some((item) => item === mode)) return 1;
    const metric = crossMetricByMode[mode as (typeof crossMatrixModes)[number]];
    return activeComparison[metric].current / monthlyComparison[metric].current;
  };
  const buildPeriodMatrixRiskRows = (mode: MatrixMode) =>
    (liveData
      ? matrixCellsFromData(live.data, matrixListMeta[mode].label).map((cell) => ({
          scope: cell.scope,
          value: cell.value,
          gap: cell.value - (mode === 'stock' ? 12 : mode === 'rate' ? 95 : 0),
          level: matrixRiskLevel(mode, cell.value),
          adjusted: undefined,
          granularity: '基地 × 品类' as const,
        }))
      : buildMatrixRiskRows(mode)
    )
      .map((row) => {
        const ratio = matrixPeriodRatio(mode);
        const value = Math.max(0, row.value * ratio);
        const adjusted = row.adjusted === undefined ? undefined : Math.max(0, row.adjusted * ratio);
        const target = mode === 'stock' ? 12 : mode === 'rate' ? 95 : mode === 'plan' ? 100 : 0;
        return {
          ...row,
          value,
          adjusted,
          gap: value - target,
          level: matrixRiskLevel(mode, value),
        };
      })
      .sort((a, b) => (mode === 'stock' || mode === 'inventory' ? b.gap - a.gap : a.gap - b.gap));
  const matrixRiskRows = buildPeriodMatrixRiskRows(activeCrossMode);
  const matrixAnalysis = matrixRiskRows.length
    ? analyzeProductionMatrix(
        activeMatrixListMeta.label,
        activeAnalysisPeriod,
        matrixRiskRows.map((row) => ({ scope: row.scope, value: row.value })),
      )
    : analyzePerspective(
        'production',
        activeAnalysisPeriod,
        activeProductionMetricNames.map((name) => ({
          name,
          value: activeComparison[name].current,
          unit: overviewMetricMeta.find((meta) => meta.name === name)?.unit ?? '',
          previous: activeComparison[name].previous,
        })),
      );
  const matrixBaseNames = liveData
    ? [...new Set(matrixRiskRows.map((row) => row.scope.split(' × ')[0]))]
    : [];
  const matrixCategoryNames = liveData
    ? [...new Set(matrixRiskRows.map((row) => row.scope.split(' × ')[1]))]
    : categories;
  const sourceMatrix = liveData
    ? matrixBaseNames.map((base) => ({
        base,
        values: matrixCategoryNames.map(
          (category) =>
            matrixRiskRows.find((row) => row.scope === `${base} × ${category}`)?.value ?? NaN,
        ),
      }))
    : activeCrossMode === 'rate'
      ? satisfaction
      : activeCrossMode === 'stock'
        ? inventory
        : null;
  const matrix = sourceMatrix?.length
    ? sourceMatrix.map((row) => ({
        ...row,
        values: row.values.map((value) => Math.max(0, value * matrixPeriodRatio(activeCrossMode))),
      }))
    : null;
  const planRiskItems = activeCrossMatrixModes
    .flatMap((mode) =>
      buildPeriodMatrixRiskRows(mode)
        .slice(0, 3)
        .map((row, index) => ({ mode, row, meta: matrixListMeta[mode], metricRank: index + 1 })),
    )
    .filter(
      (item) =>
        (selectedBase === '全部基地' || item.row.scope.includes(selectedBase)) &&
        `${item.row.scope}${item.meta.label}`.includes(search),
    );
  const _planRiskGroups = activeCrossMatrixModes.map((mode) => ({
    mode,
    meta: matrixListMeta[mode],
    items: planRiskItems.filter((item) => item.mode === mode),
  }));
  useEffect(() => {
    if (activeCategoryMetric && !activeProductionMetricNames.includes(activeCategoryMetric))
      setCategoryTab('overview');
    if (activeBaseMetric && !activeProductionMetricNames.includes(activeBaseMetric))
      setBaseTab('overview');
    if (!activeCrossMatrixModes.some((item) => item === activeCrossMode))
      setMatrixMode(activeCrossMatrixModes[0] || 'plan');
  }, [
    activeBaseMetric,
    activeCategoryMetric,
    activeCrossMatrixModes,
    activeCrossMode,
    activeProductionMetricNames,
  ]);
  const categoryMetricMeta = activeCategoryMetric
    ? overviewMetricMeta.find((meta) => meta.name === activeCategoryMetric)
    : undefined;
  const baseMetricMeta = activeBaseMetric
    ? overviewMetricMeta.find((meta) => meta.name === activeBaseMetric)
    : undefined;
  const _insightCopy: Record<MetricName, string> = {
    作废率: '作废率较8.23累计上升1.25pp，但仍在6%目标内；西南8.48%已成为主要风险点。',
    改单率: '改单率由2.37%升至2.80%，继续高于2%目标；华东、华南与遂平恶化较明显。',
    订单满足率: '订单满足率由92.71%降至92.07%，五大基地全部未达95%；水饺与预制食材仍是主要缺口。',
    准交率: '准交率由94.37%降至93.05%，郑州进一步降至83.28%，是拖累整体履约的核心基地。',
    可发货天数: '整体由10.85天下降至10.23天，处于目标内；火锅料仍有16.90天，结构性高库存尚未消除。',
  };
  const periodKpis = overviewMetricMeta.map((meta) => {
    const value = periodConfig.current[meta.name];
    const previous = periodConfig.previous[meta.name];
    const delta = activeComparison[meta.name].change;
    const ok =
      !Number.isFinite(value) || meta.target === null
        ? null
        : meta.lowerBetter
          ? meta.target === 0
            ? value <= 0
            : value < meta.target
          : value > meta.target;
    const improved = meta.lowerBetter ? delta < 0 : delta > 0;
    return {
      ...meta,
      value,
      previous,
      delta,
      same: activeComparison[meta.name].same,
      yoy: activeComparison[meta.name].yoy,
      ok,
      improved,
    };
  });
  const scopedMetricNames =
    analysisScope === 'sales'
      ? overviewMetricGroups[0].names
      : analysisScope === 'production'
        ? productionMetricNames.filter((metricName) =>
            productionMetricGranularities[metricName].includes(timeGranularity),
          )
        : overviewBusinessMetricNames;
  const scopedPeriodKpis = scopedMetricNames
    .map((metricName) => periodKpis.find((kpi) => kpi.name === metricName))
    .filter((kpi): kpi is (typeof periodKpis)[number] => Boolean(kpi));
  const scopedOverviewMetricMeta = scopedMetricNames
    .map((metricName) => overviewMetricMeta.find((meta) => meta.name === metricName))
    .filter((meta): meta is (typeof overviewMetricMeta)[number] => Boolean(meta));
  const productionKpiGroups = (['经营指标', '运营指标'] as const)
    .map((label) => ({
      label,
      description: label === '经营指标' ? '总览视角同步指标' : '生产专项运营指标',
      kpis: scopedPeriodKpis.filter((kpi) => productionMetricClass(kpi.name) === label),
    }))
    .filter((group) => group.kpis.length > 0);
  const salesKpiGroups = (['经营指标', '运营指标'] as const)
    .map((label) => ({
      label,
      description: label === '经营指标' ? '总览视角同步指标' : '销售专项运营指标',
      kpis: scopedPeriodKpis.filter(
        (kpi) => kpi.name !== '销售提报达成率' && productionMetricClass(kpi.name) === label,
      ),
    }))
    .filter((group) => group.kpis.length > 0);
  const activeMetricListVariant =
    analysisScope === 'overview'
      ? 'with-statistic-type'
      : analysisScope === 'production'
        ? 'with-metric-classification'
        : '';
  const _targetKpis = periodKpis.filter((item) => item.target !== null);
  const _targetlessKpis = periodKpis.filter((item) => item.target === null);
  const overviewBusinessKpis = periodKpis.filter((item) =>
    overviewBusinessMetricNames.includes(item.name),
  );
  const _overviewBusinessTargetKpis = overviewBusinessKpis.filter((item) => item.target !== null);
  const _overviewBusinessTargetlessKpis = overviewBusinessKpis.filter(
    (item) => item.target === null,
  );
  const _salesKpis = periodKpis.filter((item) => overviewMetricGroups[0].names.includes(item.name));
  const _productionKpis = periodKpis.filter(
    (item) =>
      productionMetricNames.includes(item.name as ProductionDrillMetricName) &&
      productionMetricGranularities[item.name as ProductionDrillMetricName].includes(
        timeGranularity,
      ),
  );
  const promptAnalysis = analyzePerspective(
    analysisScope,
    activeAnalysisPeriod,
    scopedPeriodKpis.map((item) => ({
      name: item.name,
      value: item.value,
      unit: item.unit,
      previous: item.previous,
    })),
  );
  const scopeSummary = {
    tag:
      analysisScope === 'sales'
        ? 'AI 销售视角研判摘要'
        : analysisScope === 'production'
          ? 'AI 生产视角研判摘要'
          : 'AI 经营指标研判摘要',
    score: promptAnalysis.score,
    total: promptAnalysis.total,
    label: '可评价指标健康',
    copy: promptAnalysis.copy,
  };
  const dashboardContextOptions = [
    {
      id: 'summary',
      scope: '总览',
      label: 'AI 研判摘要',
      summary: `${promptAnalysis.title}。${promptAnalysis.copy}建议追问：${promptAnalysis.question}`,
    },
    {
      id: 'kpi',
      scope: '总览',
      label: '产销协同指标对比',
      summary: periodKpis
        .map(
          (item) =>
            `${item.name}${formatNumber(item.value, 2)}${item.unit}（${item.targetText}${item.ok === null ? '' : `，${item.ok ? '达标' : '未达'}`}）`,
        )
        .join('；'),
    },
    {
      id: 'category',
      scope: '品类',
      label: '品类四指标达成看板',
      summary: `订单满足率风险：水饺85.87%、预制食材86.93%、火锅料93.63%；火锅料可发货天数16.90天。准交率按订单口径管理。`,
    },
    {
      id: 'base',
      scope: '基地',
      label: '基地六指标达成看板',
      summary: `五大基地订单满足率均低于95%目标；可继续按基地展开到品类，并逐指标查看周期明细。`,
    },
    {
      id: 'cross',
      scope: '交叉分析',
      label: '基地 × 品类指标矩阵',
      summary: `${matrixAnalysis.title}。${matrixAnalysis.copy}建议追问：${matrixAnalysis.question}`,
    },
    {
      id: 'detail',
      scope: '指标清单',
      label: `${periodMeta.label}指标明细`,
      summary: `展示${periodMeta.range}的${periodMeta.label}数据，包含上一周期、变化量、同期和同比。`,
    },
    {
      id: 'risk',
      scope: '风险诊断',
      label:
        analysisScope === 'production'
          ? '生产风险清单'
          : analysisScope === 'sales'
            ? '销售风险清单'
            : '产销协同重点风险',
      summary: `按风险等级与目标差距排序，展示当前${analysisScope === 'production' ? (productionDimension === 'category' ? '品类' : productionDimension === 'base' ? '基地' : '基地 × 品类交叉') : analysisScope === 'sales' ? '销售组织' : '产销协同'}风险及任务操作。`,
    },
  ];
  const formatDelta = (delta: number, unit: MetricUnit) =>
    !Number.isFinite(delta)
      ? '—'
      : `${delta > 0 ? '+' : ''}${formatNumber(delta, 2)}${unit === '%' ? 'pp' : unit}`;
  const categoryTabForMetric: Partial<Record<OverviewMetricName, CategoryMetricTab>> = {
    需求预测准确率: 'forecast',
    生产计划达成率: 'plan',
    库存量: 'inventory',
    可发货天数: 'stock',
    订单缺货量: 'shortage',
    订单满足率: 'satisfaction',
  };
  const scrollToDashboardList = (targetId: string, block: ScrollLogicalPosition = 'start') => {
    setTimeout(() => {
      const target = document.getElementById(targetId);
      if (!target) return;
      target.scrollIntoView({ behavior: 'smooth', block });
    }, 80);
  };
  const selectOverviewMetric = (metric: OverviewMetricName) => {
    setSelectedMetric(metric);
    scrollToDashboardList('overview-detail-list');
  };
  const renderPeriodKpiCard = (kpi: (typeof periodKpis)[number]) => (
    <article
      role="button"
      tabIndex={0}
      aria-pressed={selectedMetric === kpi.name}
      className={`kpi-card period-kpi-card ${selectedMetric === kpi.name ? 'selected' : ''}`}
      onClick={() => selectOverviewMetric(kpi.name)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') selectOverviewMetric(kpi.name);
      }}
      key={kpi.name}
    >
      <EditableHelp
        key={`metric-help-${kpi.name}`}
        compact
        storageKey={`plan-metric-help-${kpi.name}`}
        {...metricHelpIdentity[kpi.name]}
        label={`查看并编辑${kpi.name}指标说明`}
        defaultText={
          liveData ? liveMetricNotes[kpi.name]?.note || metricHelp[kpi.name] : metricHelp[kpi.name]
        }
      />
      <div className="kpi-name">
        <span>{kpi.name}</span>
        <i
          className={`achievement-status ${kpi.ok === null ? 'status-neutral' : kpi.ok ? 'status-ok' : 'status-bad'}`}
        >
          {!Number.isFinite(kpi.value)
            ? '开发中'
            : kpi.ok === null
              ? liveData
                ? '已更新'
                : '无目标'
              : kpi.ok
                ? '达标'
                : '未达'}
        </i>
      </div>
      <div
        className={`kpi-period-label ${metricStatisticType(kpi.name) === '快照指标' ? 'snapshot' : 'cumulative'}`}
      >
        <span>{metricStatisticType(kpi.name)}</span>
        {metricStatisticType(kpi.name) === '快照指标'
          ? `最新快照 · 截至${dataCutoff}`
          : periodMeta.current}
      </div>
      <div className="kpi-value">
        <strong>{formatNumber(kpi.value, 2)}</strong>
        <span>{kpi.unit}</span>
      </div>
      <div className="kpi-comparison-head">
        <span>{'对比指标'}</span>
        <span>{'变化量'}</span>
      </div>
      <div className="kpi-comparison-grid">
        <div className="comparison-values">
          <span>
            {periodMeta.previous} {formatNumber(kpi.previous, 2)}
            {kpi.unit}
          </span>
          <span>
            {periodMeta.same} {kpi.same === null ? '—' : `${formatNumber(kpi.same, 2)}${kpi.unit}`}
          </span>
        </div>
        <div className="comparison-deltas">
          <b className={kpi.delta < 0 ? 'trend-down' : kpi.delta > 0 ? 'trend-up' : 'trend-flat'}>
            {kpi.delta < 0 ? <TrendingDown /> : kpi.delta > 0 ? <TrendingUp /> : null}
            {periodMeta.change} {formatDelta(kpi.delta, kpi.unit)}
          </b>
          <b
            className={
              kpi.yoy === null
                ? 'trend-flat'
                : kpi.yoy < 0
                  ? 'trend-down'
                  : kpi.yoy > 0
                    ? 'trend-up'
                    : 'trend-flat'
            }
          >
            {kpi.yoy === null ? (
              `${periodMeta.yoy} —`
            ) : (
              <>
                {kpi.yoy < 0 ? <TrendingDown /> : kpi.yoy > 0 ? <TrendingUp /> : null}
                {periodMeta.yoy} {formatDelta(kpi.yoy, kpi.unit)}
              </>
            )}
          </b>
        </div>
      </div>
      <div className="kpi-foot">
        <span>{kpi.targetText}</span>
        {kpi.target === null ? (
          <b className="neutral">
            {liveData && kpi.name !== '库存量' ? '待配置目标' : '数量观察项'}
          </b>
        ) : (
          <b className={kpi.ok ? 'good' : 'bad'}>
            {'差距 '}
            {formatDelta(kpi.value - kpi.target, kpi.unit)}
          </b>
        )}
      </div>
    </article>
  );
  const selectCategory = (name: string, metric?: OverviewMetricName) => {
    const directCategory = baseProductHierarchy.find((category) => category.name === name);
    const itemCategory = directCategory
      ? undefined
      : baseProductHierarchy.find((category) => category.items.some((item) => item.name === name));
    const parentCategory = directCategory || itemCategory;
    const rowKey = directCategory
      ? directCategory.name
      : itemCategory
        ? `${itemCategory.name}::${name}`
        : name;
    setSelectedCategory(name);
    setSelectedCategoryRowKey(rowKey);
    if (parentCategory)
      setExpandedCategoryListCategories((current) =>
        current.includes(parentCategory.name) ? current : [...current, parentCategory.name],
      );
    setCategoryTab(metric ? categoryTabForMetric[metric] || 'overview' : 'overview');
    scrollToDashboardList(`category-row-${stableMetricSeed(rowKey)}`, 'center');
  };
  const toggleCategoryListCategory = (category: string) => {
    setExpandedCategoryListCategories((current) =>
      current.includes(category)
        ? current.filter((item) => item !== category)
        : [...current, category],
    );
  };
  const toggleCategoryListItem = (category: string, item: string) => {
    const key = `${category}::${item}`;
    setExpandedCategoryListItems((current) =>
      current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key],
    );
  };
  const selectBaseCard = (name: string, metric?: OverviewMetricName) => {
    setSelectedBase(name);
    setSelectedBaseRowKey(name);
    setExpandedBaseRows((current) => (current.includes(name) ? current : [...current, name]));
    setBaseTab(metric ? categoryTabForMetric[metric] || 'overview' : 'overview');
    scrollToDashboardList(`base-row-${stableMetricSeed(name)}`, 'center');
  };
  const toggleBaseRow = (base: string) => {
    setExpandedBaseRows((current) =>
      current.includes(base) ? current.filter((item) => item !== base) : [...current, base],
    );
  };
  const toggleBaseCategoryRow = (base: string, category: string) => {
    const key = `${base}::${category}`;
    setExpandedBaseCategoryRows((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  };
  const toggleBaseItemRow = (base: string, category: string, item: string) => {
    const key = `${base}::${category}::${item}`;
    setExpandedBaseItemRows((current) =>
      current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key],
    );
  };
  const toggleSalesRegion = (region: string) => {
    setExpandedSalesRegions((current) =>
      current.includes(region) ? current.filter((item) => item !== region) : [...current, region],
    );
  };
  const toggleSalesProvince = (region: string, provinceName: string) => {
    const key = `${region}::${provinceName}`;
    setExpandedSalesProvinces((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  };
  const selectSalesRegion = (region: string, metricTab: SalesMetricTab = 'overview') => {
    setSelectedSalesOrg(region);
    setSalesMetricTab(metricTab);
    setExpandedSalesRegions((current) =>
      current.includes(region) ? current : [...current, region],
    );
    scrollToDashboardList(`sales-org-row-${stableMetricSeed(region)}`, 'center');
  };
  const renderSalesMetricCells = (path: string) => {
    const values = salesOrgMetrics(path);
    if (salesMetricTab === 'overview')
      return (
        <>
          <span role="gridcell">
            {Number.isFinite(values.sales) ? values.sales.toLocaleString('zh-CN') : '—'}
            {'万元'}
          </span>
          <b
            role="gridcell"
            className={liveData ? 'neutral' : values.budget >= 100 ? 'good' : 'bad'}
          >
            {formatNumber(values.budget, 2)}
            {'%'}
          </b>
          <span
            role="gridcell"
            className={`achievement-status ${liveData ? 'status-neutral' : values.budget >= 100 ? 'status-ok' : 'status-bad'}`}
          >
            {!Number.isFinite(values.budget)
              ? '无数据'
              : liveData
                ? '目标待接入'
                : values.budget >= 100
                  ? '达标'
                  : '未达'}
          </span>
          <b
            role="gridcell"
            className={liveData ? 'neutral' : values.reporting >= 100 ? 'good' : 'bad'}
          >
            {formatNumber(values.reporting, 2)}
            {'%'}
          </b>
          <span
            role="gridcell"
            className={`achievement-status ${liveData ? 'status-neutral' : values.reporting >= 100 ? 'status-ok' : 'status-bad'}`}
          >
            {!Number.isFinite(values.reporting)
              ? '无数据'
              : liveData
                ? '目标待接入'
                : values.reporting >= 100
                  ? '达标'
                  : '未达'}
          </span>
        </>
      );
    const current = salesMetricTab === 'budget' ? values.budget : values.reporting;
    const previous = salesMetricTab === 'budget' ? values.budgetPrevious : values.reportingPrevious;
    return (
      <>
        <span role="gridcell">{liveData ? '待接入' : '≥ 100%'}</span>
        <span
          role="gridcell"
          className={`achievement-status ${liveData ? 'status-neutral' : current >= 100 ? 'status-ok' : 'status-bad'}`}
        >
          {!Number.isFinite(current)
            ? '无数据'
            : liveData
              ? '目标待接入'
              : current >= 100
                ? '达标'
                : '未达'}
        </span>
        <b role="gridcell" className={liveData ? 'neutral' : current >= 100 ? 'good' : 'bad'}>
          {formatNumber(current, 2)}
          {'%'}
        </b>
        <span role="gridcell">
          {formatNumber(previous, 2)}
          {'%'}
        </span>
        <span
          role="gridcell"
          className={
            !Number.isFinite(current - previous)
              ? 'neutral'
              : current - previous >= 0
                ? 'good'
                : 'bad'
          }
        >
          {formatDelta(current - previous, '%')}
        </span>
      </>
    );
  };
  const renderSalesWorkflowCells = (metricPath: string, taskScope: string) => {
    const values = salesOrgMetrics(metricPath);
    const metrics =
      salesMetricTab === 'budget'
        ? [{ name: '销售预算达成率', value: values.budget, severe: 80 }]
        : salesMetricTab === 'reporting'
          ? [{ name: '销售提报准确率', value: values.reporting, severe: 90 }]
          : [
              { name: '销售预算达成率', value: values.budget, severe: 80 },
              { name: '销售提报准确率', value: values.reporting, severe: 90 },
            ];
    const active = metrics.sort((a, b) => a.value - b.value)[0];
    const risk: MatrixRiskLevel = liveData
      ? '健康'
      : active.value >= 100
        ? '健康'
        : active.value < active.severe
          ? '严重'
          : '预警';
    return (
      <>
        <span role="gridcell" className="sales-org-risk">
          <em
            className={`task-risk-indicator ${liveData ? 'status-neutral' : `level-${riskLevelClass[risk]}`}`}
          >
            {liveData ? '待接入' : risk}
          </em>
        </span>
        <span role="gridcell" className="sales-org-task">
          {risk === '健康' ? (
            <span className="no-task-needed">{liveData ? '待接入' : '无需派发'}</span>
          ) : (
            renderTaskDispatch('销售组织', taskScope, [active.name], risk, false)
          )}
        </span>
      </>
    );
  };
  const openTaskAssignment = (
    scopeType: TaskScope,
    scope: string,
    anomalies: string[],
    linkedTask?: AssignedTask,
    linkedFrom?: string,
  ) => {
    const existingTask =
      linkedTask ||
      assignedTasks.find(
        (task) =>
          task.scopeType === scopeType && task.scope === scope && anomalies.includes(task.metric),
      );
    if (existingTask) {
      const availableMetrics = anomalies.includes(existingTask.metric)
        ? anomalies
        : [existingTask.metric, ...anomalies];
      setTaskTarget({
        scopeType: existingTask.scopeType,
        scope: existingTask.scope,
        anomalies: availableMetrics,
        taskId: existingTask.id,
        linkedFrom,
      });
      setTaskDraft({
        metric: existingTask.metric,
        owner: existingTask.owner,
        content: existingTask.content,
        due: existingTask.due,
      });
      if (linkedFrom) {
        setToast(`${linkedFrom}的风险已归入${existingTask.scope}任务统一闭环`);
        setTimeout(() => setToast(''), 2600);
      }
      return;
    }
    const metric = anomalies[0];
    setTaskTarget({ scopeType, scope, anomalies });
    setTaskDraft({
      metric,
      owner: '',
      content: `处理${taskScopeDisplay(scopeType, scope)}${metric}异常，完成原因核查并落实纠偏动作。`,
      due: '',
    });
  };
  const saveTaskAssignment = () => {
    if (liveData) {
      setToast('正式任务派发接口待接入');
      return;
    }
    if (
      !taskTarget ||
      !taskDraft.metric ||
      !taskDraft.owner.trim() ||
      !taskDraft.content.trim() ||
      !taskDraft.due
    )
      return;
    const existingTask = taskTarget.taskId
      ? assignedTasks.find((task) => task.id === taskTarget.taskId)
      : undefined;
    const taskPeriodMeta = {
      analysisPeriod: activeAnalysisPeriod,
      statisticType: metricStatisticType(taskDraft.metric),
      dataCutoff,
    } as const;
    const nextTask: AssignedTask = existingTask
      ? {
          ...existingTask,
          metric: taskDraft.metric,
          owner: taskDraft.owner.trim(),
          content: taskDraft.content.trim(),
          due: taskDraft.due,
          ...taskPeriodMeta,
        }
      : {
          id: `${Date.now()}`,
          scopeType: taskTarget.scopeType,
          scope: taskTarget.scope,
          metric: taskDraft.metric,
          owner: taskDraft.owner.trim(),
          content: taskDraft.content.trim(),
          due: taskDraft.due,
          status: '进行中',
          createdAt: new Date().toISOString(),
          ...taskPeriodMeta,
        };
    const nextTasks = existingTask
      ? assignedTasks.map((task) => (task.id === existingTask.id ? nextTask : task))
      : [nextTask, ...assignedTasks];
    setAssignedTasks(nextTasks);
    browserStorage.setItem('plan-assigned-tasks', JSON.stringify(nextTasks));
    setTaskTarget(null);
    setToast(`${existingTask ? '已更新' : '已派发'}：${nextTask.scope}·${nextTask.metric}`);
    setTimeout(() => setToast(''), 2200);
  };
  const renderTaskDispatch = (
    scopeType: TaskScope,
    scope: string,
    metrics: string[],
    riskLevel: MatrixRiskLevel,
    showRiskIndicator = true,
  ) => {
    const directTask = assignedTasks.find(
      (task) =>
        task.scopeType === scopeType && task.scope === scope && metrics.includes(task.metric),
    );
    const relatedTask =
      riskLevel === '严重'
        ? assignedTasks.find(
            (task) => task.scopeType === scopeType && scope.startsWith(`${task.scope} / `),
          )
        : undefined;
    const existingTask = directTask || relatedTask;
    const isRelatedTask = Boolean(!directTask && relatedTask);
    const taskStateClass =
      existingTask?.status === '已完成' ? 'completed' : existingTask ? 'dispatched' : 'idle';
    const taskActionLabel =
      existingTask?.status === '已完成' ? '查看结果' : existingTask ? '查看任务' : '派发任务';
    const shouldShowRiskIndicator = showRiskIndicator && scopeType !== '交叉分析';
    const isCompleted = existingTask?.status === '已完成';
    const TaskActionIcon = isCompleted ? Check : existingTask ? ClipboardCheck : Plus;
    return (
      <span className="task-dispatch-cell">
        {shouldShowRiskIndicator && (
          <em
            className={`task-risk-indicator ${liveData ? 'status-neutral' : `level-${riskLevelClass[riskLevel]}`}`}
          >
            {liveData ? '待接入' : riskLevel}
          </em>
        )}
        <button
          className={`dispatch-task-button ${taskStateClass}`}
          title={`${riskLevel} · ${taskActionLabel}`}
          aria-label={
            isCompleted
              ? `查看${scope}${existingTask.metric}任务的完成结果`
              : existingTask
                ? `查看并修改${scope}${existingTask.metric}任务，当前责任人${existingTask.owner}`
                : `${scope}当前为${riskLevel}，${taskActionLabel}`
          }
          onClick={() => {
            if (isCompleted) {
              if (isRelatedTask) {
                setToast(`${scope}的风险已归入${existingTask.scope}任务统一闭环`);
                setTimeout(() => setToast(''), 2600);
              }
              openTaskCompletion(existingTask);
            } else
              openTaskAssignment(
                scopeType,
                scope,
                metrics,
                isRelatedTask ? existingTask : undefined,
                isRelatedTask ? scope : undefined,
              );
          }}
        >
          <TaskActionIcon />
          {taskActionLabel}
        </button>
      </span>
    );
  };
  const drillMetricRiskLevel = (
    name: ProductionDrillMetricName,
    values: ProductionDrillValues,
  ): MatrixRiskLevel => {
    if (liveData) return '健康'; // No formal targets: callers render availability instead of a risk verdict.
    const value = categoryPeriodDatum(name, values).current;
    if (name === '可发货天数') return matrixRiskLevel('stock', value);
    if (name === '订单满足率') return matrixRiskLevel('rate', value);
    if (name === '订单缺货量') return value > 3 ? '严重' : value > 0 ? '预警' : '健康';
    if (name === '库存量') return '健康';
    return matrixRiskLevel('plan', value);
  };
  const periodizedDrillValues = (values: ProductionDrillValues): ProductionDrillValues =>
    Object.fromEntries(
      productionMetricNames.map((name) => [name, categoryPeriodDatum(name, values).current]),
    ) as ProductionDrillValues;
  const drillRowRiskLevel = (
    values: ProductionDrillValues,
    activeMetric?: ProductionDrillMetricName | null,
  ): MatrixRiskLevel => {
    const periodValues = periodizedDrillValues(values);
    return activeMetric
      ? drillMetricRiskLevel(activeMetric, periodValues)
      : worstRiskLevel(
          activeProductionMetricNames
            .filter((name) => name !== '库存量')
            .map((name) => drillMetricRiskLevel(name, periodValues)),
        );
  };
  const drillTaskMetrics = (
    values: ProductionDrillValues,
    activeMetric?: ProductionDrillMetricName | null,
  ) => {
    const periodValues = periodizedDrillValues(values);
    const visibleMetrics = activeMetric ? [activeMetric] : activeProductionMetricNames;
    const anomalies = visibleMetrics.filter(
      (name) => drillMetricRiskLevel(name, periodValues) !== '健康',
    );
    return anomalies.length ? anomalies : visibleMetrics;
  };
  const renderDrillWorkflowCells = (
    scopeType: Extract<TaskScope, '品类' | '基地'>,
    scope: string,
    values: ProductionDrillValues,
    activeMetric?: ProductionDrillMetricName | null,
  ) => {
    const riskLevel = drillRowRiskLevel(values, activeMetric);
    return (
      <>
        <span role="gridcell" className="category-drill-risk">
          <em
            className={`task-risk-indicator ${liveData ? 'status-neutral' : `level-${riskLevelClass[riskLevel]}`}`}
          >
            {liveData ? '待接入' : riskLevel}
          </em>
        </span>
        <span role="gridcell" className="category-drill-action">
          {renderTaskDispatch(
            scopeType,
            scope,
            drillTaskMetrics(values, activeMetric),
            riskLevel,
            false,
          )}
        </span>
      </>
    );
  };
  const renderCategoryMetricCells = (values: ProductionDrillValues) => {
    if (!activeCategoryMetric || !categoryMetricMeta) {
      return activeProductionMetricNames.map((name) => {
        const datum = categoryPeriodDatum(name, values);
        return (
          <b role="gridcell" className={productionMetricState(name, datum.current)} key={name}>
            {productionMetricDisplay(name, datum.current)}
          </b>
        );
      });
    }
    const datum = categoryPeriodDatum(activeCategoryMetric, values);
    const hasTarget = categoryMetricMeta.target !== null;
    const periodOk = hasTarget
      ? categoryMetricMeta.lowerBetter
        ? datum.current <= categoryMetricMeta.target!
        : datum.current > categoryMetricMeta.target!
      : null;
    const improved = hasTarget
      ? categoryMetricMeta.lowerBetter
        ? datum.change < 0
        : datum.change > 0
      : null;
    return (
      <>
        <span role="gridcell">{categoryMetricMeta.targetText.replace('目标 ', '')}</span>
        <span
          role="gridcell"
          className={`category-drill-status achievement-status ${periodOk === null ? 'status-neutral' : periodOk ? 'status-ok' : 'status-bad'}`}
        >
          {!Number.isFinite(datum.current)
            ? '无数据'
            : liveData
              ? '待接入'
              : periodOk === null
                ? '无目标'
                : periodOk
                  ? '达标'
                  : '未达'}
        </span>
        <b role="gridcell" className={periodOk === null ? 'neutral' : periodOk ? 'good' : 'bad'}>
          {productionMetricDisplay(activeCategoryMetric, datum.current)}
        </b>
        <span role="gridcell">{productionMetricDisplay(activeCategoryMetric, datum.previous)}</span>
        <span role="gridcell" className={improved === null ? 'neutral' : improved ? 'good' : 'bad'}>
          {formatDelta(datum.change, categoryMetricMeta.unit)}
        </span>
        <span role="gridcell">
          {datum.same === null ? '—' : productionMetricDisplay(activeCategoryMetric, datum.same)}
        </span>
        <span
          role="gridcell"
          className={
            datum.yoy === null
              ? 'neutral'
              : categoryMetricMeta.lowerBetter
                ? datum.yoy < 0
                  ? 'good'
                  : 'bad'
                : datum.yoy > 0
                  ? 'good'
                  : 'bad'
          }
        >
          {datum.yoy === null ? '—' : formatDelta(datum.yoy, categoryMetricMeta.unit)}
        </span>
      </>
    );
  };
  const renderBaseMetricCells = (values: ProductionDrillValues) => {
    if (!activeBaseMetric || !baseMetricMeta) {
      return activeProductionMetricNames.map((name) => {
        const datum = categoryPeriodDatum(name, values);
        return (
          <b role="gridcell" className={productionMetricState(name, datum.current)} key={name}>
            {productionMetricDisplay(name, datum.current)}
          </b>
        );
      });
    }
    const datum = categoryPeriodDatum(activeBaseMetric, values);
    const hasTarget = baseMetricMeta.target !== null;
    const periodOk = hasTarget
      ? baseMetricMeta.lowerBetter
        ? datum.current <= baseMetricMeta.target!
        : datum.current > baseMetricMeta.target!
      : null;
    const improved = hasTarget
      ? baseMetricMeta.lowerBetter
        ? datum.change < 0
        : datum.change > 0
      : null;
    return (
      <>
        <span role="gridcell">{baseMetricMeta.targetText.replace('目标 ', '')}</span>
        <span
          role="gridcell"
          className={`category-drill-status achievement-status ${periodOk === null ? 'status-neutral' : periodOk ? 'status-ok' : 'status-bad'}`}
        >
          {!Number.isFinite(datum.current)
            ? '无数据'
            : liveData
              ? '待接入'
              : periodOk === null
                ? '无目标'
                : periodOk
                  ? '达标'
                  : '未达'}
        </span>
        <b role="gridcell" className={periodOk === null ? 'neutral' : periodOk ? 'good' : 'bad'}>
          {productionMetricDisplay(activeBaseMetric, datum.current)}
        </b>
        <span role="gridcell">{productionMetricDisplay(activeBaseMetric, datum.previous)}</span>
        <span role="gridcell" className={improved === null ? 'neutral' : improved ? 'good' : 'bad'}>
          {formatDelta(datum.change, baseMetricMeta.unit)}
        </span>
        <span role="gridcell">
          {datum.same === null ? '—' : productionMetricDisplay(activeBaseMetric, datum.same)}
        </span>
        <span
          role="gridcell"
          className={
            datum.yoy === null
              ? 'neutral'
              : baseMetricMeta.lowerBetter
                ? datum.yoy < 0
                  ? 'good'
                  : 'bad'
                : datum.yoy > 0
                  ? 'good'
                  : 'bad'
          }
        >
          {datum.yoy === null ? '—' : formatDelta(datum.yoy, baseMetricMeta.unit)}
        </span>
      </>
    );
  };
  const productionMetricCardData = (
    name: ProductionDrillMetricName,
    values: ProductionDrillValues,
  ) => {
    const datum = categoryPeriodDatum(name, values);
    const meta = overviewMetricMeta.find((item) => item.name === name)!;
    const state =
      liveData || meta.target === null
        ? 'neutral'
        : meta.lowerBetter
          ? datum.current <= meta.target
            ? 'good'
            : 'bad'
          : datum.current > meta.target
            ? 'good'
            : 'bad';
    const gap =
      liveData && !Number.isFinite(datum.current)
        ? '开发中'
        : meta.target === null
          ? name === '库存量'
            ? '无目标 · 数量观察项'
            : '目标待确认'
          : `目标差距 ${formatDelta(datum.current - meta.target, meta.unit)}`;
    return {
      name,
      value: productionMetricDisplay(name, datum.current),
      state,
      gap,
      statisticType: metricStatisticType(name),
    };
  };
  const productionOverviewRowStyle = {
    '--production-metric-count': activeProductionMetricNames.length,
  } as CSSProperties;
  const openTaskCompletion = (task: AssignedTask) => {
    setCompletionTargetId(task.id);
    setCompletionDraft(task.completionSummary || '');
  };
  const saveTaskCompletion = () => {
    if (liveData) {
      setToast('正式任务完成接口待接入');
      return;
    }
    if (!completionTargetId || !completionDraft.trim()) return;
    const nextTasks = assignedTasks.map((task) =>
      task.id === completionTargetId
        ? {
            ...task,
            status: '已完成' as const,
            completionSummary: completionDraft.trim(),
            completedAt: new Date().toISOString(),
          }
        : task,
    );
    setAssignedTasks(nextTasks);
    browserStorage.setItem('plan-assigned-tasks', JSON.stringify(nextTasks));
    const completedTask = nextTasks.find((task) => task.id === completionTargetId);
    setCompletionTargetId(null);
    setCompletionDraft('');
    setToast(`已完成：${completedTask?.scope || ''}·${completedTask?.metric || ''}`);
    setTimeout(() => setToast(''), 2200);
  };
  const closePeriodMenus = () => {
    setDateOpen(false);
    setWeekOpen(false);
  };
  const chooseAnalysisScope = (scope: AnalysisScope) => {
    setAnalysisScope(scope);
    if (scope === 'overview' && (timeGranularity === 'week' || timeGranularity === 'day')) {
      setTimeGranularity('month');
    }
    closePeriodMenus();
  };
  const chooseGranularity = (granularity: TimeGranularity) => {
    setTimeGranularity(granularity);
    closePeriodMenus();
    const label = { year: '年度累计', month: '月度累计', week: '周度累计', day: '日度' }[
      granularity
    ];
    setToast(`已切换至${label}口径`);
    setTimeout(() => setToast(''), 1600);
  };
  const chooseYear = (year: YearOption) => {
    setSelectedYearKey(year.key);
    const maxDay = new Date(Number(year.key), selectedMonth.value, 0).getDate();
    const nextDay = Math.min(selectedDay, maxDay);
    const nextWeeks = buildNaturalWeeks(Number(year.key), selectedMonth.value);
    setSelectedDay(nextDay);
    setSelectedWeekKey(
      (
        nextWeeks.find((item) => nextDay >= item.startDay && nextDay <= item.endDay) ||
        nextWeeks[nextWeeks.length - 1]
      ).key,
    );
    setToast(`已切换至${year.label}数据`);
    setTimeout(() => setToast(''), 1800);
  };
  const chooseMonth = (month: MonthOption) => {
    setSelectedMonthKey(month.key);
    const maxDay = new Date(Number(selectedYear.key), month.value, 0).getDate();
    const nextDay = Math.min(selectedDay, maxDay);
    const nextWeeks = buildNaturalWeeks(Number(selectedYear.key), month.value);
    setSelectedDay(nextDay);
    setSelectedWeekKey(
      (
        nextWeeks.find((item) => nextDay >= item.startDay && nextDay <= item.endDay) ||
        nextWeeks[nextWeeks.length - 1]
      ).key,
    );
    setToast(`已切换至${selectedYear.label}${month.label}数据`);
    setTimeout(() => setToast(''), 1800);
  };
  const chooseWeek = (week: WeekOption) => {
    setSelectedWeekKey(week.key);
    closePeriodMenus();
    setToast(`已筛选${selectedPeriodLabel}${week.label}（${week.range}）数据`);
    setTimeout(() => setToast(''), 1800);
  };
  const chooseDay = (day: number) => {
    setSelectedDay(day);
    closePeriodMenus();
    setToast(`已筛选${selectedPeriodLabel}${day}日数据`);
    setTimeout(() => setToast(''), 1800);
  };
  const apsViewRef = useRef<any>(null);
  const viewScope = liveScope;
  const apsViewData = useMemo(
    () => (live.data ? { ...live.data, ...scopedData(live.data, viewScope) } : null),
    [live.data, selectedBase],
  );
  const apsViewMetrics = useMemo(
    () => (apsViewData ? deriveMetrics(apsViewData) : {}),
    [apsViewData],
  );
  const apsScopedLive = useMemo(
    () => ({
      ...live,
      data: apsViewData,
      previous: live.previous
        ? { ...live.previous, ...scopedData(live.previous, viewScope) }
        : null,
      annual: live.annual ? { ...live.annual, ...scopedData(live.annual, viewScope) } : null,
    }),
    [live.key, live.busy, live.error, apsViewData, live.previous, live.annual, selectedBase],
  );
  const apsVisibleNames =
    activeWorkspace === 'intelligent'
      ? ['销售预算达成率', '生产计划达成率', '库存量', '订单满足率']
      : scopedMetricNames;
  const apsCurrent = {
    date: liveDate,
    granularity: timeGranularity,
    workspace: activeWorkspace,
    analysisScope,
    productionDimension,
    base: selectedBase,
  };
  const apsBases = useMemo(
    () => [
      ...new Set(
        live.data?.sections.flatMap((section) =>
          section.rows
            .map((row) => row.base)
            .filter((name: any) => typeof name === 'string' && name.length),
        ) ?? [],
      ),
    ],
    [live.data],
  );
  const apsEvidence = {
    period: { date: liveDate, granularity: timeGranularity },
    workspace: activeWorkspace,
    preview: !['intelligent', 'plan'].includes(activeWorkspace),
    analysisScope,
    productionDimension,
    scope: viewScope,
    selection: { base: selectedBase, category: selectedCategory, salesRegion: selectedSalesOrg },
    filters: {
      allowedFields: [
        'date',
        'granularity',
        'workspace',
        'analysisScope',
        'productionDimension',
        'base',
      ],
      current: apsCurrent,
      options: {
        base: ['全部基地', ...apsBases],
        workspace: ['intelligent', 'plan'],
        analysisScope: ['overview', 'production', 'sales'],
        productionDimension: ['category', 'base', 'cross'],
        granularity: timeGranularityOptions.map((option) => option.key),
      },
      constraints: {
        overviewGranularity: ['year', 'month'],
        date: '有效ISO日期，不晚于当前日期',
        weekDate: '周视角以date所在自然周为锚点，实际截止以filters.current.date为准',
      },
    },
    metrics: Object.fromEntries(
      apsVisibleNames.map((name) => [
        name,
        apsViewMetrics[name] ?? { name, value: null, unit: '', note: '当前范围无可用指标' },
      ]),
    ),
    sources:
      apsViewData?.sections.map(({ rows, ...source }) => ({
        ...source,
        groups: rows.length,
        scope: viewScope,
      })) ?? [],
    missing: apsVisibleNames.filter((name) => apsViewMetrics[name]?.value == null),
    comparison: comparisonValues(live.data, live.previous, live.annual, viewScope),
  };
  apsViewRef.current = {
    current: apsCurrent,
    bases: apsBases,
    weekKey: selectedWeek.key,
    dateAnchor: `${selectedYear.key}-${selectedMonth.key}-${String(selectedDay).padStart(2, '0')}`,
  };
  useEffect(() => {
    if (!liveData) return;
    setViewContext(apsEvidence, live.data);
    return reportElements(
      'aps-metrics',
      !apsEvidence.preview && live.data
        ? apsVisibleNames.map((name) => ({
            id: 'aps:metric:' + apsVisibleNames.indexOf(name),
            role: 'row',
            label: name,
            value:
              apsViewMetrics[name]?.value == null
                ? '未知'
                : String(apsViewMetrics[name].value) + ' ' + apsViewMetrics[name].unit,
          }))
        : [],
    );
  }, [
    liveData,
    live.data,
    live.previous,
    live.annual,
    live.busy,
    live.error,
    liveDate,
    timeGranularity,
    selectedYear.key,
    selectedMonth.key,
    selectedDay,
    selectedWeekKey,
    activeWorkspace,
    analysisScope,
    productionDimension,
    selectedBase,
    selectedCategory,
    selectedSalesOrg,
  ]);
  useEffect(() => {
    if (!liveData) return;
    return action(
      'filter',
      '筛选经营页面；字段为date、granularity、workspace、analysisScope、productionDimension、base。base仅使用当前返回基地；不修改业务数据。',
      async (input: any, options: { signal?: AbortSignal } = {}) => {
        options.signal?.throwIfAborted();
        if (
          !input ||
          typeof input !== 'object' ||
          Array.isArray(input) ||
          Object.keys(input).some(
            (key) =>
              ![
                'date',
                'granularity',
                'workspace',
                'analysisScope',
                'productionDimension',
                'base',
              ].includes(key),
          )
        )
          throw Error('经营筛选参数无效');
        const { current, bases, dateAnchor, weekKey } = apsViewRef.current;
        const allowed: any = {
          granularity: ['year', 'month', 'week', 'day'],
          workspace: ['intelligent', 'plan'],
          analysisScope: ['overview', 'production', 'sales'],
          productionDimension: ['category', 'base', 'cross'],
          base: ['全部基地', ...bases],
        };
        for (const [key, values] of Object.entries(allowed))
          if (input[key] !== undefined && !(values as any[]).includes(input[key]))
            throw Error('筛选范围不可用：' + key);
        if (input.date !== undefined) {
          const day = new Date(input.date + 'T00:00:00Z');
          if (
            typeof input.date !== 'string' ||
            !/^\d{4}-\d{2}-\d{2}$/.test(input.date) ||
            !Number.isFinite(day.valueOf()) ||
            day.toISOString().slice(0, 10) !== input.date ||
            !yearOptions.some((year) => year.key === input.date.slice(0, 4)) ||
            isFutureCalendarDay(
              Number(input.date.slice(0, 4)),
              Number(input.date.slice(5, 7)),
              Number(input.date.slice(8)),
            )
          )
            throw Error('日期无效');
        }
        if (
          (input.analysisScope ?? current.analysisScope) === 'overview' &&
          !['year', 'month'].includes(input.granularity ?? current.granularity)
        )
          throw Error('总览视角仅支持年度或月度');
        const requestedWeek =
          input.date === undefined
            ? undefined
            : buildNaturalWeeks(
                Number(input.date.slice(0, 4)),
                Number(input.date.slice(5, 7)),
              ).find(
                (week) =>
                  Number(input.date.slice(8)) >= week.startDay &&
                  Number(input.date.slice(8)) <= week.endDay,
              );
        const changed = Object.fromEntries(
          Object.entries(input).filter(([key, value]) =>
            key === 'date'
              ? dateAnchor !== value ||
                ((input.granularity ?? current.granularity) === 'week' &&
                  requestedWeek?.key !== weekKey)
              : current[key] !== value,
          ),
        );
        if (!Object.keys(changed).length) return { unchanged: true };
        await acknowledgePendingView(changed, options);
        options.signal?.throwIfAborted();
        if (input.date !== undefined) {
          setSelectedYearKey(input.date.slice(0, 4));
          setSelectedMonthKey(input.date.slice(5, 7));
          setSelectedDay(Number(input.date.slice(8)));
          if (requestedWeek) setSelectedWeekKey(requestedWeek.key);
        }
        if (input.granularity !== undefined) setTimeGranularity(input.granularity);
        if (input.workspace !== undefined) setActiveWorkspace(input.workspace);
        if (input.analysisScope !== undefined) setAnalysisScope(input.analysisScope);
        if (input.productionDimension !== undefined)
          setProductionDimension(input.productionDimension);
        if (input.base !== undefined) setSelectedBase(input.base);
        return { querying: true, requested: changed, notice: '读取改动后的页面状态确认结果' };
      },
    );
  }, [liveData]);
  const referenceOptions: DashboardContext[] =
    (liveData && apsEvidence.preview) || (liveData && !live.data)
      ? []
      : liveData
        ? apsVisibleNames.map((name) => ({
            id: 'aps:metric:' + apsVisibleNames.indexOf(name),
            scope: `${selectedBase} · ${liveDate}`,
            label: name,
            summary: `${name}：${apsViewMetrics[name]?.value == null ? '未知' : String(apsViewMetrics[name].value) + ' ' + apsViewMetrics[name].unit}；${apsViewMetrics[name]?.note ?? '当前范围暂无来源'}`,
          }))
        : dashboardContextOptions;
  const selectDeclaredReference = (context: DashboardContext) => {
    setSelectedContexts((items) =>
      items.some((item) => item.id === context.id) ? items : [...items, context],
    );
    setContextSelectionMode(false);
    setToast('已选择当前声明的指标引用');
    setTimeout(() => setToast(''), 1800);
  };
  useEffect(() => {
    setSelectedContexts([]);
    setContextSelectionMode(false);
  }, [liveDate, timeGranularity, selectedBase, analysisScope, activeWorkspace]);
  const askAI = (rawQuestion: string) => {
    if (liveData) {
      const question = rawQuestion.trim();
      if (!question) return;
      setViewContext(apsEvidence, live.data);
      setMessages((previous) => [...previous, { role: 'user', text: question }]);
      const references = selectedContexts.flatMap((selected) => {
        const current = referenceOptions.find((item) => item.id === selected.id);
        return current ? [current] : [];
      });
      setSelectedContexts([]);
      setContextSelectionMode(false);
      void askHost(question, references)
        .then((result) =>
          setMessages((previous) => [
            ...previous,
            {
              role: 'assistant',
              text: typeof result?.text === 'string' ? result.text : '已交给产销协同助手处理。',
            },
          ]),
        )
        .catch((error) =>
          setMessages((previous) => [...previous, { role: 'assistant', text: String(error) }]),
        );
      setChatInput('');
      return;
    }
    const question = rawQuestion.trim();
    if (!question) return;
    const contextPayload = selectedContexts.length
      ? `\n\n看板引用数据：\n${selectedContexts.map((item) => `【${item.label}】${item.summary}`).join('\n')}`
      : '';
    setMessages((previous) => [
      ...previous,
      { role: 'user', text: question, contexts: selectedContexts.map((item) => item.label) },
      { role: 'assistant', text: answerQuestion(`${question}${contextPayload}`) },
    ]);
    setChatInput('');
    setSelectedContexts([]);
    setContextSelectionMode(false);
  };

  useEffect(() => {
    if (liveData) return;
    const normalizeTaskMetadata = (task: AssignedTask): AssignedTask => {
      const metric = task.metric === '满足率' ? '订单满足率' : task.metric;
      return {
        ...task,
        metric,
        analysisPeriod: task.analysisPeriod || '月度视角',
        statisticType: metricStatisticType(metric),
        dataCutoff: task.dataCutoff || '2026.08.30',
      };
    };
    const applyAutoDispatch = (tasks: AssignedTask[]) => {
      const merged = mergeAutoDispatchedTasks(tasks);
      setAssignedTasks(merged.tasks);
      browserStorage.setItem('plan-assigned-tasks', JSON.stringify(merged.tasks));
      if (merged.addedCount > 0) {
        setToast(`AI已自动派发 ${merged.addedCount} 项严重任务`);
        setTimeout(() => setToast(''), 2600);
      }
    };
    try {
      const stored = browserStorage.getItem('plan-assigned-tasks');
      if (stored) {
        const savedTasks = JSON.parse(stored) as AssignedTask[];
        const normalizedTasks = savedTasks.map(normalizeTaskMetadata);
        applyAutoDispatch(normalizedTasks);
        return;
      }
    } catch {
      applyAutoDispatch([]);
    }
  }, []);

  useEffect(() => {
    if (!contextSelectionMode) return;
    const cancelSelection = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setContextSelectionMode(false);
    };
    window.addEventListener('keydown', cancelSelection);
    return () => window.removeEventListener('keydown', cancelSelection);
  }, [contextSelectionMode]);

  useEffect(() => {
    if (activeWorkspace !== 'digital' && activeWorkspace !== 'intelligent') return;
    const frame = requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>(
          activeWorkspace === 'digital' ? '.digital-human-page' : '.intelligent-workspace-page',
        )
        ?.scrollTo({ top: 0 }),
    );
    return () => cancelAnimationFrame(frame);
  }, [activeWorkspace]);

  const startChatResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = chatWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const onMove = (moveEvent: PointerEvent) =>
      setChatWidth(Math.min(560, Math.max(280, startWidth + startX - moveEvent.clientX)));
    const onUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const createIntelligentTask = (task: AssignedTask) => {
    setAssignedTasks((currentTasks) => {
      if (currentTasks.some((item) => item.id === task.id)) return currentTasks;
      const nextTasks = [task, ...currentTasks];
      browserStorage.setItem('plan-assigned-tasks', JSON.stringify(nextTasks));
      return nextTasks;
    });
  };

  const buildProductionDiagnosticItem = (
    scopeType: Extract<TaskScope, '品类' | '基地'>,
    scope: string,
    levelLabel: string,
    values: ProductionDrillValues,
    jump: (metric: ProductionDrillMetricName) => void,
  ): DiagnosticRiskItem | null => {
    const periodValues = periodizedDrillValues(values);
    const ranked = activeProductionMetricNames
      .filter((name) => name !== '库存量')
      .map((metric) => {
        const value = periodValues[metric];
        const risk = drillMetricRiskLevel(metric, periodValues);
        const target =
          metric === '可发货天数'
            ? 12
            : metric === '订单缺货量'
              ? 0
              : metric === '订单满足率'
                ? 95
                : 100;
        const unit = metric === '可发货天数' ? '天' : metric === '订单缺货量' ? '万件' : '%';
        const rawGap = value - target;
        return { metric, value, risk, target, unit, rawGap };
      })
      .filter((item) => item.risk !== '健康')
      .sort((a, b) =>
        a.risk === b.risk ? Math.abs(b.rawGap) - Math.abs(a.rawGap) : a.risk === '严重' ? -1 : 1,
      );
    const top = ranked[0];
    if (!top) return null;
    return {
      id: `${timeGranularity}-${scopeType}-${scope}-${top.metric}`,
      perspective: 'production',
      scopeType,
      scope,
      levelLabel: `${levelLabel} · ${periodMeta.shortLabel}`,
      metric: top.metric,
      value: `${formatNumber(top.value, 2)}${top.unit}`,
      target: `${top.metric === '可发货天数' ? '<' : top.metric === '订单缺货量' ? '=' : '≥'} ${top.target}${top.unit}`,
      gap: `${top.rawGap > 0 ? '+' : ''}${formatNumber(top.rawGap, 2)}${top.unit === '%' ? 'pp' : top.unit}`,
      risk: top.risk as Exclude<MatrixRiskLevel, '健康'>,
      rawGap: Math.abs(top.rawGap),
      jump: () => jump(top.metric),
    };
  };
  const categoryDiagnosticItems = baseProductHierarchy
    .map((category) =>
      buildProductionDiagnosticItem(
        '品类',
        category.name,
        '品类',
        categoryDrillMetrics(category.name),
        (metric) => {
          setAnalysisScope('production');
          setProductionDimension('category');
          selectCategory(category.name, metric);
        },
      ),
    )
    .filter((item): item is DiagnosticRiskItem => Boolean(item));
  const baseDiagnosticItems = base830
    .map((base) =>
      buildProductionDiagnosticItem(
        '基地',
        base.name,
        '基地',
        baseDrillMetrics(base.name),
        (metric) => {
          setAnalysisScope('production');
          setProductionDimension('base');
          selectBaseCard(base.name, metric);
        },
      ),
    )
    .filter((item): item is DiagnosticRiskItem => Boolean(item));
  const crossDiagnosticItems: DiagnosticRiskItem[] = activeCrossMatrixModes.flatMap((mode) =>
    buildPeriodMatrixRiskRows(mode)
      .filter((row) => row.level !== '健康')
      .map((row) => ({
        id: `${timeGranularity}-cross-${mode}-${row.scope}`,
        perspective: 'production' as const,
        scopeType: '交叉分析' as const,
        scope: row.scope,
        levelLabel: `${row.granularity} · ${periodMeta.shortLabel}`,
        metric: matrixListMeta[mode].label,
        value: `${formatNumber(row.value, 2)}${matrixListMeta[mode].unit}`,
        target: matrixListMeta[mode].target,
        gap: `${row.gap > 0 ? '+' : ''}${formatNumber(row.gap, 2)}${matrixListMeta[mode].unit === '%' ? 'pp' : matrixListMeta[mode].unit}`,
        risk: row.level as Exclude<MatrixRiskLevel, '健康'>,
        rawGap: Math.abs(row.gap),
        jump: () => {
          setAnalysisScope('production');
          setProductionDimension('cross');
          setMatrixMode(mode);
          scrollToDashboardList('matrix-risk-list', 'start');
        },
      })),
  );
  const productionDiagnosticItems =
    productionDimension === 'category'
      ? categoryDiagnosticItems
      : productionDimension === 'base'
        ? baseDiagnosticItems
        : crossDiagnosticItems;
  const salesDiagnosticItems: DiagnosticRiskItem[] = salesOrgHierarchy.flatMap((region) => {
    const nodes =
      salesRiskLevel === '大区'
        ? [{ path: region.name, name: region.name }]
        : salesRiskLevel === '省区'
          ? (region.children || [])
              .filter((node) => node.children?.length)
              .map((node) => ({ path: `${region.name} / ${node.name}`, name: node.name }))
          : (region.children || []).flatMap((node) =>
              node.children?.length
                ? node.children.map((team) => ({
                    path: `${region.name} / ${node.name} / ${team.name}`,
                    name: team.name,
                  }))
                : [{ path: `${region.name} / ${node.name}`, name: node.name }],
            );
    return nodes.flatMap((node) => {
      const values = salesOrgMetrics(node.path);
      const metrics = [
        { metric: '销售预算达成率', value: values.budget, severe: 80, tab: 'budget' as const },
        {
          metric: '销售提报准确率',
          value: values.reporting,
          severe: 90,
          tab: 'reporting' as const,
        },
      ]
        .filter((item) => item.value < 100)
        .sort((a, b) => a.value - b.value);
      const top = metrics[0];
      if (!top) return [];
      const risk: Exclude<MatrixRiskLevel, '健康'> = top.value < top.severe ? '严重' : '预警';
      return [
        {
          id: `sales-${node.path}-${top.metric}`,
          perspective: 'sales' as const,
          scopeType: '销售组织' as const,
          scope: node.path,
          levelLabel: salesRiskLevel,
          metric: top.metric,
          value: `${formatNumber(top.value, 2)}%`,
          target: '≥ 100%',
          gap: `${(top.value - 100).toFixed(2)}pp`,
          risk,
          rawGap: 100 - top.value,
          jump: () => {
            setAnalysisScope('sales');
            selectSalesRegion(region.name, top.tab);
          },
        },
      ];
    });
  });
  const activeRiskPerspective =
    analysisScope === 'overview'
      ? overviewRiskPerspective
      : analysisScope === 'sales'
        ? 'sales'
        : 'production';
  const rankDiagnosticItems = (items: DiagnosticRiskItem[]) =>
    [...items].sort((a, b) =>
      a.risk === b.risk ? b.rawGap - a.rawGap : a.risk === '严重' ? -1 : 1,
    );
  const overviewProductionDiagnosticItems = [
    ...rankDiagnosticItems(categoryDiagnosticItems).slice(0, 4),
    ...rankDiagnosticItems(crossDiagnosticItems).slice(0, 1),
    ...rankDiagnosticItems(baseDiagnosticItems).slice(0, 1),
  ];
  const prototypeDiagnosticItems =
    analysisScope === 'overview' && activeRiskPerspective === 'production'
      ? overviewProductionDiagnosticItems
      : rankDiagnosticItems(
          activeRiskPerspective === 'sales' ? salesDiagnosticItems : productionDiagnosticItems,
        ).slice(0, analysisScope === 'overview' ? 6 : 12);
  const liveRiskDimension = analysisScope === 'overview' ? 'category' : productionDimension;
  const liveOrderRisks = liveData ? deriveOrderRisks(live.data, liveRiskDimension) : [];
  const diagnosticItems: DiagnosticRiskItem[] =
    liveData && activeRiskPerspective === 'production'
      ? liveOrderRisks.map((item) => ({
          id: `live-risk-${liveRiskDimension}-${item.scope}`,
          perspective: 'production',
          scopeType:
            liveRiskDimension === 'category'
              ? '品类'
              : liveRiskDimension === 'base'
                ? '基地'
                : '交叉分析',
          scope: item.scope,
          levelLabel:
            liveRiskDimension === 'category'
              ? '品类'
              : liveRiskDimension === 'base'
                ? '基地'
                : '基地 × 品类',
          metric: '订单满足率',
          value: `${formatNumber(item.rate, 2)}%`,
          target: '≥ 95%',
          gap: `${formatNumber(item.gap, 2)}pp`,
          risk: item.risk,
          rawGap: Math.abs(item.gap),
          jump: () => {
            setAnalysisScope('production');
            setProductionDimension(liveRiskDimension);
            if (liveRiskDimension === 'category') selectCategory(item.scope, '订单满足率');
            else if (liveRiskDimension === 'base') selectBaseCard(item.scope, '订单满足率');
            else {
              setMatrixMode('rate');
              scrollToDashboardList('matrix-risk-list', 'start');
            }
          },
        }))
      : prototypeDiagnosticItems;
  const liveOrdersAvailable = live?.data?.sections.some(
    (section) => section.id === 'orders' && section.status === 'ready' && section.rows.length > 0,
  );
  const criticalRiskCount = diagnosticItems.filter((item) => item.risk === '严重').length;
  const warningRiskCount = diagnosticItems.filter((item) => item.risk === '预警').length;
  const exportSections = [
    { name: '核心指标', description: '导出当前视角的指标、目标和达成状态' },
    { name: '指标明细', description: '导出本期、对比期及同比环比数据' },
    { name: '重点风险', description: '导出当前风险清单与目标差距' },
    { name: '协同任务', description: '导出责任人、完成时间和任务状态' },
  ];
  const toggleExportSection = (name: string) =>
    setSelectedExportSections((items) =>
      items.includes(name) ? items.filter((item) => item !== name) : [...items, name],
    );
  const exportReport = () => {
    if (!selectedExportSections.length) return;
    const rows: Array<Array<string | number>> = [
      ['产销协同报表'],
      [
        '视角',
        analysisScope === 'overview'
          ? '总览视角'
          : analysisScope === 'production'
            ? '生产视角'
            : '销售视角',
      ],
      ['统计周期', activeAnalysisPeriod],
      ['数据范围', periodMeta.range],
      [],
    ];
    if (selectedExportSections.includes('核心指标')) {
      rows.push(['核心指标'], ['指标', '当前值', '目标', '达成状态']);
      scopedPeriodKpis.forEach((item) =>
        rows.push([
          item.name,
          `${formatNumber(item.value, 2)}${item.unit}`,
          item.targetText,
          item.ok === null ? '无目标' : item.ok ? '达标' : '未达',
        ]),
      );
      rows.push([]);
    }
    if (selectedExportSections.includes('指标明细')) {
      rows.push(
        ['指标明细'],
        [
          '指标',
          periodMeta.current,
          periodMeta.previous,
          periodMeta.change,
          periodMeta.same,
          periodMeta.yoy,
        ],
      );
      scopedPeriodKpis.forEach((item) =>
        rows.push([
          item.name,
          `${formatNumber(item.value, 2)}${item.unit}`,
          `${formatNumber(item.previous, 2)}${item.unit}`,
          formatDelta(item.delta, item.unit),
          item.same === null ? '—' : `${formatNumber(item.same, 2)}${item.unit}`,
          item.yoy === null ? '—' : formatDelta(item.yoy, item.unit),
        ]),
      );
      rows.push([]);
    }
    if (selectedExportSections.includes('重点风险')) {
      rows.push(
        ['重点风险'],
        ['分析对象', '层级', '异常指标', '当前值', '目标', '目标差距', '风险状态'],
      );
      diagnosticItems.forEach((item) =>
        rows.push([
          item.scope,
          item.levelLabel,
          item.metric,
          item.value,
          item.target,
          item.gap,
          item.risk,
        ]),
      );
      rows.push([]);
    }
    if (selectedExportSections.includes('协同任务')) {
      rows.push(['协同任务'], ['分析对象', '异常指标', '任务内容', '责任人', '完成时间', '状态']);
      assignedTasks.forEach((item) =>
        rows.push([item.scope, item.metric, item.content, item.owner, item.due, item.status]),
      );
    }
    const csv = `\uFEFF${rows.map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `产销协同报表_${selectedYear.key}-${selectedMonth.key}-${String(selectedDay).padStart(2, '0')}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setExportDialogOpen(false);
    setToast(`已导出${selectedExportSections.length}项报表内容`);
    setTimeout(() => setToast(''), 2600);
  };

  return (
    <div
      className={`app-shell chat-${chatMode} ${sidebarCollapsed ? 'sidebar-collapsed' : ''} ${contextSelectionMode ? 'context-selecting' : ''} ${embedMode ? 'embed-mode' : ''}`}
      style={{ '--chat-width': `${chatWidth}px` } as CSSProperties}
    >
      <header className="global-topbar">
        <div className="global-brand">
          <span className="brand-mark">{'思'}</span>
          <strong>{'GEA平台'}</strong>
          <button
            className="icon-button global-nav-toggle"
            aria-label={sidebarCollapsed ? '展开导航' : '收起导航'}
            title={sidebarCollapsed ? '展开导航' : '收起导航'}
            onClick={() => setSidebarCollapsed((value) => !value)}
          >
            {sidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </button>
        </div>
        <div className="global-dashboard-header">
          {activeWorkspace !== 'plan' && activeWorkspace !== 'intelligent' && (
            <div className="global-workspace-title">
              <p className="eyebrow">{currentWorkspace.eyebrow}</p>
              <h1>{currentWorkspace.title}</h1>
            </div>
          )}
        </div>
      </header>
      <aside className="sidebar">
        <nav aria-label="主导航" className="gea-nav">
          <a className="nav-item ai-entry" href="#overview">
            <Bot />
            <span>{'AI工作台'}</span>
          </a>
          <div className="nav-group workbench-group">
            <button className="nav-item nav-parent workbench-parent">
              <LayoutGrid />
              <span>{'产销协同工作台'}</span>
              <ChevronDown className="chevron" />
            </button>
            <button
              className={`nav-child ${activeWorkspace === 'intelligent' ? 'active' : ''}`}
              onClick={() => {
                setActiveWorkspace('intelligent');
                requestAnimationFrame(() =>
                  document
                    .querySelector<HTMLElement>('.intelligent-workspace-page')
                    ?.scrollTo({ top: 0 }),
                );
              }}
            >
              {'产销协同智能工作台'}
            </button>
            <button
              className={`nav-child ${activeWorkspace === 'plan' ? 'active' : ''}`}
              onClick={() => setActiveWorkspace('plan')}
            >
              {'产销协同看板'}
            </button>
            <button
              className={`nav-child ${activeWorkspace === 'digital' ? 'active' : ''}`}
              onClick={() => {
                setActiveWorkspace('digital');
                requestAnimationFrame(() =>
                  document.querySelector<HTMLElement>('.digital-human-page')?.scrollTo({ top: 0 }),
                );
              }}
            >
              {'产销协同数字人'}
            </button>
          </div>
          <div className="nav-group">
            <button className="nav-item nav-parent">
              <Users />
              <span>{'客户管理'}</span>
              <ChevronDown className="chevron" />
            </button>
            <a className="nav-child" href="#overview">
              {'经销商工作台'}
            </a>
            <a className="nav-child" href="#base">
              {'经销商库存'}
            </a>
            <a className="nav-child" href="#issues">
              {'经销商补货'}
            </a>
          </div>
          <div className="nav-group">
            <button className="nav-item nav-parent">
              <ClipboardCheck />
              <span>{'计划管理'}</span>
              <ChevronDown className="chevron" />
            </button>
            <a className="nav-child" href="#overview">
              {'计划管理工作台'}
            </a>
            <button
              className={`nav-child ${activeWorkspace === 'sales-plan' ? 'active' : ''}`}
              onClick={() => {
                setSalesPlanRunId((value) => value + 1);
                setActiveWorkspace('sales-plan');
              }}
            >
              {'销售计划'}
            </button>
            <a className="nav-child" href="#category">
              {'生产计划'}
            </a>
            <a className="nav-child" href="#base">
              {'排产计划'}
            </a>
          </div>
          <div className="nav-group">
            <button className="nav-item nav-parent">
              <Boxes />
              <span>{'库存管理'}</span>
              <ChevronDown className="chevron" />
            </button>
            <a className="nav-child" href="#overview">
              {'库存管理工作台'}
            </a>
            <a className="nav-child" href="#cross-analysis">
              {'全链库存'}
            </a>
            <a className="nav-child" href="#base-dashboard">
              {'基地库存'}
            </a>
            <a className="nav-child" href="#base">
              {'分仓库存'}
            </a>
          </div>
        </nav>
        <div className="sidebar-footer">
          <div className="avatar">{'刘'}</div>
          <div>
            <strong>{'刘壮壮'}</strong>
            <small>{'计划管理部'}</small>
          </div>
          <button className="icon-button" aria-label="设置">
            <Target />
          </button>
        </div>
      </aside>

      <main className="main-content">
        {liveData && (
          <section className="aps-data-state" role={live.error ? 'alert' : 'status'}>
            <strong>
              {!['intelligent', 'plan'].includes(activeWorkspace)
                ? '本页为原型预览，不代表正式执行状态'
                : live.busy
                  ? '当前范围正在读取'
                  : live.error
                    ? '部分来源不可用'
                    : live.data
                      ? '当前范围数据已读取'
                      : '当前范围暂无可用数据'}
            </strong>
            <span>
              {'截止 '}
              {liveDate}
              {' · '}
              {selectedBase}
              {' · GEA 授权只读'}
              {live.data
                ? ' · 读取时间 ' +
                  new Date(live.data.readAt).toLocaleString('zh-CN', {
                    timeZone: 'Asia/Shanghai',
                    hour12: false,
                  })
                : ''}
            </span>
            {live.error && <p>{live.error}</p>}
            <details>
              <summary>{'来源与缺失说明'}</summary>
              <ul>
                {(apsEvidence.sources as any[]).map((source) => (
                  <li key={source.id}>
                    {source.label}
                    {'：'}
                    {source.status}
                    {' · 当前范围 '}
                    {source.groups}
                    {' 组'}
                    {source.error ? ' · ' + source.error.message : ''}
                  </li>
                ))}
              </ul>
              <p>
                {'缺失指标：'}
                {apsEvidence.missing.join('、') || '当前展示指标均有数值'}
                {'。查询截止时间不等同于各来源实际快照；未返回的来源快照日期保持未知。'}
              </p>
              <p>{'任务及编辑属于本页预览，未保存或提交业务系统。'}</p>
            </details>
          </section>
        )}
        {contextSelectionMode && (
          <div className="context-selection-banner" role="status">
            <Link2 />
            <span>
              <strong>{'选择当前声明的指标引用'}</strong>
              <small>{'引用保留当前范围与来源，按 Esc 取消'}</small>
            </span>
            <div>
              {referenceOptions.map((item) => (
                <button type="button" key={item.id} onClick={() => selectDeclaredReference(item)}>
                  {item.label}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setContextSelectionMode(false)}>
              {'取消'}
            </button>
          </div>
        )}
        {activeWorkspace === 'intelligent' ? (
          <IntelligentWorkbenchPage
            live={liveData ? apsScopedLive : undefined}
            periodLabel={activeAnalysisPeriod}
            periodRange={periodMeta.range}
            tasks={assignedTasks}
            onOpenV02={(scope = 'overview', dimension = 'category') => {
              setAnalysisScope(scope);
              if (scope === 'production') setProductionDimension(dimension);
              setActiveWorkspace('plan');
              requestAnimationFrame(() =>
                document.querySelector<HTMLElement>('.main-content')?.scrollTo({ top: 0 }),
              );
            }}
            onOpenDigital={() => setActiveWorkspace('digital')}
            onOpenTask={openTaskCompletion}
            onCreateTask={createIntelligentTask}
          />
        ) : activeWorkspace === 'digital' ? (
          <DigitalHumanWorkbenchPage
            tasks={assignedTasks}
            onOpenV02={() => {
              setActiveWorkspace('plan');
              requestAnimationFrame(() =>
                document.querySelector<HTMLElement>('.main-content')?.scrollTo({ top: 0 }),
              );
            }}
          />
        ) : activeWorkspace === 'coordination' ? (
          <CoordinationDashboardPage
            onOpenPlan={() => {
              setActiveWorkspace('plan');
              requestAnimationFrame(() =>
                document.querySelector<HTMLElement>('.main-content')?.scrollTo({ top: 0 }),
              );
            }}
          />
        ) : activeWorkspace === 'demand' ? (
          <DemandOperationsPage />
        ) : activeWorkspace === 'delivery' ? (
          <DeliveryOperationsPage />
        ) : activeWorkspace === 'sales-plan' ? (
          <SalesPlanPage runId={salesPlanRunId} />
        ) : (
          <div className="page" id="overview">
            <section
              className={`analysis-workspace panel scope-${analysisScope}${analysisScope === 'production' ? ` production-${productionDimension}` : ''}`}
            >
              <div className="dashboard-module-toolbar" aria-label="看板工具栏">
                <span className="dashboard-module-label">
                  <LayoutGrid />
                  {'产销协同看板'}
                </span>
                <button
                  className="open-intelligent-tasks"
                  onClick={() => {
                    setActiveWorkspace('intelligent');
                    requestAnimationFrame(() =>
                      requestAnimationFrame(() =>
                        document
                          .querySelector<HTMLElement>('.intelligent-workspace-page')
                          ?.scrollTo({ top: 0 }),
                      ),
                    );
                  }}
                >
                  {embedMode ? (
                    <>
                      <ArrowLeft />
                      {'返回智能工作台'}
                    </>
                  ) : (
                    <>
                      <ClipboardCheck />
                      {'任务统一到智能工作台管理'}
                      <ArrowRight />
                    </>
                  )}
                </button>
              </div>
              <div className="scope-tabs" role="tablist" aria-label="业务分析视角">
                <button
                  role="tab"
                  aria-selected={analysisScope === 'overview'}
                  className={analysisScope === 'overview' ? 'selected' : ''}
                  onClick={() => chooseAnalysisScope('overview')}
                >
                  {'总览视角'}
                </button>
                <button
                  role="tab"
                  aria-selected={analysisScope === 'production'}
                  className={analysisScope === 'production' ? 'selected' : ''}
                  onClick={() => chooseAnalysisScope('production')}
                >
                  {'生产视角'}
                </button>
                <button
                  role="tab"
                  aria-selected={analysisScope === 'sales'}
                  className={analysisScope === 'sales' ? 'selected' : ''}
                  onClick={() => chooseAnalysisScope('sales')}
                >
                  {'销售视角'}
                </button>
              </div>
              <div className="secondary-analysis-toolbar" aria-label="时间范围与统计粒度">
                <div className="global-top-actions">
                  <EditableHelp compact {...annotationHelp.period} />
                  <div className="period-selector-group">
                    <div
                      className="time-granularity-tabs period-damped-switch"
                      role="tablist"
                      aria-label="统计粒度"
                      style={
                        {
                          '--period-tab-index': activeTimeGranularityIndex,
                          '--period-tab-count': availableTimeGranularities.length,
                        } as CSSProperties
                      }
                    >
                      {availableTimeGranularities.map((item) => (
                        <button
                          type="button"
                          role="tab"
                          aria-selected={timeGranularity === item.key}
                          className={timeGranularity === item.key ? 'selected' : ''}
                          onClick={() => chooseGranularity(item.key)}
                          key={item.key}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                    <div className="month-wrap date-picker-wrap">
                      <button
                        className="date-button date-picker-button"
                        aria-haspopup="menu"
                        aria-expanded={dateOpen}
                        onClick={() => {
                          setDateOpen((value) => !value);
                          setWeekOpen(false);
                        }}
                      >
                        <CalendarDays />
                        <span>
                          {timeGranularity === 'year'
                            ? selectedYear.label
                            : timeGranularity === 'day'
                              ? selectedDateLabel
                              : selectedPeriodLabel}
                        </span>
                        <ChevronDown />
                      </button>
                      {dateOpen && (
                        <div
                          className="month-menu period-filter-menu date-picker-menu"
                          role="menu"
                          aria-label="统计日期筛选"
                        >
                          <small>
                            {'选择'}
                            {timeGranularity === 'year'
                              ? '年份'
                              : timeGranularity === 'day'
                                ? '日期'
                                : '年月'}
                          </small>
                          <div className="date-picker-sections">
                            <section>
                              <strong>{'年'}</strong>
                              <div className="date-picker-year">
                                {yearOptions.map((year) => (
                                  <button
                                    key={year.key}
                                    className={selectedYear.key === year.key ? 'selected' : ''}
                                    onClick={() => chooseYear(year)}
                                  >
                                    <Check />
                                    {year.label}
                                  </button>
                                ))}
                              </div>
                            </section>
                            {timeGranularity !== 'year' && (
                              <section>
                                <strong>{'月'}</strong>
                                <div className="date-picker-month">
                                  {monthOptions.map((month) => (
                                    <button
                                      key={month.key}
                                      disabled={
                                        liveData &&
                                        isFutureCalendarDay(
                                          Number(selectedYear.key),
                                          month.value,
                                          1,
                                        )
                                      }
                                      className={selectedMonth.key === month.key ? 'selected' : ''}
                                      onClick={() => chooseMonth(month)}
                                    >
                                      <Check />
                                      {month.value}
                                    </button>
                                  ))}
                                </div>
                              </section>
                            )}
                            {timeGranularity === 'day' && (
                              <section>
                                <strong>{'日'}</strong>
                                <div className="date-picker-day">
                                  {dayOptions.map((day) => (
                                    <button
                                      key={day}
                                      disabled={
                                        liveData &&
                                        isFutureCalendarDay(
                                          Number(selectedYear.key),
                                          selectedMonth.value,
                                          day,
                                        )
                                      }
                                      className={selectedDay === day ? 'selected' : ''}
                                      onClick={() => chooseDay(day)}
                                    >
                                      <Check />
                                      {day}
                                    </button>
                                  ))}
                                </div>
                              </section>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    {timeGranularity === 'week' && (
                      <div className="month-wrap week-wrap">
                        <button
                          className="date-button week-button"
                          aria-haspopup="menu"
                          aria-expanded={weekOpen}
                          onClick={() => {
                            setWeekOpen((value) => !value);
                            setDateOpen(false);
                          }}
                        >
                          <span>{selectedWeek.label}</span>
                          <small>{effectiveWeekRange}</small>
                          <ChevronDown />
                        </button>
                        {weekOpen && (
                          <div
                            className="month-menu period-filter-menu week-filter-menu"
                            role="menu"
                            aria-label={`${selectedPeriodLabel}自然周筛选`}
                          >
                            <small>
                              {selectedPeriodLabel}
                              {' · 选择自然周'}
                            </small>
                            {naturalWeekOptions.map((week) => (
                              <button
                                key={week.key}
                                disabled={
                                  liveData &&
                                  isFutureCalendarDay(
                                    Number(selectedYear.key),
                                    selectedMonth.value,
                                    week.startDay,
                                  )
                                }
                                className={selectedWeek.key === week.key ? 'selected' : ''}
                                onClick={() => chooseWeek(week)}
                              >
                                <Check />
                                <strong>{week.label}</strong>
                                <span>{week.range}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    <span className="active-period-range">
                      {'数据范围：'}
                      {periodMeta.range}
                    </span>
                  </div>
                </div>
              </div>
              <section aria-labelledby="kpi-title" data-context-id="kpi">
                <div className="section-heading">
                  <div>
                    <span id="kpi-title">
                      {analysisScope === 'overview' ? '经营指标' : '核心指标'}
                      {' · '}
                      {activeAnalysisPeriod}
                    </span>
                  </div>
                  <p>
                    {periodMeta.range}
                    {' · '}
                    {periodMeta.current}
                    {' / '}
                    {periodMeta.previous}
                    {' / '}
                    {periodMeta.change}
                  </p>
                </div>
                {analysisScope === 'production' || analysisScope === 'sales' ? (
                  <div
                    className={`production-kpi-groups ${analysisScope === 'sales' ? 'sales-kpi-groups' : ''}`}
                  >
                    {(analysisScope === 'production' ? productionKpiGroups : salesKpiGroups).map(
                      (group) => (
                        <section
                          className="production-kpi-group"
                          aria-label={group.label}
                          key={group.label}
                        >
                          <div className="business-metric-table-head">
                            <strong>{group.label}</strong>
                            <span>
                              {group.description}
                              {' · '}
                              {group.kpis.length}
                              {'项'}
                            </span>
                          </div>
                          <div
                            className={`kpi-grid period-kpi-grid overview-flat-kpi-grid scope-kpi-count-${group.kpis.length}`}
                          >
                            {group.kpis.map(renderPeriodKpiCard)}
                          </div>
                        </section>
                      ),
                    )}
                  </div>
                ) : (
                  <>
                    {analysisScope === 'overview' && (
                      <div className="business-metric-table-head">{'经营指标'}</div>
                    )}
                    <div
                      className={`kpi-grid period-kpi-grid overview-flat-kpi-grid scope-kpi-count-${scopedPeriodKpis.length}`}
                    >
                      {scopedPeriodKpis.map(renderPeriodKpiCard)}
                    </div>
                  </>
                )}
              </section>

              <section className="summary-strip" data-context-id="summary">
                <div className="summary-main">
                  <EditableHelp
                    key={activeScopeHelp.storageKey}
                    storageKey={activeScopeHelp.storageKey}
                    label={activeScopeHelp.label}
                    defaultText={activeScopeHelp.defaultText}
                  />
                  <span className="summary-tag">
                    <Sparkles />
                    {scopeSummary.tag}
                  </span>
                  <div className="score">
                    <strong>{scopeSummary.score}</strong>
                    <span>
                      {'/'}
                      {scopeSummary.total}
                    </span>
                    <p>{scopeSummary.label}</p>
                  </div>
                  <p className="summary-copy">
                    <strong>{promptAnalysis.title}</strong>
                    <br />
                    {scopeSummary.copy}
                  </p>
                </div>
              </section>

              <section
                className="overview-kpi-list"
                id="overview-detail-list"
                aria-labelledby="overview-list-title"
              >
                <div className="section-heading">
                  <div>
                    <span>
                      {analysisScope === 'overview'
                        ? '经营指标'
                        : analysisScope === 'production'
                          ? '生产视角'
                          : '销售视角'}
                      {' · 指标清单 · '}
                      {activeAnalysisPeriod}
                    </span>
                    <h2 id="overview-list-title">
                      {scopedOverviewMetricMeta.length}
                      {'项'}
                      {analysisScope === 'overview' ? '经营指标' : '指标'}
                      {periodMeta.shortLabel}
                      {'明细'}
                    </h2>
                  </div>
                  <p>
                    {'数据范围：'}
                    {periodMeta.range}
                  </p>
                </div>
                <div className="panel overview-list-table">
                  <div
                    className={`overview-list-row overview-list-head active-period-list ${activeMetricListVariant}`}
                  >
                    <span>{'指标'}</span>
                    {analysisScope === 'overview' && <span>{'统计口径'}</span>}
                    {analysisScope === 'production' && <span>{'指标分类'}</span>}
                    <span>{'目标'}</span>
                    <span>{'达成状态'}</span>
                    <span>{analysisScope === 'overview' ? '当前值' : periodMeta.current}</span>
                    <span>{periodMeta.previous}</span>
                    <span>{periodMeta.change}</span>
                    <span>{periodMeta.same}</span>
                    <span>{periodMeta.yoy}</span>
                  </div>
                  {scopedOverviewMetricMeta.map((meta) => {
                    const datum = activeComparison[meta.name];
                    const hasTarget = meta.target !== null;
                    const periodOk = hasTarget
                      ? meta.lowerBetter
                        ? datum.current <= meta.target!
                        : datum.current > meta.target!
                      : null;
                    const improved = hasTarget
                      ? meta.lowerBetter
                        ? datum.change < 0
                        : datum.change > 0
                      : null;
                    const metricClass = productionMetricClass(meta.name);
                    return (
                      <div
                        className={`overview-list-row active-period-list ${activeMetricListVariant} ${selectedMetric === meta.name ? 'selected' : ''}`}
                        key={meta.name}
                      >
                        <strong>{meta.name}</strong>
                        {analysisScope === 'overview' && (
                          <span
                            className={`statistic-type-cell ${metricStatisticType(meta.name) === '快照指标' ? 'snapshot' : 'cumulative'}`}
                          >
                            {metricStatisticType(meta.name)}
                            <small>
                              {metricStatisticType(meta.name) === '快照指标'
                                ? `截至${dataCutoff}`
                                : periodMeta.current}
                            </small>
                          </span>
                        )}
                        {analysisScope === 'production' && (
                          <span
                            className={`metric-classification-cell ${metricClass === '经营指标' ? 'business' : 'operational'}`}
                          >
                            {metricClass}
                          </span>
                        )}
                        <span>{meta.targetText.replace('目标 ', '')}</span>
                        <em
                          className={`achievement-status ${periodOk === null ? 'status-neutral' : periodOk ? 'status-ok' : 'status-bad'}`}
                        >
                          {!Number.isFinite(datum.current)
                            ? '无数据'
                            : periodOk === null
                              ? '无目标'
                              : periodOk
                                ? '达标'
                                : '未达'}
                        </em>
                        <b className={periodOk === null ? 'neutral' : periodOk ? 'good' : 'bad'}>
                          {formatNumber(datum.current, 2)}
                          {meta.unit}
                        </b>
                        <span>
                          {formatNumber(datum.previous, 2)}
                          {meta.unit}
                        </span>
                        <span className={improved === null ? 'neutral' : improved ? 'good' : 'bad'}>
                          {formatDelta(datum.change, meta.unit)}
                        </span>
                        <span>
                          {datum.same === null ? '—' : `${formatNumber(datum.same, 2)}${meta.unit}`}
                        </span>
                        <span>{datum.yoy === null ? '—' : formatDelta(datum.yoy, meta.unit)}</span>
                      </div>
                    );
                  })}
                </div>
              </section>

              {analysisScope === 'production' && (
                <div
                  className="production-dimension-tabs"
                  role="tablist"
                  aria-label="生产视角分析维度"
                >
                  <button
                    role="tab"
                    data-context-id="category"
                    aria-selected={productionDimension === 'category'}
                    className={productionDimension === 'category' ? 'selected' : ''}
                    onClick={() => setProductionDimension('category')}
                  >
                    {'品类维度'}
                  </button>
                  <button
                    role="tab"
                    data-context-id="base"
                    aria-selected={productionDimension === 'base'}
                    className={productionDimension === 'base' ? 'selected' : ''}
                    onClick={() => setProductionDimension('base')}
                  >
                    {'基地维度'}
                  </button>
                  <button
                    role="tab"
                    data-context-id="cross"
                    aria-selected={productionDimension === 'cross'}
                    className={productionDimension === 'cross' ? 'selected' : ''}
                    onClick={() => setProductionDimension('cross')}
                  >
                    {'交叉分析'}
                  </button>
                </div>
              )}

              <section id="sales-region-dashboard" aria-labelledby="sales-region-title">
                <div className="section-heading">
                  <div>
                    <span>{'销售组织维度'}</span>
                    <h2 id="sales-region-title">{'大区 / 省区 / 销售组指标下钻'}</h2>
                  </div>
                  <p>
                    {selectedPeriodLabel}
                    {' · '}
                    {salesOrgCounts.regions}
                    {' 个大区 · '}
                    {salesOrgCounts.provinces}
                    {' 个省区 · '}
                    {salesOrgCounts.teams}
                    {' 个销售组'}
                  </p>
                </div>
                <div className="sales-region-grid">
                  {salesOrgHierarchy.map((region) => {
                    const values = salesOrgMetrics(region.name);
                    return (
                      <article
                        className={`panel sales-region-card ${selectedSalesOrg === region.name ? 'selected' : ''}`}
                        key={region.name}
                      >
                        <button
                          className="sales-region-card-title"
                          aria-label={`查看${region.name}两指标总览`}
                          onClick={() => selectSalesRegion(region.name)}
                        >
                          <strong>{region.name}</strong>
                          <span>
                            {region.children?.length || 0}
                            {' 个下级组织'}
                          </span>
                        </button>
                        <button
                          className="sales-region-card-metric"
                          aria-label={`查看${region.name}销售预算达成率明细`}
                          onClick={() => selectSalesRegion(region.name, 'budget')}
                        >
                          <span>
                            {'销售预算达成率'}
                            <small>{liveData ? '目标待接入' : '目标 ≥ 100%'}</small>
                          </span>
                          <b
                            className={liveData ? 'neutral' : values.budget >= 100 ? 'good' : 'bad'}
                          >
                            {formatNumber(values.budget, 2)}
                            {'%'}
                            <small>
                              {liveData
                                ? '实际值'
                                : `差距 ${formatDelta(values.budget - 100, '%')}`}
                            </small>
                          </b>
                        </button>
                        <button
                          className="sales-region-card-metric"
                          aria-label={`查看${region.name}销售提报准确率明细`}
                          onClick={() => selectSalesRegion(region.name, 'reporting')}
                        >
                          <span>
                            {'销售提报准确率'}
                            <small>{liveData ? '目标待接入' : '目标 ≥ 100%'}</small>
                          </span>
                          <b
                            className={
                              liveData ? 'neutral' : values.reporting >= 100 ? 'good' : 'bad'
                            }
                          >
                            {formatNumber(values.reporting, 2)}
                            {'%'}
                            <small>
                              {liveData
                                ? '实际值'
                                : `差距 ${formatDelta(values.reporting - 100, '%')}`}
                            </small>
                          </b>
                        </button>
                      </article>
                    );
                  })}
                </div>
                <div className="sales-metric-tabs" role="tablist" aria-label="销售视角指标">
                  <button
                    role="tab"
                    aria-selected={salesMetricTab === 'overview'}
                    className={salesMetricTab === 'overview' ? 'selected' : ''}
                    onClick={() => setSalesMetricTab('overview')}
                  >
                    {'两指标总览'}
                  </button>
                  <button
                    role="tab"
                    aria-selected={salesMetricTab === 'budget'}
                    className={salesMetricTab === 'budget' ? 'selected' : ''}
                    onClick={() => setSalesMetricTab('budget')}
                  >
                    {'销售预算达成率'}
                  </button>
                  <button
                    role="tab"
                    aria-selected={salesMetricTab === 'reporting'}
                    className={salesMetricTab === 'reporting' ? 'selected' : ''}
                    onClick={() => setSalesMetricTab('reporting')}
                  >
                    {'销售提报准确率'}
                  </button>
                </div>
                <div
                  className="panel sales-org-tree"
                  role="treegrid"
                  aria-label={`${salesMetricTab === 'overview' ? '两指标总览' : salesMetricTab === 'budget' ? '销售预算达成率' : '销售提报准确率'}组织下钻清单`}
                >
                  <div
                    className={`sales-org-row sales-org-head ${salesMetricTab === 'overview' ? 'overview' : 'single'}`}
                    role="row"
                  >
                    <span role="columnheader">{'组织名称'}</span>
                    <span role="columnheader">{'层级'}</span>
                    {salesMetricTab === 'overview' ? (
                      <>
                        <span role="columnheader">{'销售额'}</span>
                        <span role="columnheader">{'预算达成率'}</span>
                        <span role="columnheader">{'达成状态'}</span>
                        <span role="columnheader">{'提报准确率'}</span>
                        <span role="columnheader">{'达成状态'}</span>
                      </>
                    ) : (
                      <>
                        <span role="columnheader">{'目标'}</span>
                        <span role="columnheader">{'达成状态'}</span>
                        <span role="columnheader">{periodMeta.current}</span>
                        <span role="columnheader">{periodMeta.previous}</span>
                        <span role="columnheader">{periodMeta.change}</span>
                      </>
                    )}
                    <span role="columnheader">{'风险状态'}</span>
                    <span role="columnheader">{'任务派发'}</span>
                  </div>
                  {salesOrgHierarchy.map((region) => {
                    const regionOpen = expandedSalesRegions.includes(region.name);
                    return (
                      <div className="sales-org-group" role="rowgroup" key={region.name}>
                        <div
                          id={`sales-org-row-${stableMetricSeed(region.name)}`}
                          className={`sales-org-row sales-org-region ${selectedSalesOrg === region.name ? 'is-selected' : ''} ${salesMetricTab === 'overview' ? 'overview' : 'single'}`}
                          role="row"
                          aria-expanded={regionOpen}
                        >
                          <button
                            className="sales-org-toggle"
                            role="gridcell"
                            onClick={() => toggleSalesRegion(region.name)}
                          >
                            <ChevronDown />
                            {region.name}
                          </button>
                          <span role="gridcell">
                            <em>{'大区'}</em>
                          </span>
                          {renderSalesMetricCells(region.name)}
                          {renderSalesWorkflowCells(region.name, region.name)}
                        </div>
                        {regionOpen &&
                          region.children?.map((provinceNode) => {
                            const provinceKey = `${region.name}::${provinceNode.name}`;
                            const provinceScope = `${region.name} / ${provinceNode.name}`;
                            const provinceOpen = expandedSalesProvinces.includes(provinceKey);
                            const hasTeams = Boolean(provinceNode.children?.length);
                            return (
                              <div className="sales-org-group" role="rowgroup" key={provinceKey}>
                                <div
                                  className={`sales-org-row sales-org-province ${salesMetricTab === 'overview' ? 'overview' : 'single'}`}
                                  role="row"
                                  aria-expanded={hasTeams ? provinceOpen : undefined}
                                >
                                  {hasTeams ? (
                                    <button
                                      className="sales-org-toggle"
                                      role="gridcell"
                                      onClick={() =>
                                        toggleSalesProvince(region.name, provinceNode.name)
                                      }
                                    >
                                      <ChevronDown />
                                      {provinceNode.name}
                                    </button>
                                  ) : (
                                    <strong role="gridcell">{provinceNode.name}</strong>
                                  )}
                                  <span role="gridcell">
                                    <em>{hasTeams ? '省区' : '销售组'}</em>
                                  </span>
                                  {renderSalesMetricCells(provinceScope)}
                                  {renderSalesWorkflowCells(provinceScope, provinceScope)}
                                </div>
                                {hasTeams &&
                                  provinceOpen &&
                                  provinceNode.children?.map((team, index) => {
                                    const teamScope = `${provinceScope} / ${team.name}`;
                                    return (
                                      <div
                                        className={`sales-org-row sales-org-team ${salesMetricTab === 'overview' ? 'overview' : 'single'}`}
                                        role="row"
                                        key={`${provinceKey}::${team.name}::${index}`}
                                      >
                                        <strong role="gridcell">
                                          <i />
                                          {team.name}
                                        </strong>
                                        <span role="gridcell">
                                          <em>{'销售组'}</em>
                                        </span>
                                        {renderSalesMetricCells(teamScope)}
                                        {renderSalesWorkflowCells(teamScope, teamScope)}
                                      </div>
                                    );
                                  })}
                              </div>
                            );
                          })}
                      </div>
                    );
                  })}
                </div>
              </section>

              <section id="category-operations" data-context-id="category">
                <div className="section-heading">
                  <div>
                    <span>
                      {'品类模块 · '}
                      {activeAnalysisPeriod}
                    </span>
                    <h2>
                      {'品类'}
                      {activeProductionMetricNames.length}
                      {'项指标达成看板'}
                    </h2>
                  </div>
                  <p>
                    {'数据范围：'}
                    {periodMeta.range}
                    {' · 快照指标截至'}
                    {dataCutoff}
                  </p>
                </div>
                <div className="category-health-grid">
                  {categorySatisfaction830.map((item) => {
                    const values = categoryDrillMetrics(item.name);
                    const categoryMetrics = activeProductionMetricNames.map((name) =>
                      productionMetricCardData(name, values),
                    );
                    const risk = drillRowRiskLevel(values);
                    return (
                      <article
                        className={`panel category-health-card ${selectedCategory === item.name ? 'selected' : ''}`}
                        key={item.name}
                      >
                        <button
                          className="category-card-title"
                          onClick={() => selectCategory(item.name)}
                        >
                          <strong>{item.name}</strong>
                          <em
                            className={`achievement-status ${liveData ? 'status-neutral' : risk === '健康' ? 'status-ok' : 'status-bad'}`}
                          >
                            {liveData
                              ? activeProductionMetricNames.some((name) =>
                                  Number.isFinite(values[name]),
                                )
                                ? '已更新'
                                : '开发中'
                              : risk}
                          </em>
                        </button>
                        {categoryMetrics.map((metric) => (
                          <button
                            className="category-card-metric"
                            data-context-id={`category-metric-${item.name}-${metric.name}`}
                            data-context-scope="品类指标"
                            data-context-label={`${item.name} · ${metric.name}`}
                            data-context-summary={`${activeAnalysisPeriod}，${metric.statisticType}，当前值${metric.value}，${metric.gap}。`}
                            aria-label={`查看${item.name}${metric.name}${activeAnalysisPeriod}明细`}
                            key={metric.name}
                            onClick={() => selectCategory(item.name, metric.name)}
                          >
                            <span className="category-card-label">
                              {metric.name}
                              <small>
                                {metric.statisticType === '快照指标'
                                  ? `最新快照 · 截至${dataCutoff}`
                                  : periodMeta.current}
                              </small>
                            </span>
                            <span className="category-card-result">
                              <b className={metric.state}>{metric.value}</b>
                              <small className={metric.state}>{metric.gap}</small>
                            </span>
                          </button>
                        ))}
                      </article>
                    );
                  })}
                </div>
                <div
                  className="panel category-detail-table category-list-visible"
                  id="category-detail-list"
                >
                  <div className="category-table-tabs-scroll">
                    <div
                      className="category-table-tabs"
                      style={
                        {
                          '--production-tab-count': activeProductionMetricTabs.length + 1,
                        } as CSSProperties
                      }
                      role="tablist"
                      aria-label={`品类${activeProductionMetricNames.length}项指标清单`}
                    >
                      {[
                        {
                          key: 'overview' as const,
                          label: `${activeProductionMetricNames.length}项指标总览`,
                        },
                        ...activeProductionMetricTabs,
                      ].map((item) => (
                        <button
                          role="tab"
                          aria-selected={categoryTab === item.key}
                          key={item.key}
                          className={categoryTab === item.key ? 'selected' : ''}
                          onClick={() => setCategoryTab(item.key as CategoryMetricTab)}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="category-period-heading">
                    <div>
                      <span>
                        {'生产视角 · 指标清单 · '}
                        {activeAnalysisPeriod}
                      </span>
                      <h3>
                        {categoryTab === 'overview'
                          ? `${activeProductionMetricNames.length}项指标${periodMeta.shortLabel}明细`
                          : `${activeCategoryMetric}${periodMeta.shortLabel}明细`}
                      </h3>
                    </div>
                    <p>
                      {'数据范围：'}
                      {periodMeta.range}
                      {' · 快照截至'}
                      {dataCutoff}
                    </p>
                  </div>
                  <div className="category-drill-note" role="note">
                    {'品项、物料组层级当前使用原型演示拆分值，待接业务明细接口后替换。'}
                  </div>
                  <div
                    className="category-table-content category-drill-table"
                    style={categoryTab === 'overview' ? productionOverviewRowStyle : undefined}
                    role="treegrid"
                    aria-label={
                      categoryTab === 'overview'
                        ? `品类品项物料组${activeProductionMetricNames.length}项指标下钻清单`
                        : `品类品项物料组${activeCategoryMetric}${periodMeta.label}下钻清单`
                    }
                  >
                    <div
                      className={`category-drill-row category-drill-head ${categoryTab === 'overview' ? 'period-synced-overview' : 'period-metric'}`}
                      style={categoryTab === 'overview' ? productionOverviewRowStyle : undefined}
                      role="row"
                    >
                      <strong role="columnheader">{'名称'}</strong>
                      <span role="columnheader">{'层级'}</span>
                      {categoryTab === 'overview' ? (
                        activeProductionMetricNames.map((name) => (
                          <span role="columnheader" key={name}>
                            {name}
                            {metricStatisticType(name) === '快照指标' ? (
                              <small>{'快照'}</small>
                            ) : null}
                          </span>
                        ))
                      ) : (
                        <>
                          <span role="columnheader">{'目标'}</span>
                          <span role="columnheader">{'达成状态'}</span>
                          <span role="columnheader">
                            {metricStatisticType(activeCategoryMetric || '') === '快照指标'
                              ? '当前值'
                              : periodMeta.current}
                          </span>
                          <span role="columnheader">{periodMeta.previous}</span>
                          <span role="columnheader">{periodMeta.change}</span>
                          <span role="columnheader">{periodMeta.same}</span>
                          <span role="columnheader">{periodMeta.yoy}</span>
                        </>
                      )}
                      <span role="columnheader">{'风险状态'}</span>
                      <span role="columnheader">{'任务派发'}</span>
                    </div>
                    {baseProductHierarchy.map((category) => {
                      const categoryOpen = expandedCategoryListCategories.includes(category.name);
                      const categoryValues = categoryDrillMetrics(category.name);
                      return (
                        <div className="category-drill-group" role="rowgroup" key={category.name}>
                          <div
                            id={`category-row-${stableMetricSeed(category.name)}`}
                            className={`category-drill-row category-level ${selectedCategoryRowKey === category.name ? 'is-selected' : ''} ${categoryTab === 'overview' ? '' : 'period-metric'}`}
                            role="row"
                            aria-expanded={categoryOpen}
                          >
                            <button
                              className="category-drill-toggle"
                              role="gridcell"
                              onClick={() => toggleCategoryListCategory(category.name)}
                            >
                              <ChevronDown />
                              {category.name}
                            </button>
                            <span role="gridcell">
                              <em>{'品类'}</em>
                            </span>
                            {renderCategoryMetricCells(categoryValues)}
                            {renderDrillWorkflowCells(
                              '品类',
                              category.name,
                              categoryValues,
                              activeCategoryMetric,
                            )}
                          </div>
                          {categoryOpen &&
                            category.items.map((item) => {
                              const itemKey = `${category.name}::${item.name}`;
                              const itemOpen = expandedCategoryListItems.includes(itemKey);
                              const itemValues = categoryDrillMetrics(category.name, item.name);
                              const itemScope = `${category.name} / ${item.name}`;
                              return (
                                <div className="category-drill-group" role="rowgroup" key={itemKey}>
                                  <div
                                    id={`category-row-${stableMetricSeed(itemKey)}`}
                                    className={`category-drill-row item-level ${selectedCategoryRowKey === itemKey ? 'is-selected' : ''} ${categoryTab === 'overview' ? '' : 'period-metric'}`}
                                    role="row"
                                    aria-expanded={itemOpen}
                                  >
                                    <button
                                      className="category-drill-toggle"
                                      role="gridcell"
                                      onClick={() =>
                                        toggleCategoryListItem(category.name, item.name)
                                      }
                                    >
                                      <ChevronDown />
                                      {item.name}
                                    </button>
                                    <span role="gridcell">
                                      <em>{'品项'}</em>
                                    </span>
                                    {renderCategoryMetricCells(itemValues)}
                                    {renderDrillWorkflowCells(
                                      '品类',
                                      itemScope,
                                      itemValues,
                                      activeCategoryMetric,
                                    )}
                                  </div>
                                  {itemOpen &&
                                    item.materials.map((material, index) => {
                                      const materialValues = categoryDrillMetrics(
                                        category.name,
                                        item.name,
                                        material,
                                      );
                                      const materialScope = `${itemScope} / ${material}`;
                                      return (
                                        <div
                                          className={`category-drill-row material-level ${categoryTab === 'overview' ? '' : 'period-metric'}`}
                                          role="row"
                                          key={`${itemKey}::${material}::${index}`}
                                        >
                                          <strong role="gridcell">
                                            <i />
                                            {material}
                                          </strong>
                                          <span role="gridcell">
                                            <em>{'物料组'}</em>
                                          </span>
                                          {renderCategoryMetricCells(materialValues)}
                                          {renderDrillWorkflowCells(
                                            '品类',
                                            materialScope,
                                            materialValues,
                                            activeCategoryMetric,
                                          )}
                                        </div>
                                      );
                                    })}
                                </div>
                              );
                            })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>

              <section id="base-dashboard" data-context-id="base">
                <div className="section-heading">
                  <div>
                    <span>
                      {'基地模块 · '}
                      {activeAnalysisPeriod}
                    </span>
                    <h2>
                      {'基地'}
                      {activeProductionMetricNames.length}
                      {'项指标达成看板'}
                    </h2>
                  </div>
                  <p>
                    {'数据范围：'}
                    {periodMeta.range}
                    {' · 快照指标截至'}
                    {dataCutoff}
                  </p>
                </div>
                <div className="base-health-grid">
                  {base830.map((base) => {
                    const values = baseDrillMetrics(base.name);
                    const baseMetrics = activeProductionMetricNames.map((name) =>
                      productionMetricCardData(name, values),
                    );
                    const risk = drillRowRiskLevel(values);
                    return (
                      <article
                        className={`panel base-health-card ${selectedBase === base.name ? 'selected' : ''}`}
                        key={base.name}
                      >
                        <button
                          className="base-card-title"
                          onClick={() => selectBaseCard(base.name)}
                        >
                          <strong>{base.name}</strong>
                          <em
                            className={`achievement-status ${liveData ? 'status-neutral' : risk === '健康' ? 'status-ok' : 'status-bad'}`}
                          >
                            {liveData ? '待接入' : risk}
                          </em>
                        </button>
                        {baseMetrics.map((metric) => (
                          <button
                            className="base-card-metric"
                            data-context-id={`base-metric-${base.name}-${metric.name}`}
                            data-context-scope="基地指标"
                            data-context-label={`${base.name} · ${metric.name}`}
                            data-context-summary={`${activeAnalysisPeriod}，${metric.statisticType}，当前值${metric.value}，${metric.gap}。`}
                            aria-label={`查看${base.name}${metric.name}${activeAnalysisPeriod}明细`}
                            key={metric.name}
                            onClick={() => selectBaseCard(base.name, metric.name)}
                          >
                            <span className="base-card-label">
                              {metric.name}
                              <small>
                                {metric.statisticType === '快照指标'
                                  ? `最新快照 · 截至${dataCutoff}`
                                  : periodMeta.current}
                              </small>
                            </span>
                            <span className="base-card-result">
                              <b className={metric.state}>{metric.value}</b>
                              <small className={metric.state}>{metric.gap}</small>
                            </span>
                          </button>
                        ))}
                      </article>
                    );
                  })}
                </div>
              </section>

              <section id="cross-analysis" data-context-id="cross">
                <div className="matrix-heading cross-heading">
                  <div>
                    <span>
                      {'交叉分析 · '}
                      {activeAnalysisPeriod}
                    </span>
                    <h2>
                      {'基地 × 品类'}
                      {activeCrossMatrixModes.length}
                      {'项指标矩阵'}
                    </h2>
                    <small>
                      {'数据范围：'}
                      {periodMeta.range}
                      {' · 快照指标截至'}
                      {dataCutoff}
                    </small>
                  </div>
                  <div className="segmented cross-tabs" aria-label="矩阵指标切换">
                    {activeCrossMatrixModes.map((mode) => (
                      <button
                        key={mode}
                        className={activeCrossMode === mode ? 'selected' : ''}
                        onClick={() => setMatrixMode(mode)}
                      >
                        {matrixListMeta[mode].label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="matrix-layout">
                  <div className="matrix panel">
                    {activeCrossMode === 'stock' && (
                      <div className="matrix-format-note">
                        {'格式：可发货天数 / 剔除大日期 · 目标 ≤12天，挑战 ≤10天 · '}
                        {periodMeta.label}
                      </div>
                    )}
                    <div className="matrix-row matrix-header">
                      <span>{'基地'}</span>
                      {matrixCategoryNames.map((c) => (
                        <span key={c}>{c}</span>
                      ))}
                    </div>
                    {matrix
                      ? matrix.map((row) => (
                          <div className="matrix-row" key={row.base}>
                            <strong>{row.base}</strong>
                            {row.values.map((value, i) => {
                              const displayValue = liveData
                                ? productionMetricDisplay(
                                    crossMetricByMode[
                                      activeCrossMode as keyof typeof crossMetricByMode
                                    ],
                                    value,
                                  )
                                : activeCrossMode === 'stock'
                                  ? `${formatNumber(value, 1)}天 / 剔除大日期 ${formatNumber(adjustedStockValue(row.base, i) * matrixPeriodRatio(activeCrossMode), 1)}天`
                                  : `${formatNumber(value, 2)}%`;
                              return (
                                <button
                                  data-context-id={`cross-metric-${activeCrossMode}-${row.base}-${matrixCategoryNames[i]}`}
                                  data-context-scope="交叉分析单值"
                                  data-context-label={`${row.base} × ${matrixCategoryNames[i]} · ${activeMatrixListMeta.label}`}
                                  data-context-summary={`${activeAnalysisPeriod}，当前值${displayValue}，目标${activeMatrixListMeta.target}。`}
                                  title={`${row.base} × ${matrixCategoryNames[i]} · ${activeAnalysisPeriod}`}
                                  key={matrixCategoryNames[i]}
                                  className={
                                    liveData
                                      ? 'matrix-unavailable'
                                      : matrixClass(
                                          value,
                                          activeCrossMode === 'rate' ? 'rate' : 'stock',
                                        )
                                  }
                                  onClick={() => {
                                    setSelectedBase(row.base);
                                    setToast(`已筛选 ${row.base} ${activeAnalysisPeriod}风险项`);
                                  }}
                                >
                                  {liveData
                                    ? displayValue
                                    : activeCrossMode === 'stock'
                                      ? formatNumber(value, 1) +
                                        ' / ' +
                                        formatNumber(
                                          adjustedStockValue(row.base, i) *
                                            matrixPeriodRatio(activeCrossMode),
                                          1,
                                        )
                                      : formatNumber(value, 2) + '%'}
                                </button>
                              );
                            })}
                          </div>
                        ))
                      : base830.map((row) => (
                          <div className="matrix-row matrix-unavailable" key={row.name}>
                            <strong>{row.name}</strong>
                            {matrixCategoryNames.map((category) => (
                              <span key={category}>{'—'}</span>
                            ))}
                          </div>
                        ))}
                  </div>
                  <aside className="panel matrix-note">
                    <EditableHelp
                      key={activeMatrixHelp.storageKey}
                      compact
                      storageKey={activeMatrixHelp.storageKey}
                      label={activeMatrixHelp.label}
                      defaultText={activeMatrixHelp.defaultText}
                    />
                    <div className="ai-heading">
                      <Sparkles />
                      <span>{'AI 矩阵研判'}</span>
                    </div>
                    <h3>{matrixAnalysis.title}</h3>
                    <p>{matrixAnalysis.copy}</p>
                    <div className="matrix-thresholds">{matrixThresholdText[activeCrossMode]}</div>
                    {matrixRiskRows.length > 0 && activeCrossMode !== 'inventory' && (
                      <div className="legend">
                        <span>
                          <i className="heat-good" />
                          {'健康'}
                        </span>
                        <span>
                          <i className="heat-watch" />
                          {'预警'}
                        </span>
                        <span>
                          <i className="heat-critical" />
                          {'严重'}
                        </span>
                      </div>
                    )}
                  </aside>
                </div>
                <section
                  className="matrix-risk-list panel"
                  id="matrix-risk-list"
                  aria-labelledby="matrix-risk-list-title"
                >
                  <header>
                    <div>
                      <span>{'指标清单'}</span>
                      <h3 id="matrix-risk-list-title">
                        {activeMatrixListMeta.label}
                        {matrix ? '风险状态排序' : '明细'}
                      </h3>
                    </div>
                    <p>
                      {matrixRiskRows.length}
                      {' 项 · 目标 '}
                      {activeMatrixListMeta.target}
                      {' · '}
                      {matrix ? '基地 × 品类明细' : '当前汇总视角'}
                    </p>
                  </header>
                  <div
                    className="matrix-risk-table"
                    role="table"
                    aria-label={`${activeMatrixListMeta.label}风险排序清单`}
                  >
                    <div className="matrix-risk-row matrix-risk-head" role="row">
                      <span role="columnheader">{'排序'}</span>
                      <span role="columnheader">{'分析范围'}</span>
                      <span role="columnheader">{'当前值'}</span>
                      <span role="columnheader">{'目标差距'}</span>
                      <span role="columnheader">{'风险状态'}</span>
                      <span role="columnheader">{'数据粒度'}</span>
                      <span role="columnheader">{'任务派发'}</span>
                    </div>
                    <div className="matrix-risk-body">
                      {matrixRiskRows.length ? (
                        matrixRiskRows.map((item, index) => (
                          <div
                            className="matrix-risk-row"
                            role="row"
                            key={`${activeCrossMode}-${item.scope}`}
                          >
                            <strong role="cell">{String(index + 1).padStart(2, '0')}</strong>
                            <b role="cell">{item.scope}</b>
                            <span role="cell">
                              {formatNumber(item.value, 2)}
                              {activeMatrixListMeta.unit}
                              {item.adjusted !== undefined ? (
                                <small>
                                  {'剔除大日期 '}
                                  {formatNumber(item.adjusted, 2)}
                                  {'天'}
                                </small>
                              ) : null}
                            </span>
                            <span
                              role="cell"
                              className={
                                item.gap === 0
                                  ? 'watch'
                                  : activeCrossMode === 'stock'
                                    ? item.gap > 0
                                      ? 'bad'
                                      : 'good'
                                    : item.gap < 0
                                      ? 'bad'
                                      : 'good'
                              }
                            >
                              {activeCrossMode === 'inventory'
                                ? '—'
                                : `${item.gap > 0 ? '+' : ''}${formatNumber(item.gap, 2)}${activeMatrixListMeta.unit === '%' ? 'pp' : activeMatrixListMeta.unit}`}
                            </span>
                            <em
                              role="cell"
                              className={`matrix-risk-level level-${riskLevelClass[item.level]}`}
                            >
                              {activeCrossMode === 'inventory' ? '观察' : item.level}
                            </em>
                            <span role="cell">{item.granularity}</span>
                            {activeCrossMode === 'inventory'
                              ? null
                              : renderTaskDispatch(
                                  '交叉分析',
                                  item.scope,
                                  [activeMatrixListMeta.label],
                                  item.level,
                                )}
                          </div>
                        ))
                      ) : (
                        <div className="matrix-risk-empty">{matrixAnalysis.copy}</div>
                      )}
                    </div>
                  </div>
                </section>
              </section>

              <section id="base" data-context-id="base">
                <div
                  className="panel category-detail-table category-list-visible base-detail-table"
                  id="base-detail-list"
                >
                  <div className="category-table-tabs-scroll">
                    <div
                      className="category-table-tabs"
                      style={
                        {
                          '--production-tab-count': activeProductionMetricTabs.length + 1,
                        } as CSSProperties
                      }
                      role="tablist"
                      aria-label={`基地${activeProductionMetricNames.length}项指标清单`}
                    >
                      {[
                        {
                          key: 'overview' as const,
                          label: `${activeProductionMetricNames.length}项指标总览`,
                        },
                        ...activeProductionMetricTabs,
                      ].map((item) => (
                        <button
                          role="tab"
                          aria-selected={baseTab === item.key}
                          key={item.key}
                          className={baseTab === item.key ? 'selected' : ''}
                          onClick={() => setBaseTab(item.key as BaseMetricTab)}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="category-period-heading">
                    <div>
                      <span>
                        {'生产视角 · 基地指标清单 · '}
                        {activeAnalysisPeriod}
                      </span>
                      <h3>
                        {baseTab === 'overview'
                          ? `基地${activeProductionMetricNames.length}项指标${periodMeta.shortLabel}明细`
                          : `基地${activeBaseMetric}${periodMeta.shortLabel}明细`}
                      </h3>
                    </div>
                    <p>
                      {'数据范围：'}
                      {periodMeta.range}
                      {' · 快照截至'}
                      {dataCutoff}
                    </p>
                  </div>
                  <div className="category-drill-note" role="note">
                    {
                      '按“基地 → 品类 → 品项 → 物料组”四层展开；品项、物料组当前使用原型演示拆分值，待接业务明细接口后替换。'
                    }
                  </div>
                  <div
                    className="category-table-content category-drill-table base-drill-table"
                    style={baseTab === 'overview' ? productionOverviewRowStyle : undefined}
                    role="treegrid"
                    aria-label={
                      baseTab === 'overview'
                        ? `基地品类品项物料组${activeProductionMetricNames.length}项指标下钻清单`
                        : `基地品类品项物料组${activeBaseMetric}${periodMeta.label}下钻清单`
                    }
                  >
                    <div
                      className={`category-drill-row category-drill-head ${baseTab === 'overview' ? 'period-synced-overview' : 'period-metric'}`}
                      role="row"
                    >
                      <strong role="columnheader">{'基地 / 品类 / 品项 / 物料组'}</strong>
                      <span role="columnheader">{'层级'}</span>
                      {baseTab === 'overview' ? (
                        activeProductionMetricNames.map((name) => (
                          <span role="columnheader" key={name}>
                            {name}
                            {metricStatisticType(name) === '快照指标' ? (
                              <small>{'快照'}</small>
                            ) : null}
                          </span>
                        ))
                      ) : (
                        <>
                          <span role="columnheader">{'目标'}</span>
                          <span role="columnheader">{'达成状态'}</span>
                          <span role="columnheader">
                            {metricStatisticType(activeBaseMetric || '') === '快照指标'
                              ? '当前值'
                              : periodMeta.current}
                          </span>
                          <span role="columnheader">{periodMeta.previous}</span>
                          <span role="columnheader">{periodMeta.change}</span>
                          <span role="columnheader">{periodMeta.same}</span>
                          <span role="columnheader">{periodMeta.yoy}</span>
                        </>
                      )}
                      <span role="columnheader">{'风险状态'}</span>
                      <span role="columnheader">{'任务派发'}</span>
                    </div>
                    {base830.map((base) => {
                      const baseOpen = expandedBaseRows.includes(base.name);
                      const baseValues = baseDrillMetrics(base.name);
                      return (
                        <div className="category-drill-group" role="rowgroup" key={base.name}>
                          <div
                            id={`base-row-${stableMetricSeed(base.name)}`}
                            className={`category-drill-row category-level base-level ${selectedBaseRowKey === base.name ? 'is-selected' : ''} ${baseTab === 'overview' ? '' : 'period-metric'}`}
                            role="row"
                            aria-expanded={baseOpen}
                          >
                            <button
                              className="category-drill-toggle"
                              role="gridcell"
                              onClick={() => toggleBaseRow(base.name)}
                            >
                              <ChevronDown />
                              {base.name}
                            </button>
                            <span role="gridcell">
                              <em>{'基地'}</em>
                            </span>
                            {renderBaseMetricCells(baseValues)}
                            {renderDrillWorkflowCells(
                              '基地',
                              base.name,
                              baseValues,
                              activeBaseMetric,
                            )}
                          </div>
                          {baseOpen &&
                            categories.map((category) => {
                              const categoryKey = `${base.name}::${category}`;
                              const categoryOpen = expandedBaseCategoryRows.includes(categoryKey);
                              const categoryValues = baseDrillMetrics(base.name, category);
                              const productItems = baseCategoryProductItems(category);
                              return (
                                <div
                                  className="category-drill-group"
                                  role="rowgroup"
                                  key={categoryKey}
                                >
                                  <div
                                    id={`base-row-${stableMetricSeed(categoryKey)}`}
                                    className={`category-drill-row item-level base-category-level ${selectedBaseRowKey === categoryKey ? 'is-selected' : ''} ${baseTab === 'overview' ? '' : 'period-metric'}`}
                                    role="row"
                                    aria-expanded={categoryOpen}
                                  >
                                    <button
                                      className="category-drill-toggle"
                                      role="gridcell"
                                      onClick={() => toggleBaseCategoryRow(base.name, category)}
                                    >
                                      <ChevronDown />
                                      {category}
                                    </button>
                                    <span role="gridcell">
                                      <em>{'品类'}</em>
                                    </span>
                                    {renderBaseMetricCells(categoryValues)}
                                    {renderDrillWorkflowCells(
                                      '基地',
                                      categoryKey.replaceAll('::', ' / '),
                                      categoryValues,
                                      activeBaseMetric,
                                    )}
                                  </div>
                                  {categoryOpen &&
                                    productItems.map((item) => {
                                      const itemKey = `${categoryKey}::${item.name}`;
                                      const itemOpen = expandedBaseItemRows.includes(itemKey);
                                      const itemValues = baseDrillMetrics(
                                        base.name,
                                        category,
                                        item.name,
                                      );
                                      return (
                                        <div
                                          className="category-drill-group"
                                          role="rowgroup"
                                          key={itemKey}
                                        >
                                          <div
                                            className={`category-drill-row base-item-level ${baseTab === 'overview' ? '' : 'period-metric'}`}
                                            role="row"
                                            aria-expanded={itemOpen}
                                          >
                                            <button
                                              className="category-drill-toggle"
                                              role="gridcell"
                                              onClick={() =>
                                                toggleBaseItemRow(base.name, category, item.name)
                                              }
                                            >
                                              <ChevronDown />
                                              {item.name}
                                            </button>
                                            <span role="gridcell">
                                              <em>{'品项'}</em>
                                            </span>
                                            {renderBaseMetricCells(itemValues)}
                                            {renderDrillWorkflowCells(
                                              '基地',
                                              itemKey.replaceAll('::', ' / '),
                                              itemValues,
                                              activeBaseMetric,
                                            )}
                                          </div>
                                          {itemOpen &&
                                            item.materials.map((material, index) => {
                                              const materialValues = baseDrillMetrics(
                                                base.name,
                                                category,
                                                item.name,
                                                material,
                                              );
                                              const materialScope = `${itemKey.replaceAll('::', ' / ')} / ${material}`;
                                              return (
                                                <div
                                                  className={`category-drill-row material-level base-material-level ${baseTab === 'overview' ? '' : 'period-metric'}`}
                                                  role="row"
                                                  key={`${itemKey}::${material}::${index}`}
                                                >
                                                  <strong role="gridcell">
                                                    <i />
                                                    {material}
                                                  </strong>
                                                  <span role="gridcell">
                                                    <em>{'物料组'}</em>
                                                  </span>
                                                  {renderBaseMetricCells(materialValues)}
                                                  {renderDrillWorkflowCells(
                                                    '基地',
                                                    materialScope,
                                                    materialValues,
                                                    activeBaseMetric,
                                                  )}
                                                </div>
                                              );
                                            })}
                                        </div>
                                      );
                                    })}
                                </div>
                              );
                            })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>

              <section id="issues" data-context-id="risk">
                <div className="section-heading issue-heading">
                  <div>
                    <span>{'问题诊断'}</span>
                    <h2>
                      {analysisScope === 'overview'
                        ? '产销协同重点风险'
                        : analysisScope === 'sales'
                          ? '销售风险清单'
                          : '生产风险清单'}
                    </h2>
                  </div>
                  <div
                    className={`issue-filters risk-dimension-filters ${analysisScope === 'overview' ? 'sliding-risk-switch' : ''}`}
                    style={
                      analysisScope === 'overview'
                        ? ({
                            '--risk-tab-index': overviewRiskPerspective === 'production' ? 0 : 1,
                          } as CSSProperties)
                        : undefined
                    }
                  >
                    {analysisScope === 'overview' ? (
                      <>
                        <button
                          className={overviewRiskPerspective === 'production' ? 'selected' : ''}
                          onClick={() => setOverviewRiskPerspective('production')}
                        >
                          {'生产风险'}
                        </button>
                        <button
                          className={overviewRiskPerspective === 'sales' ? 'selected' : ''}
                          onClick={() => setOverviewRiskPerspective('sales')}
                        >
                          {'销售风险'}
                        </button>
                      </>
                    ) : analysisScope === 'sales' ? (
                      (['大区', '省区', '销售组'] as const).map((level) => (
                        <button
                          key={level}
                          className={salesRiskLevel === level ? 'selected' : ''}
                          onClick={() => setSalesRiskLevel(level)}
                        >
                          {level}
                        </button>
                      ))
                    ) : (
                      (
                        [
                          ['category', '品类'],
                          ['base', '基地'],
                          ['cross', '交叉分析'],
                        ] as const
                      ).map(([dimension, label]) => (
                        <button
                          key={dimension}
                          className={productionDimension === dimension ? 'selected' : ''}
                          onClick={() => setProductionDimension(dimension)}
                        >
                          {label}
                        </button>
                      ))
                    )}
                  </div>
                </div>
                <div className="panel diagnostic-risk-board">
                  <header>
                    <div className="ai-heading">
                      <AlertTriangle />
                      <span>
                        {activeRiskPerspective === 'sales'
                          ? `${salesRiskLevel}销售组织风险`
                          : analysisScope === 'overview'
                            ? '生产重点风险'
                            : productionDimension === 'category'
                              ? '品类生产风险'
                              : productionDimension === 'base'
                                ? '基地生产风险'
                                : '基地 × 品类交叉风险'}
                      </span>
                    </div>
                    <div className="diagnostic-risk-summary">
                      <span className="risk-period-context">
                        {activeAnalysisPeriod}
                        {' · 截至'}
                        {dataCutoff}
                      </span>
                      <span className="critical">
                        {'严重 '}
                        <b>{criticalRiskCount}</b>
                      </span>
                      <span className="warning">
                        {'预警 '}
                        <b>{warningRiskCount}</b>
                      </span>
                      <small>
                        {'按风险等级与目标差距排序 · 展示 '}
                        {diagnosticItems.length}
                        {' 项'}
                      </small>
                      <EditableHelp compact {...annotationHelp.shortage} />
                    </div>
                  </header>
                  <div className="diagnostic-risk-head" role="row">
                    <span>{'排序'}</span>
                    <span>{'分析对象'}</span>
                    <span>{'层级'}</span>
                    <span>{'异常指标'}</span>
                    <span>{'当前值'}</span>
                    <span>{'目标'}</span>
                    <span>{'目标差距'}</span>
                    <span>{'风险状态'}</span>
                    <span>{'任务操作'}</span>
                  </div>
                  <div className="diagnostic-risk-list">
                    {diagnosticItems.length ? (
                      diagnosticItems.map((item, index) => (
                        <article
                          className="diagnostic-risk-row"
                          role="row"
                          key={item.id}
                          data-context-id={`risk-${item.id}`}
                          data-context-scope="风险诊断"
                          data-context-label={`${item.scope} · ${item.metric}`}
                          data-context-summary={`${item.levelLabel}，当前值${item.value}，目标${item.target}，目标差距${item.gap}，风险状态${item.risk}。`}
                        >
                          <strong>{String(index + 1).padStart(2, '0')}</strong>
                          <button
                            className="diagnostic-risk-scope"
                            onClick={item.jump}
                            title="跳转到对应指标明细"
                          >
                            {item.scope}
                            <ArrowRight />
                          </button>
                          <span>{item.levelLabel}</span>
                          <b>{item.metric}</b>
                          <span>{item.value}</span>
                          <span>{item.target}</span>
                          <span className="bad">{item.gap}</span>
                          <em className={`matrix-risk-level level-${riskLevelClass[item.risk]}`}>
                            {item.risk}
                          </em>
                          {renderTaskDispatch(
                            item.scopeType,
                            item.scope,
                            [item.metric],
                            item.risk,
                            false,
                          )}
                        </article>
                      ))
                    ) : (
                      <div className="diagnostic-risk-empty">
                        {liveData ? <AlertTriangle /> : <Check />}
                        <strong>
                          {liveData
                            ? liveOrdersAvailable && activeRiskPerspective === 'production'
                              ? '当前可判定数据未检出风险项'
                              : '风险数据开发中'
                            : '当前维度暂无风险项'}
                        </strong>
                        <span>
                          {liveData
                            ? '仅依据当前页面有效数据及已有阈值判定；缺失指标不计入。'
                            : '当前指标均处于健康状态。'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </section>

              <section id="cadence">
                <div className="section-heading">
                  <div>
                    <span>{'会议节奏'}</span>
                    <h2>{'月度计划协同日历'}</h2>
                  </div>
                  <p>{'每月 24—30 日关键协同窗口'}</p>
                </div>
                <div className="panel cadence">
                  <div className="cadence-line" />
                  {cadence.map((item) => (
                    <article key={item.day}>
                      <div className={`day-dot ${item.done ? 'done' : ''}`}>
                        {item.done ? <Check /> : item.day}
                      </div>
                      <small>
                        {'8月'}
                        {item.day}
                        {'日'}
                      </small>
                      <h3>{item.title}</h3>
                      <p>{item.owner}</p>
                    </article>
                  ))}
                </div>
              </section>
            </section>
          </div>
        )}
      </main>
      <aside className="ai-chat" aria-label="产销协同数字人">
        {chatMode === 'sidebar' && (
          <div
            className="chat-resize-handle"
            role="separator"
            aria-label="调整 Agent 对话框宽度"
            aria-orientation="vertical"
            aria-valuemin={280}
            aria-valuemax={560}
            aria-valuenow={chatWidth}
            tabIndex={0}
            onPointerDown={startChatResize}
            onKeyDown={(event) => {
              if (event.key === 'ArrowLeft') setChatWidth((value) => Math.min(560, value + 20));
              if (event.key === 'ArrowRight') setChatWidth((value) => Math.max(280, value - 20));
            }}
          >
            <span />
          </div>
        )}
        <header className="chat-toolbar">
          <div className="chat-view-switch">
            <button
              className={chatMode === 'collapsed' ? 'selected' : ''}
              aria-label="卡片视图：收起对话框"
              title="收起对话框"
              onClick={() => setChatMode('collapsed')}
            >
              <Boxes />
            </button>
            <button
              className={chatMode === 'sidebar' ? 'selected' : ''}
              aria-label="对话视图：右侧边栏展示"
              title="右侧边栏展示"
              onClick={() => setChatMode('sidebar')}
            >
              <PanelRight />
            </button>
            <button
              className={chatMode === 'expanded' ? 'selected' : ''}
              aria-label="消息列表：扩展对话框"
              title="扩展对话框"
              onClick={() => setChatMode('expanded')}
            >
              <MessageSquare />
            </button>
          </div>
          <button className="icon-button chat-secondary-action" aria-label="对话历史">
            <History />
          </button>
          <button
            className="icon-button chat-secondary-action"
            aria-label="新建对话"
            onClick={() => setMessages([])}
          >
            <Plus />
          </button>
        </header>
        <div className={`chat-body ${messages.length ? 'has-messages' : ''}`}>
          {messages.length === 0 ? (
            <div className="chat-welcome">
              <section className="agent-profile" aria-labelledby="agent-name">
                <div className="agent-avatar-action">
                  <span className="chat-bot-mark">
                    <img
                      src="/images/sop-digital-human-avatar-cartoon.png"
                      alt="产销协同数字人头像"
                    />
                  </span>
                  <button
                    type="button"
                    className="agent-help-button"
                    aria-label="查看产销协同数字人岗位说明"
                    title="岗位职责与岗位技能"
                    onClick={() => setAgentDetailsOpen(true)}
                  >
                    <CircleHelp />
                  </button>
                </div>
                <h2 id="agent-name">{'产销协同数字人'}</h2>
                <p>
                  {'我可以帮你分析产销指标、识别经营异常、生成改善建议，并跟进协同任务的闭环进度。'}
                </p>
              </section>
              <section className="agent-functions" aria-labelledby="agent-functions-title">
                <h3 id="agent-functions-title">{'常用功能'}</h3>
                <div className="agent-function-list">
                  <button onClick={() => askAI('生成本周产销协同会议摘要')}>
                    <LayoutGrid />
                    <span>
                      <strong>{'经营情况总览'}</strong>
                      <small>{'快速查看核心指标与主要风险'}</small>
                    </span>
                    <ArrowRight />
                  </button>
                  <button onClick={() => askAI('哪些基地订单满足率未达目标？')}>
                    <PackageSearch />
                    <span>
                      <strong>{'定位异常指标'}</strong>
                      <small>{'识别未达标基地与关键差距'}</small>
                    </span>
                    <ArrowRight />
                  </button>
                  <button onClick={() => askAI('水饺缺货的根因和措施？')}>
                    <WandSparkles />
                    <span>
                      <strong>{'生成改善建议'}</strong>
                      <small>{'分析根因并给出纠偏动作'}</small>
                    </span>
                    <ArrowRight />
                  </button>
                  <button onClick={() => askAI('列出本周到期任务')}>
                    <ClipboardCheck />
                    <span>
                      <strong>{'跟进协同任务'}</strong>
                      <small>{'查看待办、到期任务与闭环状态'}</small>
                    </span>
                    <ArrowRight />
                  </button>
                  <button onClick={() => setExportDialogOpen(true)}>
                    <Download />
                    <span>
                      <strong>{'导出经营报表'}</strong>
                      <small>{'选择指标、风险或任务内容导出'}</small>
                    </span>
                    <ArrowRight />
                  </button>
                </div>
              </section>
              <section className="agent-suggestions" aria-labelledby="agent-suggestions-title">
                <h3 id="agent-suggestions-title">{'你可以这样问'}</h3>
                <div className="prompt-list">
                  {suggestedQuestions.slice(0, 4).map((question) => (
                    <button key={question} onClick={() => askAI(question)}>
                      {question}
                      <ArrowRight />
                    </button>
                  ))}
                </div>
              </section>
            </div>
          ) : (
            <div className="message-list">
              {messages.map((message, index) => (
                <div className={`chat-message ${message.role}`} key={`${message.role}-${index}`}>
                  <span>{message.role === 'assistant' ? <Bot /> : '刘'}</span>
                  <div>
                    {message.contexts?.length ? (
                      <div className="message-contexts">
                        <small>{'引用看板'}</small>
                        {message.contexts.map((context) => (
                          <em key={context}>{context}</em>
                        ))}
                      </div>
                    ) : null}
                    {message.text}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="chat-composer">
          {selectedContexts.length > 0 && (
            <div className="selected-context-cards">
              <span>{'已引用看板内容'}</span>
              {selectedContexts.map((item) => (
                <article key={item.id}>
                  <div>
                    <small>{item.scope}</small>
                    <strong>{item.label}</strong>
                    <em title={item.summary}>{item.summary}</em>
                  </div>
                  <button
                    type="button"
                    aria-label={`移除${item.label}`}
                    onClick={() =>
                      setSelectedContexts((items) =>
                        items.filter((context) => context.id !== item.id),
                      )
                    }
                  >
                    <X />
                  </button>
                </article>
              ))}
            </div>
          )}
          <form
            className="chat-input"
            onSubmit={(event) => {
              event.preventDefault();
              askAI(chatInput);
            }}
          >
            <button
              type="button"
              className={
                contextSelectionMode || selectedContexts.length
                  ? 'context-button active'
                  : 'context-button'
              }
              aria-label={contextSelectionMode ? '取消选择看板模块' : '引用看板模块'}
              aria-pressed={contextSelectionMode}
              title={contextSelectionMode ? '取消选择' : '点击后到左侧看板选择模块'}
              onClick={() => {
                if (contextSelectionMode) {
                  setContextSelectionMode(false);
                  return;
                }
                if (chatMode === 'expanded') setChatMode('sidebar');
                setContextSelectionMode(true);
              }}
            >
              <Plus />
            </button>
            <textarea
              rows={2}
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  askAI(chatInput);
                }
              }}
              placeholder={
                selectedContexts.length ? '结合已引用内容提问' : '请输入问题，或选择上面的快捷操作'
              }
              aria-label="向产销协同数字人提问"
            />
            <button
              type="submit"
              className="send-button"
              aria-label="发送问题"
              disabled={!chatInput.trim()}
            >
              <Send />
            </button>
          </form>
        </div>
      </aside>
      {exportDialogOpen &&
        createPortal(
          <div className="task-dialog-backdrop" onMouseDown={() => setExportDialogOpen(false)}>
            <section
              className="task-dialog export-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="export-dialog-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <header>
                <div>
                  <small>{'报表导出'}</small>
                  <h2 id="export-dialog-title">{'选择需要导出的内容'}</h2>
                </div>
                <button
                  type="button"
                  aria-label="关闭导出窗口"
                  onClick={() => setExportDialogOpen(false)}
                >
                  <X />
                </button>
              </header>
              <div className="export-dialog-context">
                <span>
                  {analysisScope === 'overview'
                    ? '总览视角'
                    : analysisScope === 'production'
                      ? '生产视角'
                      : '销售视角'}
                </span>
                <b>{activeAnalysisPeriod}</b>
                <small>{periodMeta.range}</small>
              </div>
              <div className="export-section-list">
                {exportSections.map((section) => {
                  const selected = selectedExportSections.includes(section.name);
                  return (
                    <label className={selected ? 'selected' : ''} key={section.name}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleExportSection(section.name)}
                      />
                      <span className="export-check">{selected && <Check />}</span>
                      <span>
                        <strong>{section.name}</strong>
                        <small>{section.description}</small>
                      </span>
                    </label>
                  );
                })}
              </div>
              <footer>
                <button type="button" onClick={() => setExportDialogOpen(false)}>
                  {'取消'}
                </button>
                <button
                  type="button"
                  className="primary"
                  disabled={!selectedExportSections.length}
                  onClick={exportReport}
                >
                  <Download />
                  {'导出所选内容'}
                </button>
              </footer>
            </section>
          </div>,
          document.body,
        )}
      {agentDetailsOpen &&
        createPortal(
          <div
            className="agent-detail-backdrop"
            onMouseDown={() => setAgentDetailsOpen(false)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setAgentDetailsOpen(false);
            }}
          >
            <section
              className="agent-detail-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="agent-detail-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <header>
                <div className="agent-detail-identity">
                  <img
                    src="/images/sop-digital-human-avatar-cartoon.png"
                    alt="产销协同数字人头像"
                  />
                  <div>
                    <small>{'数字员工岗位说明'}</small>
                    <h2 id="agent-detail-title">{'产销协同数字人'}</h2>
                    <p>
                      {'面向计划、销售、生产、库存与履约协同场景，持续发现异常并推动问题闭环。'}
                    </p>
                    <div className="agent-detail-mentors" aria-label="导师信息">
                      <span>
                        <b>{'业务导师'}</b>
                        {'产销协同负责人'}
                      </span>
                      <span>
                        <b>{'IT 导师'}</b>
                        {'数字化平台主管'}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  autoFocus
                  aria-label="关闭岗位说明"
                  onClick={() => setAgentDetailsOpen(false)}
                >
                  <X />
                </button>
              </header>
              <div className="agent-detail-content">
                <section>
                  <div className="agent-detail-section-title">
                    <ClipboardCheck />
                    <div>
                      <span>{'岗位职责'}</span>
                      <small>{'这个数字人负责什么'}</small>
                    </div>
                  </div>
                  <ol>
                    <li>
                      <strong>{'经营监测'}</strong>
                      <p>
                        {
                          '持续扫描销售、计划、订单、库存和履约指标，识别目标偏差、趋势恶化与异常组合。'
                        }
                      </p>
                    </li>
                    <li>
                      <strong>{'异常研判'}</strong>
                      <p>
                        {
                          '结合基地、品类、客户和时间维度定位问题范围，形成异常等级、影响范围和优先级判断。'
                        }
                      </p>
                    </li>
                    <li>
                      <strong>{'原因与措施建议'}</strong>
                      <p>
                        {
                          '汇总指标变化、业务事实和历史经验，生成待核实原因、纠偏建议及预期改善目标。'
                        }
                      </p>
                    </li>
                    <li>
                      <strong>{'任务编排'}</strong>
                      <p>{'根据异常对象推荐责任人、任务内容和完成时限，支持人工确认后派发。'}</p>
                    </li>
                    <li>
                      <strong>{'过程跟踪'}</strong>
                      <p>
                        {'跟踪任务进度、到期风险和一线补充信息，对超期或信息不足事项及时提醒升级。'}
                      </p>
                    </li>
                    <li>
                      <strong>{'闭环复盘'}</strong>
                      <p>
                        {'核验整改动作与指标恢复情况，区分“动作完成”和“问题关闭”，沉淀可复用经验。'}
                      </p>
                    </li>
                  </ol>
                </section>
                <section>
                  <div className="agent-detail-section-title">
                    <WandSparkles />
                    <div>
                      <span>{'岗位技能'}</span>
                      <small>{'这个数字人能够怎么做'}</small>
                    </div>
                  </div>
                  <ol>
                    <li>
                      <strong>{'指标理解与问数'}</strong>
                      <p>{'理解指标口径、目标和业务含义，可基于看板引用内容回答经营问题。'}</p>
                    </li>
                    <li>
                      <strong>{'多维穿透分析'}</strong>
                      <p>{'从总览下钻至基地、品类和交叉组合，对比本期、环比、同比与目标差距。'}</p>
                    </li>
                    <li>
                      <strong>{'异常识别与分级'}</strong>
                      <p>{'按规则识别健康、预警和严重状态，并对风险进行排序与聚焦。'}</p>
                    </li>
                    <li>
                      <strong>{'归因推理与建议生成'}</strong>
                      <p>{'将数据异常与业务事实关联，输出原因假设、核查清单和可执行改善动作。'}</p>
                    </li>
                    <li>
                      <strong>{'协同任务管理'}</strong>
                      <p>
                        {'生成、派发、催办和追踪异常任务，记录责任、时限、处理结果与完成证据。'}
                      </p>
                    </li>
                    <li>
                      <strong>{'人机协同与知识沉淀'}</strong>
                      <p>
                        {'在关键决策点请求人工确认，将经过验证的规则、案例和处置经验用于后续工作。'}
                      </p>
                    </li>
                  </ol>
                </section>
              </div>
              <footer>
                <span>{'高风险派发、业务事实确认和最终闭环验收仍由人工决策。'}</span>
                <button type="button" onClick={() => setAgentDetailsOpen(false)}>
                  {'我知道了'}
                </button>
              </footer>
            </section>
          </div>,
          document.body,
        )}
      {taskTarget &&
        createPortal(
          <div className="task-dialog-backdrop" onMouseDown={() => setTaskTarget(null)}>
            <form
              className="task-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="task-dialog-title"
              onMouseDown={(event) => event.stopPropagation()}
              onSubmit={(event) => {
                event.preventDefault();
                saveTaskAssignment();
              }}
            >
              <header>
                <div>
                  <small>
                    {taskTarget.scopeType}
                    {'异常任务'}
                  </small>
                  <h2 id="task-dialog-title">
                    {taskTarget.taskId ? '修改任务' : '派发任务'}
                    {' · '}
                    {taskScopeDisplay(taskTarget.scopeType, taskTarget.scope)}
                  </h2>
                </div>
                <button type="button" aria-label="关闭任务窗口" onClick={() => setTaskTarget(null)}>
                  <X />
                </button>
              </header>
              <div className="task-period-preview">
                <span>{'分析周期'}</span>
                <b>{activeAnalysisPeriod}</b>
                <span>{'统计口径'}</span>
                <b>{metricStatisticType(taskDraft.metric)}</b>
                <span>{'数据截止'}</span>
                <b>{dataCutoff}</b>
              </div>
              <div className="task-dialog-fields">
                <label>
                  <span>{'异常指标'}</span>
                  <select
                    value={taskDraft.metric}
                    onChange={(event) => {
                      const metric = event.target.value;
                      setTaskDraft((draft) => ({
                        ...draft,
                        metric,
                        content: `处理${taskScopeDisplay(taskTarget.scopeType, taskTarget.scope)}${metric}异常，完成原因核查并落实纠偏动作。`,
                      }));
                    }}
                  >
                    {taskTarget.anomalies.map((metric) => (
                      <option key={metric}>{metric}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>{'责任人'}</span>
                  <input
                    autoFocus
                    required
                    value={taskDraft.owner}
                    onChange={(event) =>
                      setTaskDraft((draft) => ({ ...draft, owner: event.target.value }))
                    }
                    placeholder="请输入责任人"
                  />
                </label>
                <label className="task-content-field">
                  <span>{'任务内容'}</span>
                  <textarea
                    required
                    value={taskDraft.content}
                    onChange={(event) =>
                      setTaskDraft((draft) => ({ ...draft, content: event.target.value }))
                    }
                  />
                </label>
                <label>
                  <span>{'完成时间'}</span>
                  <input
                    type="date"
                    required
                    value={taskDraft.due}
                    onChange={(event) =>
                      setTaskDraft((draft) => ({ ...draft, due: event.target.value }))
                    }
                  />
                </label>
              </div>
              <footer>
                <button type="button" onClick={() => setTaskTarget(null)}>
                  {'取消'}
                </button>
                <button
                  className="primary"
                  type="submit"
                  disabled={!taskDraft.owner.trim() || !taskDraft.content.trim() || !taskDraft.due}
                >
                  {taskTarget.taskId ? '保存修改' : '确认派发'}
                </button>
              </footer>
            </form>
          </div>,
          document.body,
        )}
      {completionTargetId &&
        (() => {
          const task = assignedTasks.find((item) => item.id === completionTargetId);
          if (!task) return null;
          const isCompleted = task.status === '已完成';
          return createPortal(
            <div className="task-dialog-backdrop" onMouseDown={() => setCompletionTargetId(null)}>
              <form
                className="task-dialog completion-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="completion-dialog-title"
                onMouseDown={(event) => event.stopPropagation()}
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!isCompleted) saveTaskCompletion();
                }}
              >
                <header>
                  <div>
                    <small>{'任务闭环'}</small>
                    <h2 id="completion-dialog-title">
                      {isCompleted ? '查看完成情况' : '录入完成情况'}
                      {' · '}
                      {task.scope}
                    </h2>
                  </div>
                  <button
                    type="button"
                    aria-label="关闭完成情况窗口"
                    onClick={() => setCompletionTargetId(null)}
                  >
                    <X />
                  </button>
                </header>
                <div className="completion-task-summary">
                  <span>{task.scopeType}</span>
                  <strong>{task.metric}</strong>
                  <p>{task.content}</p>
                  <small>
                    {'统计口径：'}
                    {task.analysisPeriod || '既有任务'}
                    {' · '}
                    {task.statisticType || metricStatisticType(task.metric)}
                    {'　数据截止：'}
                    {task.dataCutoff || '—'}
                  </small>
                  <small>
                    {'责任人：'}
                    {task.owner}
                    {'　计划完成时间：'}
                    {task.due}
                  </small>
                </div>
                <div className="task-dialog-fields">
                  <label className="task-content-field">
                    <span>{'完成情况'}</span>
                    {isCompleted ? (
                      <div className="completion-detail">
                        {task.completionSummary || '暂无完成情况记录'}
                      </div>
                    ) : (
                      <textarea
                        autoFocus
                        required
                        value={completionDraft}
                        onChange={(event) => setCompletionDraft(event.target.value)}
                        placeholder="请填写已完成的工作、处理结果及后续安排"
                      />
                    )}
                  </label>
                  {isCompleted && (
                    <label>
                      <span>{'实际完成时间'}</span>
                      <div className="completion-meta">
                        {task.completedAt
                          ? new Date(task.completedAt).toLocaleString('zh-CN', { hour12: false })
                          : '—'}
                      </div>
                    </label>
                  )}
                </div>
                <footer>
                  {isCompleted ? (
                    <button
                      className="primary completed-close"
                      type="button"
                      onClick={() => setCompletionTargetId(null)}
                    >
                      {'关闭'}
                    </button>
                  ) : (
                    <>
                      <button type="button" onClick={() => setCompletionTargetId(null)}>
                        {'取消'}
                      </button>
                      <button
                        className="primary completion-confirm"
                        type="submit"
                        disabled={!completionDraft.trim()}
                      >
                        {'确认完成'}
                      </button>
                    </>
                  )}
                </footer>
              </form>
            </div>,
            document.body,
          );
        })()}
      {toast && (
        <div className="toast" role="status">
          <Check />
          {toast}
        </div>
      )}
    </div>
  );
}
