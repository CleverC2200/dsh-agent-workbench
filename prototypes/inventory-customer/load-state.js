/** Display state never grants access or substitutes inventory facts. */
export const customerLoadLocales = {
  zh: {
    waiting: '正在连接客户库存，数据尚未读取。',
    timeout: '客户库存连接尚未就绪，请重新进入；当前未取得数据。',
    loading: '正在读取客户库存数据…',
    denied: '当前用户无权访问客户库存，请联系管理员授权。',
    dataDenied: '当前用户暂无客户库存数据权限，请联系管理员核对数据授权。',
    login: '请先登录 GEA，再读取客户库存。',
    resource: '客户库存资源未就绪，请核对配套插件及资源配置。',
    session: '客户库存会话已失效或不匹配，请重新进入。',
    connection: '客户库存连接失败，请重新进入；数据尚未读取。',
    query: '客户库存读取失败，请刷新重试；当前未取得数据。',
    empty: '当前授权范围暂无客户库存数据。',
    changed: '登录身份或页面会话已变化，已清除旧数据，请重新进入。',
    render: '客户库存界面加载失败，请核对 Workbench 安装包并重新进入。',
  },
  en: {
    waiting: 'Connecting to customer inventory. Data has not been read.',
    timeout: 'The inventory connection is not ready. Reopen this page; no data was received.',
    loading: 'Loading customer inventory…',
    denied: 'You do not have access to customer inventory. Contact an administrator.',
    dataDenied:
      'You do not have customer inventory data permission. Ask an administrator to check data grants.',
    login: 'Sign in to GEA before reading customer inventory.',
    resource:
      'Inventory resources are unavailable. Check the companion plugins and resource configuration.',
    session: 'The inventory session expired or does not match. Reopen this page.',
    connection: 'The inventory connection failed. Reopen this page; data has not been read.',
    query: 'Inventory could not be read. Refresh and retry; no data was received.',
    empty: 'No customer inventory data is available within the current grant.',
    changed: 'The identity or page session changed. Previous data was cleared. Reopen this page.',
    render: 'The inventory UI could not load. Check the Workbench package and reopen this page.',
  },
};
export function customerLoadFailure(error) {
  const message = String(error?.cause?.message ?? error?.message ?? error ?? '');
  if (/AGENT_ACCESS_DENIED|当前用户无权访问该Agent/.test(message)) return 'denied';
  if (
    /DATA_PERMISSION_DENIED|当前账号暂无数据权限|RETURN_PERMISSION_DENIED|NO_RETURN_COLUMN_ALLOWED/.test(
      message,
    )
  )
    return 'dataDenied';
  if (/LOGIN_REQUIRED|NOT_AUTHENTICATED|GEA_IDENTITY_INCOMPLETE/.test(message)) return 'login';
  if (
    /PRESET.*(?:MISSING|NOT_ALLOWED)|PAGE_AGENT_MISSING|RESOURCE.*(?:MISSING|NOT_FOUND|DISABLED|NOT_IN_DATASET|NOT_PUBLISHED)|FIELD_NOT_PUBLISHED/.test(
      message,
    )
  )
    return 'resource';
  if (
    /SESSION_(?:EXPIRED|REJECTED|NOT_FOUND|IDENTITY_MISMATCH)|PAGE_AGENT_SESSION_MISMATCH|INVALID_CONVERSATION|会话已失效/.test(
      message,
    )
  )
    return 'session';
  return 'query';
}

/** Fixed local markup only: never interpolate query rows or server diagnostics. */
export function customerShellMarkup() {
  return (
    '<section class="customer-static-shell" aria-label="客户库存"><div class="customer-static-metrics">' +
    ['库存价值', '库存数量', '结构合理性', '库存新鲜度', '周转天数', '大日期情况']
      .map((label) => '<article><h3>' + label + '</h3><strong>—</strong></article>')
      .join('') +
    '</div><p>客户库存数据尚未读取</p><table><thead><tr><th>经销商</th><th>所属区域</th><th>库存价值</th><th>库存数量</th><th>综合状态</th></tr></thead><tbody><tr><td colspan="5">暂无已读取的数据</td></tr></tbody></table></section>'
  );
}
