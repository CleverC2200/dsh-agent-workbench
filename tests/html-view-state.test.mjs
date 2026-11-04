import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const { outputFiles } = await build({
  entryPoints: ['src/workbench.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const { WorkbenchController } = await import(
  'data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64')
);
const channelBuild = await build({
  entryPoints: ['src/html-view-channel.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const { connectHtmlViewState } = await import(
  'data:text/javascript;base64,' + Buffer.from(channelBuild.outputFiles[0].text).toString('base64')
);
const localDraftBuild = await build({
  entryPoints: ['static/mps/source/local-draft.js'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const { encodeLocalDrafts, decodeLocalDrafts } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(localDraftBuild.outputFiles[0].text).toString('base64')
);
test('the registered sample keeps only its explicit UI values across Document replacement without a login or Session', async () => {
  const workbench = new WorkbenchController({ panel: () => {}, document: () => {} });
  const off = workbench.registerFrame({ id: 'workbench-html-table', kind: 'html', src: '/sample' });
  await workbench.open('workbench-html-table');
  const value = { version: 1, keyword: '采购计划', stage: '' };
  workbench.saveHtmlViewState('workbench-html-table', undefined, value);
  workbench.leaveDocument();
  await workbench.open('workbench-html-table');
  assert.deepEqual(workbench.readHtmlViewState('workbench-html-table'), value);
  assert.throws(
    () =>
      workbench.saveHtmlViewState('workbench-html-table', undefined, {
        ...value,
        results: [{ total: 42 }],
      }),
    /INVALID_HTML_VIEW_STATE/,
  );
  off();
  assert.equal(workbench.readHtmlViewState('workbench-html-table'), undefined);
});
test('one frame generation cannot save after reload, release, or another page/window sends its receipt', async (t) => {
  const old = globalThis.window;
  const listeners = new Set();
  globalThis.window = {
    addEventListener: (_name, listener) => listeners.add(listener),
    removeEventListener: (_name, listener) => listeners.delete(listener),
  };
  t.after(() => {
    globalThis.window = old;
  });
  const posted = [],
    loads = new Set();
  const peer = { postMessage: (value) => posted.push(value) };
  const frame = {
    contentWindow: peer,
    addEventListener: (_name, listener) => loads.add(listener),
    removeEventListener: (_name, listener) => loads.delete(listener),
  };
  const owner = new WorkbenchController({ panel: () => {}, document: () => {} });
  owner.registerFrame({ id: 'workbench-html-table', kind: 'html', src: '/sample' });
  await owner.open('workbench-html-table');
  const stop = connectHtmlViewState(
    frame,
    'workbench-html-table',
    undefined,
    owner,
    new AbortController().signal,
  );
  const receive = (data, source = peer) => {
    for (const listener of listeners)
      listener({
        source,
        data: {
          protocol: 'dsh-workbench-view-v1',
          page: 'workbench-html-table',
          version: 1,
          ...data,
        },
      });
  };
  receive({ type: 'ready' });
  const first = posted.at(-1);
  const value = { version: 1, keyword: '正确来源', stage: '' };
  receive({ type: 'save', channel: first.channel, generation: first.generation, state: value }, {});
  assert.equal(owner.readHtmlViewState('workbench-html-table'), undefined);
  receive({ type: 'save', channel: first.channel, generation: first.generation, state: value });
  assert.deepEqual(owner.readHtmlViewState('workbench-html-table'), value);
  for (const load of loads) load();
  receive({
    type: 'save',
    channel: first.channel,
    generation: first.generation,
    state: { ...value, keyword: '旧代际' },
  });
  assert.deepEqual(owner.readHtmlViewState('workbench-html-table'), value);
  stop();
  receive({
    type: 'save',
    channel: first.channel,
    generation: first.generation + 1,
    state: { ...value, keyword: '已释放' },
  });
  assert.deepEqual(owner.readHtmlViewState('workbench-html-table'), value);
});
test('FC UI records stay partitioned by the real identity and Session address and reject service/authority fields', async () => {
  const workbench = new WorkbenchController({ panel: () => {}, document: () => {} });
  workbench.registerFrame({
    id: 'inventory-fc',
    kind: 'html',
    src: '/fc',
    resourceId: 'inventory-fc',
  });
  const state = {
    version: 1,
    filters: [
      {
        key: 'branch-inventory:v1:filters:account:session:warehouse',
        value: {
          search: '原材料',
          businessOnly: true,
          urgentOnly: false,
          riskOnly: false,
          ageFilters: [],
          orderStatusV2: '全部',
        },
      },
    ],
    drafts: [],
    plans: [],
    cycles: [],
    preferences: [],
    replenishmentCycleDays: 14,
  };
  workbench.saveHtmlViewState('inventory-fc', 'actual-account-scope/actual-session', state);
  assert.equal(
    workbench.readHtmlViewState('inventory-fc', 'next-account-scope/actual-session'),
    undefined,
  );
  assert.equal(
    workbench.readHtmlViewState('inventory-fc', 'actual-account-scope/another-session'),
    undefined,
  );
  assert.throws(
    () => workbench.saveHtmlViewState('inventory-fc', undefined, state),
    /SCOPE_REQUIRED/,
  );
  assert.throws(
    () =>
      workbench.saveHtmlViewState('inventory-fc', 'actual-account-scope/actual-session', {
        ...state,
        grant: { allowed: true },
      }),
    /INVALID_HTML_VIEW_STATE/,
  );
  assert.deepEqual(
    workbench.readHtmlViewState('inventory-fc', 'actual-account-scope/actual-session'),
    state,
  );
});

test('received mock pages keep only authored UI intent under their actual Session address', async () => {
  const owner = new WorkbenchController({ panel() {}, document() {} });
  const states = {
    'inventory-qll': {
      version: 1,
      scope: 'all-channel',
      month: '2026-09',
      tab: 'category',
      sku: 'MOCK-001',
      risk: '',
      structureFilters: { category: '饺子', org: '' },
    },
    'inventory-customer': { version: 1, search: '佳特', page: 2 },
    'inventory-orderworkbench': {
      version: 1,
      mode: 'week',
      month: '2026-09',
      week: '2026-08-31',
      event: 'focus',
      task: 'all',
    },
    'inventory-orderfulfillment': { version: 1, customer: '10010126', page: 1, size: 10 },
  };
  for (const [id, state] of Object.entries(states)) {
    owner.registerFrame({ id, kind: 'html', src: '/mock', resourceId: 'gea-html-' + id });
    owner.saveHtmlViewState(id, 'subject/session-A', state);
    assert.equal(owner.readHtmlViewState(id, 'subject/session-B'), undefined);
    assert.deepEqual(owner.readHtmlViewState(id, 'subject/session-A'), state);
    assert.throws(() => owner.saveHtmlViewState(id, undefined, state), /HTML_VIEW_SCOPE_REQUIRED/);
    assert.throws(
      () =>
        owner.saveHtmlViewState(id, 'subject/session-A', {
          ...state,
          rows: [{ secret: 'derived' }],
        }),
      /INVALID_HTML_VIEW_STATE/,
    );
  }
});
test('the live fulfillment page restores only its filter and dimension intent for its Session', () => {
  const owner = new WorkbenchController({ panel() {}, document() {} });
  const id = 'inventory-orderfulfillment';
  owner.registerFrame({ id, kind: 'html', src: '/fulfillment', resourceId: 'gea-html-' + id });
  const state = {
    version: 1,
    fulfillmentBaseFilter: '郑州',
    deliveryOrgFilter: 'region:华中大区',
    deliveryChannelFilter: '',
    warehouseProviderFilter: '',
    deliveryOrderNumberQuery: '',
    deliveryCustomerQuery: '佳特',
    deliveryRegionQuery: '',
    deliveryBaseQuery: '',
    deliveryStatusQuery: '',
    dimension: 'warehouseDimensionPanel',
  };
  owner.saveHtmlViewState(id, 'subject/session-A', state);
  assert.deepEqual(owner.readHtmlViewState(id, 'subject/session-A'), state);
  assert.equal(owner.readHtmlViewState(id, 'subject/session-B'), undefined);
  for (const extra of [{ dimension: 'unknown' }, { rows: [{ secret: 'derived' }] }])
    assert.throws(
      () => owner.saveHtmlViewState(id, 'subject/session-A', { ...state, ...extra }),
      /INVALID_HTML_VIEW_STATE/,
    );
});

test('the received category page partitions its UI intent by the owned Session', () => {
  const owner = new WorkbenchController({ panel() {}, document() {} });
  owner.registerFrame({
    id: 'plan-region-category',
    kind: 'html',
    src: '/category',
    resourceId: 'gea-html-category-plan',
  });
  const state = { version: 1, category: 'mianmo', draft: '未发送的品类说明' };
  owner.saveHtmlViewState('plan-region-category', 'subject/session-A', state);
  assert.equal(owner.readHtmlViewState('plan-region-category', 'subject/session-B'), undefined);
  assert.throws(
    () => owner.saveHtmlViewState('plan-region-category', undefined, state),
    /HTML_VIEW_SCOPE_REQUIRED/,
  );
  assert.deepEqual(owner.readHtmlViewState('plan-region-category', 'subject/session-A'), state);
});

test('received MPS UI intent belongs to its Session while derived demand and grants are excluded', () => {
  const owner = new WorkbenchController({ panel() {}, document() {} });
  const id = 'plan-category-production';
  owner.registerFrame({ id, kind: 'html', src: '/mps', resourceId: 'gea-html-inventory-mps' });
  const intent = {
    version: 1,
    tab: 'process',
    assistantDraft: '未发送的MPS文字',
    weights: { report: 40, growth: 40, ship: 20 },
  };
  owner.saveHtmlViewState(id, 'subject/session-A', intent);
  assert.equal(owner.readHtmlViewState(id, 'subject/session-B'), undefined);
  assert.deepEqual(owner.readHtmlViewState(id, 'subject/session-A'), intent);
  assert.throws(() => owner.saveHtmlViewState(id, undefined, intent), /HTML_VIEW_SCOPE_REQUIRED/);
  assert.throws(
    () =>
      owner.saveHtmlViewState(id, 'subject/session-A', {
        ...intent,
        parts: { process: { rows: [] } },
      }),
    /INVALID_HTML_VIEW_STATE/,
  );
});

test('personal feedback fields persist in their Session and never accept returned facts or a login flag', () => {
  const owner = new WorkbenchController({ panel() {}, document() {} });
  const page = 'inventory-personal';
  owner.registerFrame({
    id: page,
    kind: 'html',
    src: '/personal-mock',
    resourceId: 'gea-html-inventory-personal',
  });
  const state = {
    version: 1,
    selected: 'base:郑州',
    riskType: '货龄',
    page: 1,
    size: 10,
    feedbackNotes: { 'base:郑州:A': '核对后继续草稿' },
  };
  owner.saveHtmlViewState(page, 'subject/session-A', state);
  assert.deepEqual(owner.readHtmlViewState(page, 'subject/session-A'), state);
  assert.equal(owner.readHtmlViewState(page, 'subject/session-B'), undefined);
  assert.throws(() => owner.saveHtmlViewState(page, undefined, state), /HTML_VIEW_SCOPE_REQUIRED/);
  assert.throws(
    () => owner.saveHtmlViewState(page, 'subject/session-A', { ...state, objects: [] }),
    /INVALID_HTML_VIEW_STATE/,
  );
  assert.throws(
    () => owner.saveHtmlViewState(page, 'subject/session-A', { ...state, loggedIn: true }),
    /INVALID_HTML_VIEW_STATE/,
  );
});

test('MPS local input drafts recover only in their subject and Session with no credential or calculated facts', () => {
  const owner = new WorkbenchController({ panel() {}, document() {} });
  const page = 'plan-category-production';
  owner.registerFrame({ id: page, kind: 'html', src: '/mps' });
  const localDrafts = {
    format: 1,
    selected: 'local-2',
    drafts: [
      {
        id: 'local-2',
        name: '十二月评估',
        month: '2026-12',
        pull: 'monthly',
        inputs: {
          products: {
            file: '产品.csv',
            rows: [
              {
                基地: '甲',
                产品编码: 'A',
                产品名称: '甲产品',
                大类: '汤圆',
                系列: '系列',
                物料组: '组',
                物料组名称: '',
                老品编码: '',
                老品名称: '',
              },
            ],
          },
        },
        adjustments: {
          categoryDemand: [
            {
              month: '2026-12',
              category: '汤圆',
              quantity: 120,
              systemValue: 100,
              reason: '已确认增量',
              at: '2026-10-30T00:00:00.000Z',
            },
          ],
          shares: [],
          history: [],
        },
      },
    ],
  };
  const state = { version: 1, localDrafts };
  owner.saveHtmlViewState(page, 'tenant-A/user-A/session-A', state);
  assert.deepEqual(owner.readHtmlViewState(page, 'tenant-A/user-A/session-A'), state);
  assert.equal(owner.readHtmlViewState(page, 'tenant-B/user-A/session-A'), undefined);
  assert.equal(owner.readHtmlViewState(page, 'tenant-A/user-A/session-B'), undefined);
  for (const field of ['credentials', 'accessToken', 'business', 'calculation']) {
    const invalid = structuredClone(state);
    invalid.localDrafts.drafts[0][field] = {};
    assert.throws(
      () => owner.saveHtmlViewState(page, 'tenant-A/user-A/session-A', invalid),
      /INVALID_HTML_VIEW_STATE/,
    );
  }
  const incompatible = structuredClone(state);
  incompatible.localDrafts.format = 2;
  assert.throws(
    () => owner.saveHtmlViewState(page, 'tenant-A/user-A/session-A', incompatible),
    /INVALID_HTML_VIEW_STATE/,
  );
});

test('a rejected local view save reaches the page while retaining unsaved user input', async () => {
  const listeners = new Map();
  const parent = { postMessage() {} };
  const savedWindow = globalThis.window;
  globalThis.window = {
    parent,
    addEventListener: (name, listener) => listeners.set(name, listener),
    removeEventListener() {},
  };
  try {
    const { createPageViewState } = await import('../business/shared/view-state.js');
    const view = createPageViewState('plan-category-production');
    const events = [];
    view.subscribe((state, event) => events.push({ state, event }));
    const receive = listeners.get('message');
    receive({
      source: parent,
      data: {
        protocol: 'dsh-workbench-view-v1',
        type: 'restore',
        page: 'plan-category-production',
        version: 1,
        channel: 'a',
        generation: 1,
        state: { version: 1 },
      },
    });
    view.update({ assistantDraft: '尚未保存的本地输入' });
    for (const [channel, generation] of [
      ['old', 1],
      ['a', 0],
    ]) {
      receive({
        source: parent,
        data: {
          protocol: 'dsh-workbench-view-v1',
          type: 'rejected',
          page: 'plan-category-production',
          version: 1,
          channel,
          generation,
          error: 'STALE',
        },
      });
      assert.equal(events.at(-1).event, 'restore');
    }
    receive({
      source: parent,
      data: {
        protocol: 'dsh-workbench-view-v1',
        type: 'rejected',
        page: 'plan-category-production',
        version: 1,
        channel: 'a',
        generation: 1,
        error: 'STATE_TOO_LARGE',
      },
    });
    assert.equal(events.at(-1).event, 'rejected');
    assert.equal(view.get().assistantDraft, '尚未保存的本地输入');
  } finally {
    if (savedWindow === undefined) delete globalThis.window;
    else globalThis.window = savedWindow;
  }
});

test('MPS local and business shipment edits recover through the codec and Host without business source facts', () => {
  const key = JSON.stringify(['郑州', 'A']);
  const local = {
    values: { [key]: { value: 301, source: '人工调整', previous: 300 } },
    remaining: { 郑州: { values: { [key]: 11 }, source: '基地调整' } },
  };
  const business = {
    values: { [key]: { value: 99, source: '人工调整', previous: null } },
    remaining: {},
  };
  const draft = {
    id: 'v1',
    name: '试算',
    month: '2026-10',
    pull: 'monthly',
    files: {},
    shipment: {
      activeSource: 'business',
      values: business.values,
      remaining: business.remaining,
      sourceEdits: { 'local-file': local, business },
      business: { rows: [{ secret: 'BUSINESS_FACT' }] },
      businessAttempted: true,
      granted: true,
      credentials: 'CREDENTIAL',
    },
  };
  const encoded = encodeLocalDrafts([draft], 'v1');
  assert.deepEqual(encoded.drafts[0].shipment.sourceEdits, { 'local-file': local, business });
  assert.doesNotMatch(
    JSON.stringify(encoded),
    /BUSINESS_FACT|CREDENTIAL|businessAttempted|granted/,
  );
  const owner = new WorkbenchController({ panel() {}, document() {} });
  const page = 'plan-category-production';
  owner.registerFrame({ id: page, kind: 'html', src: '/mps' });
  owner.saveHtmlViewState(page, 'tenant/user/session', { version: 1, localDrafts: encoded });
  const recovered = decodeLocalDrafts(
    owner.readHtmlViewState(page, 'tenant/user/session').localDrafts,
    (id, month) => ({ id, month, files: {} }),
    () => {
      throw Error('Unexpected fallback');
    },
  );
  assert.deepEqual(recovered.drafts[0].shipment.sourceEdits, { 'local-file': local, business });
  assert.equal(recovered.drafts[0].shipment.business, undefined);
  assert.equal(owner.readHtmlViewState(page, 'another-tenant/user/session'), undefined);
  const invalid = structuredClone(encoded);
  invalid.drafts[0].shipment.sourceEdits.business.credentials = 'CREDENTIAL';
  assert.throws(
    () =>
      owner.saveHtmlViewState(page, 'tenant/user/session', { version: 1, localDrafts: invalid }),
    /INVALID_HTML_VIEW_STATE/,
  );
});

test('structured MPS rules, monthly evidence and change history round-trip through codec and client validation', () => {
  const draft = {
    id: 'rules-v1',
    name: '规则版本',
    month: '2026-11',
    pull: 'monthly',
    files: {},
    constraints: {
      targetVersion: '滚动',
      safetyDays: [],
      rules: {
        local: [
          {
            id: 'R',
            description: '调拨上限',
            target: '郑州',
            strength: '硬',
            until: '',
            category: '调拨',
            source: '计划维护',
            base: '郑州',
            code: '',
            productCategory: '',
            from: '2026-11',
            enabled: true,
            accepted: false,
            effect: { kind: 'transfer-limit', value: 400 },
            observations: [{ month: '2026-11', value: 380, source: '当月方案' }],
          },
        ],
        history: [
          { at: '2026-11-04T00:00:00.000Z', ruleId: 'R', description: '调拨上限', action: '新增' },
        ],
      },
    },
  };
  draft.inventoryTargets = [{ finalTarget: 999 }];
  const encoded = encodeLocalDrafts([draft], draft.id);
  assert.equal(encoded.drafts[0].inventoryTargets, undefined);
  const owner = new WorkbenchController({ panel() {}, document() {} });
  owner.registerFrame({ id: 'plan-category-production', kind: 'html', src: '/mps' });
  owner.saveHtmlViewState('plan-category-production', 'tenant/user/session', {
    version: 1,
    localDrafts: encoded,
  });
  const recovered = decodeLocalDrafts(
    owner.readHtmlViewState('plan-category-production', 'tenant/user/session').localDrafts,
    (id, month) => ({ id, month, files: {} }),
    () => {
      throw Error('Unexpected fallback');
    },
  );
  assert.deepEqual(recovered.drafts[0].constraints, draft.constraints);
  const invalid = structuredClone(encoded);
  invalid.drafts[0].constraints.rules.local[0].credentials = 'forbidden';
  assert.throws(
    () =>
      owner.saveHtmlViewState('plan-category-production', 'tenant/user/session', {
        version: 1,
        localDrafts: invalid,
      }),
    /INVALID_HTML_VIEW_STATE/,
  );
});
