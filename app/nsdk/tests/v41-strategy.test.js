const assert = require('assert');
const {
  computeSignal,
  buildTargets,
  summarizeStrategyPortfolio,
  buildExecutionPlan,
} = require('../src/v41-strategy');
const { _parseEastmoneyMonthly } = require('../src/market/qqq-monthly');

const parsedMonthly = _parseEastmoneyMonthly({ data: { klines: [
  '2026-06-30,600,620,0,0',
  '2026-07-31,620,640,0,0',
  '2026-08-31,640,660,0,0',
] } }, new Date('2026-08-05T00:00:00Z'));
assert.deepStrictEqual(parsedMonthly, [
  { month: '2026-06', close: 620 },
  { month: '2026-07', close: 640 },
]);

const monthly = Array.from({ length: 13 }, (_, index) => ({
  month: `2025-${String(index + 1).padStart(2, '0')}`,
  close: 100 + (index * 5),
}));

const strong = computeSignal(monthly);
assert.strictEqual(strong.state, 'strong');
assert.strictEqual(strong.trendPositive, true);
assert.strictEqual(strong.momentumPositive, true);
assert.strictEqual(strong.signalMonth, '2025-13');

const defensiveSeries = monthly.map((row, index) => ({ ...row, close: 200 - (index * 8) }));
const defensive = computeSignal(defensiveSeries);
assert.strictEqual(defensive.state, 'defensive');
assert.strictEqual(defensive.trendPositive, false);
assert.strictEqual(defensive.momentumPositive, false);

assert.deepStrictEqual(buildTargets('strong', false), { nasdaq: 70, gold: 15, bond: 15 });
assert.deepStrictEqual(buildTargets('strong', true), { nasdaq: 55, gold: 15, bond: 30 });
assert.deepStrictEqual(buildTargets('transition', true), { nasdaq: 40, gold: 15, bond: 45 });
assert.deepStrictEqual(buildTargets('defensive', true), { nasdaq: 15, gold: 15, bond: 70 });

const summary = summarizeStrategyPortfolio([
  { category: 'nasdaq', marketValueCny: 70000, enabled: true },
  { category: 'gold', marketValueCny: 15000, enabled: true },
  { category: 'bond', marketValueCny: 5000, enabled: true },
  { category: 'cash', marketValueCny: 40000, enabled: true },
  { category: 'stock', marketValueCny: 10000, enabled: true },
], 36000);
assert.deepStrictEqual(summary.amounts, { nasdaq: 70000, gold: 15000, bond: 5000, other: 14000 });
assert.strictEqual(summary.investableTotalCny, 104000);
assert.strictEqual(summary.excludedEmergencyCashCny, 36000);

const rebalance = buildExecutionPlan({
  amounts: { nasdaq: 50000, gold: 20000, bond: 20000, other: 10000 },
  targets: { nasdaq: 70, gold: 15, bond: 15 },
  monthlyCashflowCny: 4000,
  previousSignal: { state: 'transition', highVolatility: false },
  currentSignal: { state: 'strong', highVolatility: false },
  thresholdPercent: 3,
});
assert.strictEqual(rebalance.rebalanceRequired, true);
assert.strictEqual(rebalance.projectedTotalCny, 104000);
assert.strictEqual(rebalance.actions.nasdaq, 22800);
assert.strictEqual(rebalance.actions.gold, -4400);
assert.strictEqual(rebalance.actions.bond, -4400);
assert.strictEqual(rebalance.actions.other, -10000);
assert.strictEqual(Object.values(rebalance.actions).reduce((sum, value) => sum + value, 0), 4000);
assert.deepStrictEqual(rebalance.monthlyCashflowAllocation, { nasdaq: 4000, gold: 0, bond: 0 });

const cashOnly = buildExecutionPlan({
  amounts: { nasdaq: 68000, gold: 15000, bond: 15000, other: 2000 },
  targets: { nasdaq: 70, gold: 15, bond: 15 },
  monthlyCashflowCny: 4000,
  previousSignal: { state: 'strong', highVolatility: false },
  currentSignal: { state: 'strong', highVolatility: false },
  thresholdPercent: 3,
});
assert.strictEqual(cashOnly.rebalanceRequired, false);
assert.strictEqual(cashOnly.actions.nasdaq, 4000);
assert.strictEqual(cashOnly.actions.gold, 0);
assert.strictEqual(cashOnly.actions.bond, 0);
assert.strictEqual(cashOnly.actions.other, 0);
assert.deepStrictEqual(cashOnly.monthlyCashflowAllocation, { nasdaq: 4000, gold: 0, bond: 0 });

console.log('v41-strategy.test.js passed');
