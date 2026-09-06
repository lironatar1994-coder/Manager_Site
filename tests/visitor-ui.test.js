const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../public/app.js'), 'utf8');
function workspace(overrides = {}) {
  const context = vm.createContext({
    state: { me: { role: 'client' }, clientSite: { id: 'site-a' }, clientUsername: 'client-a', clientVisitorRangeDays: 7, clientVisitorPage: 1, clientVisitorClassification: 'candidate' },
    location: { pathname: '/client/client-a/visitors' },
    URLSearchParams, Date,
    formatTrafficNumber: (value) => String(Number(value) || 0),
    formatTrafficBucket: (value) => value,
    renderClientVisitors: () => {}, toast: () => {},
    ...overrides,
  });
  vm.runInContext('let clientVisitorDashboardRequest = 0; let clientVisitorTableRequest = 0;', context);
  for (const name of ['escapeHtml', 'escapeAttr', 'trafficDelta', 'clientTrafficChart', 'clientTrafficHighlights', 'renderClientVisitorRecords', 'clientHotZonesPanel', 'refreshClientVisitorDashboard', 'refreshClientVisitorTable', 'clientVisitorRange', 'trafficRangeQuery', 'trafficVisitorQuery']) {
    const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
    const tail = source.slice(start);
    const next = tail.slice(1).search(/\n(?:async )?function /);
    let fragment = next === -1 ? tail : tail.slice(0, next + 1);
    fragment = fragment.replace(/let clientVisitorDashboardRequest = 0;[\s\S]*$/, '');
    vm.runInContext(fragment, context);
  }
  return context;
}

test('missing comparison is unavailable, never a fabricated 0% change', () => {
  const ui = workspace();
  for (const value of [null, undefined, NaN, Infinity]) assert.match(ui.trafficDelta(value), /אין עדיין נתוני השוואה/);
  assert.match(ui.trafficDelta(0), /0%/);
  assert.match(ui.trafficDelta(-20), /trending-down/);
});

test('chart has an accessible value for each point and handles one bucket or no traffic', () => {
  const ui = workspace();
  assert.match(ui.clientTrafficChart([]), /אין צפיות/);
  assert.match(ui.clientTrafficChart([{ bucket: 'today', page_views: -2 }]), /אין צפיות/);
  const single = ui.clientTrafficChart([{ bucket: 'today', page_views: 5 }]);
  assert.match(single, /max="0"/);
  assert.match(single, /disabled/);
  assert.doesNotMatch(single, /NaN|Infinity/);
  assert.match(single, /aria-valuetext="today: 5 צפיות"/);
  const chart = ui.clientTrafficChart([{ bucket: 'first', page_views: 2 }, { bucket: '<last>', page_views: 9 }]);
  assert.match(chart, /max="1"/);
  assert.doesNotMatch(chart, /<last>/);
});

test('highlights choose maximum counts even when the service returns unsorted rows', () => {
  const ui = workspace({ trafficBreakdownLabel: (_type, label) => label });
  const html = ui.clientTrafficHighlights({ referrers: [{ label: 'small', requests: 2 }, { label: 'largest', requests: 20 }] });
  assert.match(html, /largest/);
  assert.doesNotMatch(html, />small</);
  assert.match(html, /אין מספיק נתונים/);
});

test('failed list and engagement requests are distinguished from empty data', () => {
  const ui = workspace();
  ui.state.clientVisitorListError = true;
  ui.state.clientVisitorEngagementError = true;
  assert.match(ui.renderClientVisitorRecords({}, {}), /role="alert"/);
  assert.match(ui.clientHotZonesPanel(), /לא זמינים כרגע/);
});

test('older dashboard response cannot replace the newest selected range', async () => {
  const pending = [];
  const ui = workspace({ api: () => new Promise((resolve) => pending.push(resolve)) });
  const older = ui.refreshClientVisitorDashboard();
  ui.state.clientVisitorRangeDays = 30;
  const newer = ui.refreshClientVisitorDashboard();
  pending[3]({ summary: { page_views: 30 } }); pending[4]({ visitors: [] }); pending[5]({});
  await newer;
  pending[0]({ summary: { page_views: 7 } }); pending[1]({ visitors: [] }); pending[2]({});
  await older;
  assert.equal(ui.state.clientVisitorAnalytics.summary.page_views, 30);
});

test('navigating away or changing clients discards in-flight visitor data', async () => {
  for (const leave of [(ui) => { ui.location.pathname = '/client/client-a'; }, (ui) => { ui.state.clientUsername = 'client-b'; }]) {
    const pending = [];
    let renders = 0;
    const ui = workspace({ api: () => new Promise((resolve) => pending.push(resolve)), renderClientVisitors: () => renders++ });
    const work = ui.refreshClientVisitorDashboard();
    leave(ui);
    pending.forEach((resolve) => resolve({ summary: { page_views: 5 } }));
    await work;
    assert.equal(renders, 0);
    assert.equal(ui.state.clientVisitorAnalytics, undefined);
  }
});

test('a failed table refresh hides old rows and exposes an error', async () => {
  const ui = workspace({ api: async () => ({ error: 'unavailable' }) });
  ui.state.clientVisitorList = { visitors: [{ ip: '192.0.2.1' }] };
  await ui.refreshClientVisitorTable();
  assert.equal(ui.state.clientVisitorListError, true);
  assert.doesNotMatch(ui.renderClientVisitorRecords(ui.state.clientVisitorList, {}), /192\.0\.2\.1/);
});
