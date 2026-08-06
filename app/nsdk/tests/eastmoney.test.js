const assert = require('assert');
const {
  _normalizePrice,
  _parseLatestKline,
  _parseOneYearHigh,
} = require('../src/market/eastmoney');

assert.strictEqual(_normalizePrice(2948779, 2), 29487.79);
assert.strictEqual(_normalizePrice(2270, 3), 2.27);

const latest = _parseLatestKline('100.NDX100', {
  data: {
    name: '纳斯达克100',
    klines: ['2026-08-05,29863.27,29487.79,29946.93,29468.33,1,0,1.61,-0.83,-245.37,0'],
  },
});
assert.strictEqual(latest.price, 29487.79);

const oldRows = Array.from({ length: 5 }, (_, index) => `2025-01-0${index + 1},1,1,99999,1,0`);
const recentRows = Array.from({ length: 260 }, (_, index) => {
  const high = index === 200 ? 30762.2 : 29000 + index;
  return `2026-01-${String(index + 1).padStart(3, '0')},1,1,${high},100,0`;
});
const high = _parseOneYearHigh({ data: { klines: [...oldRows, ...recentRows] } });
assert.deepStrictEqual(high, {
  maxHigh: 30762.2,
  maxDay: '2026-01-201',
  points: 260,
});

console.log('eastmoney.test.js passed');
