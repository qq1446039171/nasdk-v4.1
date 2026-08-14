const assert = require('assert');
const {
  buildAllocationComparisons,
  buildDailyMessage,
  runV41DailySummary,
} = require('../src/v41-daily');

const signal = {
  signalMonth: '2026-07',
  state: 'strong',
  stateLabel: '强势',
  highVolatility: false,
};
const targets = { nasdaq: 70, gold: 15, bond: 15 };
const portfolio = {
  amounts: { nasdaq: 80000, gold: 60000, bond: 0, other: 20000 },
  investableTotalCny: 160000,
  excludedEmergencyCashCny: 36000,
};
const market = {
  benchmark: { name: '纳斯达克100', code: 'NDX', price: 29497.25, high1y: 30762.2, high1yDay: '2026-06-03', drawdownPct: 4.11 },
};

const comparisons = buildAllocationComparisons(portfolio, targets);
assert.deepStrictEqual(comparisons.map((row) => [row.key, row.currentPercent, row.targetPercent, row.gapPercent]), [
  ['nasdaq', 50, 70, -20],
  ['gold', 37.5, 15, 22.5],
  ['bond', 0, 15, -15],
  ['other', 12.5, 0, 12.5],
]);

const message = buildDailyMessage({
  cfg: { strategyV41: { bondName: '海富通中证短融ETF', bondCode: '511360' } },
  signal,
  targets,
  portfolio,
  market,
});
assert.strictEqual(message.title, 'NDX回撤 -4.11%｜强势');
assert.match(message.body, /当前模式：强势（信号月份 2026-07）/);
assert.match(message.body, /NDX当前点位：29,497\.25/);
assert.match(message.body, /NDX近一年高点：30,762\.2（2026-06-03）/);
assert.match(message.body, /当前距离近一年高点：-4\.11%/);
assert.match(message.body, /当前金额：纳指 ¥80,000｜黄金 ¥60,000/);
assert.doesNotMatch(message.body, /513100当前价格/);
assert.match(message.body, /纳指：当前 50\.00%\/目标 70\.00%（低配 20\.00 个百分点）/);
assert.match(message.body, /黄金：当前 37\.50%\/目标 15\.00%（超配 22\.50 个百分点）/);
assert.match(message.body, /海富通中证短融ETF（511360）：当前 0\.00%\/目标 15\.00%（低配 15\.00 个百分点）/);
assert.match(message.body, /只作观察提示，不给出买卖建议；正式操作以月末通知为准/);
assert.doesNotMatch(message.body, /买入|卖出|调仓金额/);

(async () => {
  const pushed = [];
  const cfg = {
    strategyV41: {
      enabled: true,
      signalSymbol: 'QQQ',
      volatilityThresholdPercent: 35,
      highVolatilityReductionPercent: 15,
      nasdaqFloorPercent: 15,
      excludedEmergencyCashCny: 36000,
      bondName: '海富通中证短融ETF',
      bondCode: '511360',
    },
    portfolio: { assetSummary: { assets: [] } },
  };
  const state = {};
  const ok = await runV41DailySummary(cfg, state, {
    refreshHoldings: async () => ({ ok: 3, failed: 0 }),
    getMonthlyRows: async () => Array.from({ length: 13 }, (_, index) => ({
      month: `m${index}`,
      close: 100 + index,
    })),
    getMarketSnapshot: async () => ({ ...market, market }),
    summarizePortfolio: () => portfolio,
    saveSnapshot: () => {},
    logEvent: () => {},
    logPush: () => {},
    push: async (_cfg, preview) => {
      pushed.push(preview);
      return { ok: true, status: 200, code: 0 };
    },
  });
  assert.strictEqual(ok, true);
  assert.strictEqual(pushed.length, 1);
  assert.strictEqual(state.v41Daily.lastSignal.state, 'strong');
  assert.deepStrictEqual(state.v41Daily.lastTargets, targets);

  const staleMessages = [];
  let savedSnapshot;
  const staleOk = await runV41DailySummary(cfg, {}, {
    refreshHoldings: async () => ({ ok: 0, failed: 1 }),
    getSignalData: async () => { throw new Error('all monthly providers failed'); },
    getBenchmarkData: async () => { throw new Error('all benchmark providers failed'); },
    loadSnapshot: () => ({ signal, targets, benchmark: market.benchmark, sources: { signal: 'tiingo-adjusted' } }),
    summarizePortfolio: () => portfolio,
    saveSnapshot: (value) => { savedSnapshot = value; },
    logEvent: () => {},
    logPush: () => {},
    push: async (_cfg, preview) => { staleMessages.push(preview); return { ok: true, status: 200, code: 0 }; },
  });
  assert.strictEqual(staleOk, true, 'daily push should remain available from the last good snapshot');
  assert.strictEqual(savedSnapshot.stale, true);
  assert.match(staleMessages[0].body, /最后有效快照/);
  console.log('v41-daily.test.js passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
