import { z } from 'zod';

const resultSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    value: z.object({
      people: z.array(
        z.object({
          username: z.string().min(1),
          realname: z.string(),
          orgCodeTxt: z.string(),
        }),
      ),
      hasMore: z.boolean(),
    }),
  }),
  z.object({
    ok: z.literal(false),
    error: z.object({ code: z.string(), message: z.string().min(1).max(400) }),
  }),
]);

export async function searchWarningPeople(parameters: unknown, signal: AbortSignal) {
  const response = await fetch('/api/gea-proof/people/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parameters),
    signal,
  });
  signal.throwIfAborted();
  if (response.status === 404)
    throw Error('人员搜索接口不可用，请更新 GEA 与 Workbench 插件后重试');
  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    signal.throwIfAborted();
    throw Error('人员查询服务返回异常，请稍后重试');
  }
  signal.throwIfAborted();
  const result = resultSchema.safeParse(raw);
  if (!result.success) throw Error('人员查询服务返回异常，请稍后重试');
  if (!result.data.ok)
    throw Object.assign(Error(result.data.error.message), {
      code: result.data.error.code,
    });
  if (!response.ok) throw Error('人员查询失败，请稍后重试');
  return result.data.value;
}
