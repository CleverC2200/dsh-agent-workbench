import { reportQuantity, reportTimestamp, type DailyReport } from './daily-report';
import { feedbackViews, type DailyFeedback } from './daily-report-feedback';

const escape = (value: string) =>
  value.replace(/[|\\<>]/g, (char) => `\\${char}`).replace(/\r?\n/g, ' ');

export function dailyReportMarkdown(report: DailyReport, feedback: DailyFeedback[]) {
  const lines = [
    `# ${report.bases.join(' / ')}库存运营日报（${report.date}）`,
    '',
    '由 AI 生成',
    '',
    `数据范围：${report.scope}；${report.localPreview ? '本地验证数据，未应用生产用户权限。' : '仅包含当前授权范围。'}`,
    `生成时间：${reportTimestamp(report.generatedAt)}；报告状态：${report.status}`,
    '',
    '## 一、今日分析',
    '',
    ...report.summary.map((summary, index) => `${index + 1}. ${summary}`),
    '',
    '## 二、核心指标',
    '',
    '| 指标 | 当前值 | 辅助指标与口径 |',
    '|---|---:|---|',
    ...report.coreMetrics.map(
      (metric) =>
        `| ${metric.label} | ${reportQuantity(metric.value, metric.unit === '件' ? 0 : 1)}${metric.value === null ? '' : metric.unit} | ${escape([...(metric.auxiliaries ?? []), metric.note ?? ''].filter(Boolean).join('；'))} |`,
    ),
    '',
  ];

  for (const [index, module] of report.modules
    .filter((module) => module.id !== 'quality')
    .entries()) {
    lines.push(
      `## ${['三', '四', '五'][index]}、${module.title}`,
      '',
      module.description,
      '',
      module.yesterday ?? '',
      `AI 分析：${module.conclusion}`,
      '',
    );
    if (module.id === 'age')
      lines.push(
        '| 货龄区间 | 数量 | 占比 |',
        '|---|---:|---:|',
        ...report.ageBands
          .slice(0, 4)
          .map(
            (b) =>
              `| ${b.label} | ${reportQuantity(b.quantity)} | ${b.share === null ? '—' : `${(b.share * 100).toFixed(1)}%`} |`,
          ),
        '',
      );
    for (const overview of module.overview)
      lines.push(
        `### ${overview.title}`,
        '',
        '| 指标 | 数量 | 说明 |',
        '|---|---:|---|',
        ...overview.metrics.map(
          (m) =>
            `| ${m.label} | ${reportQuantity(m.value)}${m.value === null ? '' : m.unit} | ${escape(m.note ?? '')} |`,
        ),
        '',
      );
    if (!module.groups.length) lines.push('当前可用数据未列示重点对象；不能据此判定正常。', '');
    for (const group of module.groups) {
      lines.push(`### ${group.base}基地重点对象`, '');
      for (const risk of group.risks)
        lines.push(
          `- **${escape(risk.object)}**：${escape(risk.evidence)}；反馈：${risk.feedbackStatus}`,
          `  - 明细：${escape(risk.details.map((detail) => `${detail.label} ${detail.value}`).join('；'))}`,
          `  - AI 动作：${escape(risk.action)} 建议响应：${escape(risk.role)}`,
          '',
        );
    }
  }

  lines.push('## 六、反馈与跟进', '');
  const views = feedbackViews(report, feedback);
  if (!views.length) lines.push('暂无已读取的反馈记录。', '');
  for (const feedbackView of views)
    lines.push(
      `- ${escape(feedbackView.target.label)}｜${feedbackView.state}｜${feedbackView.type}：${escape(feedbackView.content)}`,
      `  - ${escape(feedbackView.author)}；${reportTimestamp(feedbackView.createdAt)}；有效至 ${feedbackView.validUntil}；${feedbackView.explanation}`,
      '',
    );

  const dataModule = report.modules.find((module) => module.id === 'quality');
  lines.push(
    `## 七、${dataModule?.title ?? '数据说明'}`,
    '',
    dataModule?.conclusion ?? '',
    '',
    ...report.sources.map(
      (source) => `- ${source.label}：${source.status}；快照 ${reportTimestamp(source.snapshot)}`,
    ),
    '',
    ...report.notes.map((note) => `- ${note}`),
  );
  return lines.join('\n');
}
