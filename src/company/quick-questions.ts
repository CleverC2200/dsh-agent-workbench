import { z } from 'zod';
import policies from './quick-question-policies.json' with { type: 'json' };

const displayText = z.string().min(1).max(240);
export const quickQuestionSnapshotSchema = z.object({
  agent: z.string().min(1).max(100),
  scope: displayText,
  selection: z.enum(['list', 'selected']),
  rows: z
    .array(
      z.object({
        name: displayText,
        facts: z.record(z.string(), z.object({ label: displayText, display: displayText })),
      }),
    )
    .max(200),
});
export type QuickQuestionSnapshot = z.infer<typeof quickQuestionSnapshotSchema>;
export type QuickQuestionPolicy = {
  rules: readonly { field?: string; text: string }[];
};
const configuredPolicies: Readonly<Record<string, QuickQuestionPolicy>> = policies;

export const quickQuestionMessageSchema = z.object({
  protocol: z.literal('workbench-quick-questions-v1'),
  owner: z.string(),
  sessionId: z.string(),
  sequence: z.number().int().nonnegative(),
  snapshot: quickQuestionSnapshotSchema.nullable().catch(null),
});

export function buildQuickQuestions(
  snapshot: QuickQuestionSnapshot | null,
  configuration: Readonly<Record<string, QuickQuestionPolicy>> = configuredPolicies,
): string[] {
  if (!snapshot?.rows.length) return [];
  const policy = configuration[snapshot.agent];
  if (!policy) return [];
  const questions = new Set<string>();
  for (const rule of policy.rules) {
    const start = questions.size % snapshot.rows.length;
    for (let offset = 0; offset < snapshot.rows.length; offset++) {
      const row = snapshot.rows[(start + offset) % snapshot.rows.length];
      const fact = rule.field ? row.facts[rule.field] : undefined;
      if (rule.field && (!fact || fact.display === '—')) continue;
      const values: Record<string, string> = {
        name: row.name,
        label: fact?.label ?? '',
        value: fact?.display ?? '',
      };
      const question = rule.text.replace(
        /\{(name|label|value)\}/g,
        (_, key: string) => values[key],
      );
      if (!question.includes(row.name) || questions.has(question)) continue;
      questions.add(question);
      break;
    }
    if (questions.size === 4) break;
  }
  return questions.size >= 3 ? [...questions] : [];
}
