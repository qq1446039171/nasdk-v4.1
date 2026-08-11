const assert = require('assert');
const { getCompletedMonthlyAdjustedCloses } = require('../src/market/qqq-monthly');

const payload = {
  data: {
    klines: Array.from({ length: 13 }, (_, index) => {
      const month = String(index + 1).padStart(2, '0');
      return `2025-${month}-31,0,${100 + index},0,0`;
    }),
  },
};

(async () => {
  let calls = 0;
  const result = await getCompletedMonthlyAdjustedCloses('QQQ', {
    now: new Date('2026-02-01T00:00:00Z'),
    maxAttempts: 2,
    retryDelayMs: 0,
    sleep: async () => {},
    fetch: async () => {
      calls += 1;
      if (calls === 1) throw new TypeError('fetch failed');
      return {
        ok: true,
        json: async () => payload,
      };
    },
  });

  assert.strictEqual(calls, 2, '网络临时失败后应重试一次');
  assert.strictEqual(result.length, 13);
  console.log('qqq-monthly.test.js passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
