import { useEffect } from 'react';

export function QueryErrors({
  errors,
  scope = 'business-data',
}: {
  errors: readonly string[];
  scope?: string;
}) {
  const message = [...new Set(errors.filter(Boolean))].join('\n');
  useEffect(() => {
    if (message) console.warn('business-data-diagnostic', { scope, message });
  }, [scope, message]);
  if (!message) return null;
  const permission = /权限|PERMISSION|ROW_SCOPE|DENIED|UNAUTHORIZED/i.test(message);
  return (
    <section
      role="alert"
      style={{
        margin: '12px 0',
        padding: '12px 16px',
        border: '1px solid #e5e6eb',
        borderRadius: 8,
      }}
    >
      <strong>部分数据暂不可用</strong>
      <p>
        {permission
          ? '当前账号的数据权限未就绪，请联系权限管理员。'
          : '部分数据读取失败，请刷新重试。已读取的数据仍可查看，缺失项不代表零值。'}
      </p>
      {!permission && (
        <button type="button" onClick={() => window.dispatchEvent(new Event('gea-page-refresh'))}>
          重新读取
        </button>
      )}
    </section>
  );
}
