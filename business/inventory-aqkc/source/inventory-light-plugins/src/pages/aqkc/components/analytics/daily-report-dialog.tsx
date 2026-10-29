'use client';
import { QueryErrors } from '../../../../../../../../shared/query-errors';

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button, Checkbox, Input, Modal, Select, Spin } from '../../../../dsh-ui/controls';
import { IconClose, IconDown, IconDownload, IconFile, IconRefresh } from '../../../../dsh-ui/icons';
import { withAppBasePath } from '../../../../../../aqkc/web/src/lib/app-base-path.ts';
import { createRuntimeId } from '../../../../../../aqkc/web/src/lib/runtime-id.ts';
import {
  reportDate,
  reportQuantity,
  reportTimestamp,
  type DailyReport,
  type ReportModule,
  type ReportRisk,
} from '../../../../../../aqkc/web/src/lib/daily-report.ts';
import {
  applyReportFeedback,
  feedbackTargets,
  feedbackViews,
  FEEDBACK_TYPES,
  KNOWN_REASONS,
  type DailyFeedback,
  type FeedbackBundle,
  type FeedbackType,
} from '../../../../../../aqkc/web/src/lib/daily-report-feedback.ts';
import { dailyReportMarkdown } from '../../../../../../aqkc/web/src/lib/daily-report-export.ts';
import dialogStyles from './answer-result-dialog.module.css';
import styles from './daily-report-dialog.module.css';

function ReportBaseSelect({
  bases,
  value,
  onChange,
}: {
  bases: string[];
  value: string;
  onChange: (base: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const update = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const height = Math.min(bases.length * 34 + 12, 250);
      setPosition({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - 168)),
        top:
          rect.bottom + height + 4 <= window.innerHeight - 8
            ? rect.bottom + 4
            : Math.max(8, rect.top - height - 4),
      });
    };
    const close = (event: PointerEvent) => {
      if (
        !trigger.current?.contains(event.target as Node) &&
        !menu.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    update();
    document.addEventListener('pointerdown', close);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      document.removeEventListener('pointerdown', close);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, bases]);
  useEffect(() => {
    if (!bases.length) setOpen(false);
  }, [bases.length]);
  const dialog = trigger.current?.closest('dialog');
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={styles.baseSelect}
        aria-label="切换日报基地"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={!bases.length}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
            requestAnimationFrame(() =>
              menu.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus(),
            );
          }
          if (event.key === 'Escape' && open) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
          }
        }}
      >
        <span>{value ? `${value}基地` : '暂无可见基地'}</span>
        <IconDown />
      </button>
      {open &&
        position &&
        dialog &&
        createPortal(
          <div
            ref={menu}
            className={styles.baseSelectMenu}
            role="listbox"
            aria-label="日报基地"
            style={position}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                setOpen(false);
                trigger.current?.focus();
              }
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                const options = Array.from(
                  menu.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [],
                );
                const index = options.indexOf(document.activeElement as HTMLButtonElement);
                options[
                  (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length
                ]?.focus();
              }
            }}
          >
            {bases.map((base) => (
              <button
                key={base}
                type="button"
                role="option"
                aria-selected={value === base}
                onClick={() => {
                  onChange(base);
                  setOpen(false);
                  trigger.current?.focus();
                }}
              >
                <span>{base}基地</span>
                {value === base && <span aria-hidden="true">✓</span>}
              </button>
            ))}
          </div>,
          dialog,
        )}
    </>
  );
}

