const assert = require('assert');

const { parseTiingoMonthly } = require('../src/market/tiingo');
const { parseFredNasdaq100 } = require('../src/market/fred');
const { getSignalRows, getBenchmarkSnapshot } = require('../src/market/providers');
const { fetchTushareHoldingPrice } = require('../src/market/tushare');

const tiingoRows = Array.from({ length: 14 }, (_, index) => ({
  date: new Date(Date.UTC(2024, index, 28)).toISOString(),
  close: 100 + index,
  adjClose: 200 + index,
}));
const parsedTiingo = parseTiingoMonthly(tiingoRows, new Date('2025-03-15T00:00:00Z'));
assert.strictEqual(parsedTiingo.length, 14);
assert.strictEqual(parsedTiingo[0].close, 200, 'Tiingo signal must use adjusted close');
assert.strictEqual(parsedTiingo[parsedTiingo.length - 1].month, '2025-02', 'current incomplete month must be excluded');

const fredPayload = {
  observations: [
    { date: '2025-08-08', value: '19000' },
    { date: '2026-08-07', value: '30000' },
    { date: '2026-08-10', value: '29400' },
  ],
};
const fred = parseFredNasdaq100(fredPayload, new Date('2026-08-11T00:00:00Z'));
assert.strictEqual(fred.price, 29400);
assert.strictEqual(fred.high1y, 30000);
assert.strictEqual(fred.high1yDay, '2026-08-07');
assert.strictEqual(fred.drawdownPct, 2);

(async () => {
  const signal = await getSignalRows(
    { tiingoApiToken: 'token', strategyV41: { signalSymbol: 'QQQ' } },
    {
      getTiingoRows: async () => { throw new Error('temporary tiingo outage'); },
      getEastmoneyRows: async () => Array.from({ length: 13 }, (_, index) => ({ month: `m${index}`, close: 100 + index })),
    },
  );
  assert.strictEqual(signal.provider, 'eastmoney-adjusted');
  assert.match(signal.warnings[0], /tiingo/i);

  const benchmark = await getBenchmarkSnapshot(
    { fredApiKey: 'fred-key' },
    {
      getFredSnapshot: async () => { throw new Error('temporary fred outage'); },
      getEastmoneyLatest: async () => ({ name: 'NDX', price: 29400, pct: -1 }),
      getEastmoneyHigh: async () => ({ maxHigh: 30000, maxDay: '2026-08-07' }),
    },
  );
  assert.strictEqual(benchmark.provider, 'eastmoney');
  assert.strictEqual(benchmark.drawdownPct, 2);
  assert.match(benchmark.warnings[0], /fred/i);

  const tushare = await fetchTushareHoldingPrice(
    { code: '513100', kind: 'exchange' },
    {
      token: 'ts-token',
      fetch: async (_url, request) => {
        const body = JSON.parse(request.body);
        assert.strictEqual(body.api_name, 'fund_daily');
        assert.strictEqual(body.params.ts_code, '513100.SH');
        return {
          ok: true,
          json: async () => ({ code: 0, data: { fields: ['ts_code', 'trade_date', 'close', 'pct_chg'], items: [['513100.SH', '20260810', 2.31, 1.2]] } }),
        };
      },
    },
  );
  assert.deepStrictEqual(tushare, { price: 2.31, pct: 1.2, date: '2026-08-10', provider: 'tushare' });

  console.log('market-providers.test.js passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