const DIRECTORY = [
  ['summary', '今日分析'],
  ['metrics', '核心指标'],
  ['age', '货龄结构'],
  ['shortage', '缺货风险'],
  ['movement', '滞库风险'],
  ['feedback', '反馈与跟进'],
  ['sources', '数据说明'],
];
function downloadReport(source: DailyReport, entries: DailyFeedback[]) {
  const report = applyReportFeedback(source, entries);
  const url = URL.createObjectURL(
    new Blob([dailyReportMarkdown(report, entries)], {
      type: 'text/markdown;charset=utf-8',
    }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = `${report.bases.join('-')}库存运营日报-${report.date}.md`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
type Props = {
  className?: string;
  bases: string[];
  initialBase?: string;
  onBoard?: (risk?: ReportRisk, base?: string) => void;
  onAsk?: (question: string) => void;
};
type Draft = {
  targetId: string;
  type: FeedbackType;
  content: string;
  knownReason: (typeof KNOWN_REASONS)[number];
};
function Section({
  id,
  title,
  hint,
  children,
}: {
  id: string;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section id={`daily-${id}`} data-report-section={id} className={styles.section}>
      <div className={styles.sectionHeading}>
        <h3>{title}</h3>
        {hint && <span>{hint}</span>}
      </div>
      {children}
    </section>
  );
}
function FeedbackForm({
  draft,
  report,
  query,
  onClose,
  onSaved,
}: {
  draft: Draft;
  report: DailyReport;
  query: string;
  onClose: () => void;
  onSaved: (f: DailyFeedback) => void;
}) {
  const [targetId, setTargetId] = useState(draft.targetId),
    [type, setType] = useState(draft.type),
    [content, setContent] = useState(draft.content);
  const [knownReason, setKnownReason] = useState(draft.knownReason),
    [role, setRole] = useState('');
  const [validUntil, setValidUntil] = useState(() =>
    reportDate(new Date(Date.now() + 7 * 86400000).toISOString()),
  );
  const [expectedDate, setExpectedDate] = useState(''),
    [carryForward, setCarryForward] = useState(true),
    [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false),
    [error, setError] = useState('');
  const requestId = useRef(crypto.randomUUID());
  const targets = feedbackTargets(report);
  const save = async () => {
    if (saving || !confirmed || !targetId || !content.trim()) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch(
        withAppBasePath(`/api/inventory/daily-report/feedback${query}`),
        {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(90000),
          body: JSON.stringify({
            requestId: requestId.current,
            targetId,
            type,
            content,
            knownReason,
            role,
            validUntil,
            expectedDate,
            carryForward,
            confirmed,
            quantityAtReview: targets.find((t) => t.id === targetId)?.quantity,
          }),
        },
      );
      const result = await response.json();
      if (!response.ok || !result.feedback) throw new Error(result.error || '反馈未保存，请重试。');
      onSaved(result.feedback);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '反馈未保存，请重试。');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      visible
      title="补充业务反馈"
      okText="确认保存反馈"
      cancelText="取消"
      onCancel={() => {
        if (!saving) onClose();
      }}
      onOk={() => void save()}
      confirmLoading={saving}
      okButtonProps={{ disabled: !confirmed || !targetId || !content.trim() }}
      maskClosable={false}
      escToExit={!saving}
      closable={!saving}
      style={{ width: 'min(620px, calc(100vw - 32px))' }}
      autoFocus
      focusLock
    >
      <div className={styles.feedbackForm}>
        <p className={styles.muted}>反馈将关联下方对象并供后续日报引用。当前仅本人可见。</p>
        <label>
          关联对象
          <Select
            aria-label="关联对象"
            showSearch
            value={targetId}
            onChange={(v) => {
              setTargetId(v);
              setConfirmed(false);
            }}
            options={targets.map((t) => ({ label: t.label, value: t.id }))}
          />
        </label>
        <div className={styles.formGrid}>
          <label>
            反馈类型
            <Select
              aria-label="反馈类型"
              value={type}
              onChange={(v) => {
                setType(v);
                setConfirmed(false);
              }}
              options={[...FEEDBACK_TYPES]}
            />
          </label>
          <label>
            已知业务原因
            <Select
              aria-label="已知业务原因"
              value={knownReason}
              onChange={(v) => {
                setKnownReason(v);
                setConfirmed(false);
              }}
              options={[...KNOWN_REASONS]}
            />
          </label>
        </div>
        <label>
          反馈内容
          <Input.TextArea
            aria-label="反馈内容"
            value={content}
            maxLength={2000}
            showWordLimit
            autoSize={{ minRows: 4, maxRows: 8 }}
            onChange={(v) => {
              setContent(v);
              setConfirmed(false);
            }}
            placeholder="说明原因、后续动作及可核验依据…"
          />
        </label>
        <label>
          建议责任角色
          <Select
            aria-label="建议责任角色"
            allowClear
            value={role}
            onChange={(v) => setRole(v ?? '')}
            options={['平台计划', '基地计划', '生产', '销售', '仓库', '大数据 / 系统']}
          />
        </label>
        <div className={styles.formGrid}>
          <label>
            预计完成时间
            <input
              aria-label="预计完成时间"
              type="date"
              value={expectedDate}
              min={reportDate(new Date().toISOString())}
              onChange={(e) => setExpectedDate(e.target.value)}
            />
          </label>
          <label>
            有效至
            <input
              aria-label="反馈有效至"
              type="date"
              value={validUntil}
              min={reportDate(new Date().toISOString())}
              required
              onChange={(e) => {
                setValidUntil(e.target.value);
                setConfirmed(false);
              }}
            />
          </label>
        </div>
        <Checkbox checked={carryForward} onChange={setCarryForward}>
          带入次日报告
        </Checkbox>
        <Checkbox checked={confirmed} onChange={setConfirmed}>
          我已核对关联对象、反馈内容和有效期，确认保存
        </Checkbox>
        {error && (
          <p role="alert" className={styles.warning}>
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

function ReportBody({
  source,
  feedback,
  query,
  onSaved,
  onBoard,
  onAsk,
  onRegenerate,
  regenerated,
  cacheHit,
}: {
  source: DailyReport;
  feedback: FeedbackBundle;
  query: string;
  onSaved: (f: DailyFeedback) => void;
  onBoard: (r?: ReportRisk) => void;
  onAsk?: (q: string) => void;
  onRegenerate: () => void;
  regenerated: boolean;
  cacheHit: boolean;
}) {
  const report = useMemo(
    () => applyReportFeedback(source, feedback.entries),
    [source, feedback.entries],
  );
  const views = useMemo(() => feedbackViews(source, feedback.entries), [source, feedback.entries]);
  const latestViews = useMemo(
    () => [...new Map([...views].reverse().map((view) => [view.target.id, view])).values()],
    [views],
  );
  const [active, setActive] = useState('summary'),
    [directoryVisible, setDirectoryVisible] = useState(true),
    [draft, setDraft] = useState<Draft | null>(null),
    [expanded, setExpanded] = useState<string | null>(null);
  const [assistantText, setAssistantText] = useState(''),
    [assistantAnswer, setAssistantAnswer] = useState(''),
    [notice, setNotice] = useState('');
  const article = useRef<HTMLElement>(null);
  useEffect(() => {
    const root = article.current?.closest('.dsh-modal-content');
    if (!root) return;
    const update = () => {
      const top =
        (article.current?.querySelector('nav')?.getBoundingClientRect().bottom ??
          root.getBoundingClientRect().top) + 60;
      let current = 'summary';
      article.current?.querySelectorAll<HTMLElement>('[data-report-section]').forEach((el) => {
        if (el.getBoundingClientRect().top <= top) current = el.dataset.reportSection ?? current;
      });
      setActive(current);
    };
    root.addEventListener('scroll', update, { passive: true });
    return () => root.removeEventListener('scroll', update);
  }, []);
  const go = (id: string) => {
    article.current
      ?.querySelector(`#daily-${id}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActive(id);
    setDirectoryVisible(false);
  };
  const edit = (
    targetId: string,
    type: FeedbackType = '原因说明',
    knownReason: Draft['knownReason'] = '待确认',
    content = '',
  ) => setDraft({ targetId, type, knownReason, content });
  const copySummary = async (rows: ReportRisk[]) => {
    const value = `【库存运营协同摘要】${report.date}\n范围：${report.bases.join(' / ')}\n生成时间：${reportTimestamp(report.generatedAt)}\n${rows.map((r) => `${r.object}：${r.evidence}\n建议：${r.action}\n建议责任角色：${r.role}\n反馈状态：${r.feedbackStatus}`).join('\n\n')}\n由 AI 生成；建议需业务确认。`;
    setAssistantAnswer(value);
    try {
      await navigator.clipboard.writeText(value);
      setNotice('协同摘要已复制，可自行分享给相关人员。');
    } catch {
      setNotice('摘要已在右侧生成，请选中复制。');
    }
  };
  const dataModule = report.modules.find((module) => module.id === 'quality');
  const moduleOverview = (module: ReportModule) => {
    return (
      <>
        {module.id === 'age' && (
          <div className={styles.ageBands}>
            {report.ageBands.slice(0, 4).map((b) => (
              <div key={b.label}>
                <span>{b.label}</span>
                <strong>
                  {reportQuantity(b.quantity)} <small>件</small>
                </strong>
                <span>{b.share === null ? '—' : `${(b.share * 100).toFixed(1)}%`}</span>
              </div>
            ))}
          </div>
        )}
        {module.overview.map((group) => (
          <div className={styles.overviewGroup} key={group.title}>
            <h4>{group.title}</h4>
            <dl className={styles.overviewFacts}>
              {group.metrics.map((metric) => (
                <div key={metric.label}>
                  <dt>{metric.label}</dt>
                  <dd>
                    {reportQuantity(metric.value)}
                    {metric.value !== null ? metric.unit : ''}
                  </dd>
                  {metric.note && <small>{metric.note}</small>}
                </div>
              ))}
            </dl>
          </div>
        ))}
      </>
    );
  };
  const riskActions = (risk: ReportRisk) => (
    <div className={styles.rowActions}>
      <Button type="text" size="mini" disabled={!feedback.available} onClick={() => edit(risk.id)}>
        补充原因
      </Button>
      <Button
        type="text"
        size="mini"
        disabled={!feedback.available}
        onClick={() => edit(risk.id, '处理计划')}
      >
        填写处理计划
      </Button>
      <Button
        type="text"
        size="mini"
        disabled={!feedback.available}
        onClick={() => edit(risk.id, '例外说明')}
      >
        标记已知原因
      </Button>
      <Button
        type="text"
        size="mini"
        onClick={() => setExpanded(expanded === risk.id ? null : risk.id)}
      >
        {expanded === risk.id ? '收起明细' : '查看明细'}
      </Button>
      <Button type="text" size="mini" onClick={() => onBoard(risk)}>
        去固定看板看更多
      </Button>
    </div>
  );
  const details = (r: ReportRisk) =>
    expanded === r.id ? (
      <div className={styles.detailGrid}>
        {r.details.map((d) => (
          <div key={d.label}>
            <span>{d.label}</span>
            <strong>{d.value}</strong>
          </div>
        ))}
        <p>
          本行明细来自日报生成时快照；仓库、批次及订单逐行数据尚未接入日报。更多明细请进入实时看板。
        </p>
      </div>
    ) : null;
  const renderFeedback = (items: typeof views) =>
    items.length ? (
      <ul className={styles.feedbackList}>
        {items.map((f) => (
          <li key={f.id}>
            <div>
              <strong>{f.target.label}</strong>
              <span className={styles.level}>{f.state}</span>
            </div>
            <p>
              {f.type} · {f.content}
            </p>
            <small>
              {f.author} · {reportTimestamp(f.createdAt)} · 有效至 {f.validUntil}
              {f.role ? ` · ${f.role}` : ''}
            </small>
            <p className={styles.muted}>{f.explanation}</p>
            {f.state !== '已关闭' && (
              <Button
                type="text"
                size="mini"
                disabled={
                  !feedback.available || !feedbackTargets(report).some((t) => t.id === f.target.id)
                }
                onClick={() =>
                  edit(
                    f.target.id,
                    f.state === '待复核' ? f.type : '执行进展',
                    f.knownReason,
                    f.content,
                  )
                }
              >
                补充 / 续期
              </Button>
            )}
          </li>
        ))}
      </ul>
    ) : (
      <p className={styles.muted}>暂无记录。</p>
    );
  return (
    <>
      <div className={styles.layout}>
        <article className={styles.report} ref={article}>
          {directoryVisible && (
            <nav className={styles.directory} aria-label="日报目录">
              {DIRECTORY.map(([id, label]) => {
                const hasRisk =
                  id === 'sources'
                    ? report.qualityIssues.length > 0
                    : Boolean(report.modules.find((m) => m.id === id)?.groups.length);
                return (
                  <button
                    type="button"
                    key={id}
                    className={active === id ? styles.activeAnchor : ''}
                    aria-current={active === id ? 'location' : undefined}
                    onClick={() => go(id)}
                  >
                    {id === 'sources' ? dataModule?.title : label}
                    {hasRisk ? <i aria-label="有待关注对象" /> : null}
                  </button>
                );
              })}
            </nav>
          )}
          <Section id="summary" title="一、今日分析" hint={`由 AI 生成 · ${report.riskLevel}`}>
            <div className={styles.summary}>
              {report.summary.map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
            <div className={styles.sectionActions}>
              <Button size="small" disabled={!feedback.available} onClick={() => edit('report')}>
                补充今日总体说明
              </Button>
              <Button size="small" type="text" onClick={() => go('feedback')}>
                查看历史反馈
              </Button>
            </div>
          </Section>
          <Section id="metrics" title="二、核心指标" hint="缺失值以 — 展示">
            <div className={styles.metrics}>
              {report.coreMetrics.map((m) => (
                <div className={styles.metric} key={m.label}>
                  <span>{m.label}</span>
                  <strong>
                    {reportQuantity(m.value, m.unit === '件' ? 0 : 1)}
                    <small>{m.value !== null ? m.unit : ''}</small>
                  </strong>
                  {m.auxiliaries?.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                  {m.note && <p>{m.note}</p>}
                </div>
              ))}
            </div>
          </Section>
          {report.modules
            .filter((m) => m.id !== 'quality')
            .map((m, index) => (
              <Section
                key={m.id}
                id={m.id}
                title={`${['三', '四', '五'][index]}、${m.title}`}
                hint="概览统计全部可核验对象 · 表格展示重点对象"
              >
                <div className={styles.moduleLayout}>
                  <div className={styles.moduleOverview}>{moduleOverview(m)}</div>
                  <div className={styles.moduleAnalysis}>
                    <h4>AI 分析</h4>
                    {m.yesterday && <p>{m.yesterday}</p>}
                    <p>{m.conclusion}</p>
                    <small>{m.description}</small>
                  </div>
                </div>
                {m.groups.map((g) => (
                  <div className={styles.baseGroup} key={g.base}>
                    <h4>
                      {g.base}基地 <span>{g.risks.length}项待跟进</span>
                    </h4>
                    <div className={styles.tableScroll}>
                      <table>
                        <thead>
                          <tr>
                            <th>对象</th>
                            <th>风险 / 关键数据</th>
                            <th>今日建议</th>
                            <th>反馈状态</th>
                            <th>操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.risks.map((r) => (
                            <Fragment key={r.id}>
                              <tr>
                                <td>
                                  <strong>{r.object}</strong>
                                </td>
                                <td>
                                  <span className={styles.level}>{r.kind}</span>
                                  <p>{r.evidence}</p>
                                </td>
                                <td>
                                  {r.action}
                                  <p className={styles.muted}>{r.role}</p>
                                </td>
                                <td>{r.feedbackStatus}</td>
                                <td>{riskActions(r)}</td>
                              </tr>
                              {expanded === r.id && (
                                <tr>
                                  <td colSpan={5}>{details(r)}</td>
                                </tr>
                              )}
                            </Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className={styles.sectionActions}>
                      <Button size="mini" onClick={() => void copySummary(g.risks)}>
                        生成协同摘要
                      </Button>
                      <Button
                        size="mini"
                        type="text"
                        disabled={!feedback.available}
                        onClick={() => edit(`module:${m.id}`, '处理计划')}
                      >
                        补充模块计划
                      </Button>
                    </div>
                  </div>
                ))}
                {!m.groups.length && (
                  <p className={styles.muted}>
                    当前可用数据未列示该模块的重点对象。数据缺失时不能判定正常。
                  </p>
                )}
              </Section>
            ))}
          <Section id="feedback" title="六、反馈与跟进" hint="反馈当前仅本人可见 · 不自动执行建议">
            <QueryErrors
              errors={!feedback.available && feedback.warning ? [feedback.warning] : []}
              scope="inventory-aqkc-feedback"
            />
            <h4>今日新增反馈</h4>
            {renderFeedback(views.filter((f) => reportDate(f.createdAt) === report.date))}
            <details className={styles.history}>
              <summary>
                历史有效反馈（
                {
                  views.filter((f) => reportDate(f.createdAt) !== report.date && f.state === '有效')
                    .length
                }
                ）
              </summary>
              {renderFeedback(
                views.filter((f) => reportDate(f.createdAt) !== report.date && f.state === '有效'),
              )}
            </details>
            <h4>待复核反馈</h4>
            {renderFeedback(
              latestViews.filter((f) => f.state === '待复核' || f.state === '风险未列示'),
            )}
            <h4>处理进展</h4>
            {renderFeedback(
              latestViews.filter(
                (f) => f.state === '有效' && (f.type === '处理计划' || f.type === '执行进展'),
              ),
            )}
            <h4>今日需补充</h4>
            <ul className={styles.notes}>
              {report.risks
                .filter((r) => r.feedbackStatus === '待反馈')
                .slice(0, 5)
                .map((r) => (
                  <li key={r.id}>
                    {r.object}：请 {r.role} 补充原因或处理计划。
                  </li>
                ))}
            </ul>
            <details className={styles.history}>
              <summary>已关闭记录</summary>
              {renderFeedback(views.filter((f) => f.state === '已关闭'))}
            </details>
            <Button size="small" disabled={!feedback.available} onClick={() => edit('report')}>
              新增日报备注
            </Button>
          </Section>
          <Section id="sources" title={`七、${dataModule?.title ?? '数据说明'}`}>
            <div className={styles.toolbar}>
              <span>
                {cacheHit ? '已缓存 · ' : regenerated ? '已重新生成 · ' : ''}
                {report.status} · 生成于 {reportTimestamp(report.generatedAt)}
              </span>
              <div className={styles.rowActions}>
                <Button size="small" onClick={() => onBoard()}>
                  查看实时看板
                </Button>
                <Button size="small" icon={<IconRefresh />} onClick={onRegenerate}>
                  重新生成
                </Button>
              </div>
            </div>
            {report.localPreview && (
              <p className={styles.warning}>本地验证数据，尚未应用生产用户权限。</p>
            )}
            {report.qualityIssues.length > 0 && (
              <p className={styles.moduleConclusion}>{dataModule?.conclusion}</p>
            )}
            <div className={styles.tableScroll}>
              <table>
                <thead>
                  <tr>
                    <th>来源</th>
                    <th>状态</th>
                    <th>快照时间（北京时间）</th>
                  </tr>
                </thead>
                <tbody>
                  {report.sources.map((s) => (
                    <tr key={s.label}>
                      <td>{s.label}</td>
                      <td>{s.status}</td>
                      <td>{reportTimestamp(s.snapshot)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <details className={styles.history}>
              <summary>查看统计口径与数据边界</summary>
              <ul className={styles.notes}>
                {report.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </details>
          </Section>
        </article>
        <aside className={styles.assistant}>
          <p className={styles.eyebrow}>AI 助手</p>
          <h3>围绕今日风险继续分析</h3>
          <p className={styles.muted}>当前日报快照 · {report.bases.join(' / ')}</p>
          <Button
            long
            size="small"
            onClick={() =>
              onAsk
                ? onAsk(
                    `请基于当前${report.bases.join('、')}日报解释今日库存风险，区分已核验事实、推断与数据缺口；不要将不同口径混用。`,
                  )
                : setAssistantAnswer(report.summary.join('\n\n'))
            }
          >
            解释今日库存风险
          </Button>
          <Button
            long
            size="small"
            onClick={() =>
              onAsk
                ? onAsk(
                    `请基于当前${report.bases.join('、')}日报生成今日协同摘要，列出责任角色、建议动作和待核验项；仅生成草稿，不提交业务。`,
                  )
                : void copySummary(report.risks.slice(0, 5))
            }
          >
            生成今日协同摘要
          </Button>
          {onAsk && (
            <Button
              long
              size="small"
              onClick={() =>
                onAsk(`请查询${report.bases.join('、')}哪些SKU货龄风险最高，说明数据快照及依据。`)
              }
            >
              去对话查询最新明细
            </Button>
          )}
          {assistantAnswer && <div className={styles.assistantAnswer}>{assistantAnswer}</div>}
          <label className={styles.assistantLabel}>
            补充业务反馈
            <Input.TextArea
              aria-label="对话补充业务反馈"
              value={assistantText}
              onChange={setAssistantText}
              maxLength={2000}
              autoSize={{ minRows: 4, maxRows: 8 }}
              placeholder="例如：该SKU为活动备货，预计本周开始出货…"
            />
          </label>
          <Button
            type="primary"
            long
            disabled={!feedback.available || !assistantText.trim()}
            onClick={() => {
              const candidates = feedbackTargets(report).filter(
                (t) =>
                  t.type === 'risk' &&
                  assistantText.includes(t.material) &&
                  assistantText.includes(t.base),
              );
              edit(
                candidates.length === 1 ? candidates[0].id : '',
                '原因说明',
                '待确认',
                assistantText,
              );
            }}
          >
            关联对象并确认反馈
          </Button>
          <p className={styles.muted}>需选择具体对象并确认后保存；补充反馈不会自动生成事件。</p>
          {notice && (
            <p className={styles.notice} role="status">
              {notice}
            </p>
          )}
        </aside>
      </div>
      {draft && (
        <FeedbackForm
          draft={draft}
          report={source}
          query={query}
          onClose={() => setDraft(null)}
          onSaved={(f) => {
            onSaved(f);
            setDraft(null);
            setAssistantText('');
            setNotice('反馈已保存，后续日报将在有效期内引用。');
          }}
        />
      )}
    </>
  );
}

export function DailyReportButton({ className, bases, initialBase, onBoard, onAsk }: Props) {
  const [open, setOpen] = useState(false),
    [attempt, setAttempt] = useState(0),
    [report, setReport] = useState<DailyReport | null>(null);
  const [feedback, setFeedback] = useState<FeedbackBundle>({
      available: false,
      entries: [],
    }),
    [loading, setLoading] = useState(false),
    [error, setError] = useState<string | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const [baseSelection, setBaseSelection] = useState('');
  const [loadedQuery, setLoadedQuery] = useState('');
  const [cacheHit, setCacheHit] = useState(false);
  const availableBases = [...new Set(bases)];
  const defaultBase =
    initialBase && availableBases.includes(initialBase) ? initialBase : (availableBases[0] ?? '');
  const selectedBase = availableBases.includes(baseSelection) ? baseSelection : defaultBase;
  const query = selectedBase ? `?base=${encodeURIComponent(selectedBase)}` : '';
  useEffect(() => {
    if (!open) {
      setReport(null);
      setError(null);
      return;
    }
    if (!query) {
      setReport(null);
      setError(null);
      setFeedback({ available: false, entries: [] });
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    let active = true,
      timedOut = false;
    setLoadedQuery(query);
    setLoading(true);
    setError(null);
    setReport(null);
    setCacheHit(false);
    setFeedback({ available: false, entries: [] });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 90000);
    void (async () => {
      try {
        const response = await fetch(
          withAppBasePath(`/api/inventory/daily-report${query}${attempt > 0 ? '&refresh=1' : ''}`),
          {
            cache: 'no-store',
            credentials: 'same-origin',
            signal: controller.signal,
            headers: { 'X-Client-Request-Id': createRuntimeId('daily-report') },
          },
        );
        const payload = await response.json();
        if (!response.ok || !payload.report)
          throw new Error(
            typeof payload.error === 'string' ? payload.error : '日报暂时无法生成，请稍后重试。',
          );
        if (active) {
          setReport(payload.report);
          setCacheHit(payload.cacheHit === true);
          setFeedback(
            payload.feedback ?? {
              available: false,
              entries: [],
              warning: '反馈服务尚未接入。',
            },
          );
        }
      } catch (reason) {
        if (active)
          setError(
            timedOut
              ? '日报读取超时，请重试。'
              : reason instanceof Error
                ? reason.message
                : '日报暂时无法生成，请稍后重试。',
          );
      } finally {
        clearTimeout(timer);
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, attempt, query]);
  return (
    <>
      <Button
        size="small"
        className={className}
        icon={<IconFile />}
        onClick={(e) => {
          trigger.current = e.currentTarget instanceof HTMLElement ? e.currentTarget : null;
          setBaseSelection(defaultBase);
          setAttempt(0);
          setOpen(true);
        }}
      >
        查看日报
      </Button>
      <Modal
        visible={open}
        title={
          <div className={styles.dialogTitle}>
            <span>
              库存运营日报{' '}
              <small>
                {report?.date ?? reportDate(new Date().toISOString())} · 当前对象：
                {selectedBase ? `${selectedBase}基地` : '暂无'}
              </small>
            </span>
            <div className={styles.baseSwitcher}>
              <ReportBaseSelect
                bases={availableBases}
                value={selectedBase}
                onChange={(base) => {
                  setBaseSelection(base);
                  setAttempt(0);
                }}
              />
              <Button
                size="small"
                icon={<IconDownload />}
                disabled={!report || report.empty || loading || loadedQuery !== query}
                onClick={() => {
                  if (report) downloadReport(report, feedback.entries);
                }}
              >
                导出
              </Button>
            </div>
          </div>
        }
        onCancel={() => setOpen(false)}
        footer={null}
        afterClose={() => {
          if (trigger.current?.isConnected) trigger.current.focus();
        }}
        closeIcon={
          <button type="button" aria-label="关闭日报" className={dialogStyles.closeButton}>
            <IconClose />
          </button>
        }
        unmountOnExit
        escToExit
        focusLock
        autoFocus
        className={dialogStyles.dialog}
        style={{ width: 'min(1560px, calc(100vw - 32px))' }}
      >
        {!selectedBase ? (
          <div className={styles.state}>
            <h3>暂无可见基地</h3>
            <p>取得基地访问权限后即可按基地查看日报。</p>
          </div>
        ) : loading || loadedQuery !== query ? (
          <div className={styles.state} role="status" aria-live="polite">
            <Spin />
            <h3>
              正在{attempt > 0 ? '重新生成' : '读取'}
              {selectedBase}基地日报
            </h3>
            <p>{attempt > 0 ? '正在重新读取库存、货龄和订单…' : '正在读取库存、货龄和订单…'}</p>
          </div>
        ) : error ? (
          <div className={styles.state}>
            <QueryErrors errors={[error]} scope="inventory-aqkc-daily-report" />
            <h3>暂无日报数据</h3>
            <Button onClick={() => setAttempt((v) => v + 1)}>重试</Button>
          </div>
        ) : report?.empty ? (
          <div className={styles.state}>
            <h3>暂无可生成日报的数据</h3>
            <p>当前所选权限范围内没有完整可用的当前库存，暂不生成日报。</p>
            <Button onClick={() => setAttempt((v) => v + 1)}>重新读取</Button>
          </div>
        ) : report ? (
          <ReportBody
            key={report.generatedAt}
            source={report}
            feedback={feedback}
            query={query}
            regenerated={attempt > 0}
            cacheHit={cacheHit}
            onRegenerate={() => setAttempt((v) => v + 1)}
            onSaved={(f) =>
              setFeedback((v) => ({
                ...v,
                entries: [f, ...v.entries.filter((x) => x.id !== f.id)],
              }))
            }
            onBoard={(r) => {
              setOpen(false);
              onBoard?.(r, selectedBase);
            }}
            onAsk={
              onAsk
                ? (q) => {
                    setOpen(false);
                    onAsk(q);
                  }
                : undefined
            }
          />
        ) : null}
      </Modal>
    </>
  );
}
