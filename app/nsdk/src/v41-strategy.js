const round2 = (value) => Math.round(Number(value) * 100) / 100;

const STATE_LABELS = Object.freeze({
  strong: '强势',
  transition: '过渡',
  defensive: '防守',
});

const BASE_TARGETS = Object.freeze({
  strong: Object.freeze({ nasdaq: 70, gold: 15, bond: 15 }),
  transition: Object.freeze({ nasdaq: 55, gold: 15, bond: 30 }),
  defensive: Object.freeze({ nasdaq: 15, gold: 15, bond: 70 }),
});

const standardDeviation = (values) => {
  if (!Array.isArray(values) || values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / (values.length - 1);
  return Math.sqrt(variance);
};

const computeSignal = (monthlyCloses, options = {}) => {
  const rows = (Array.isArray(monthlyCloses) ? monthlyCloses : [])
    .map((row) => ({ month: String(row?.month || row?.date || '').slice(0, 7), close: Number(row?.close) }))
    .filter((row) => row.month && Number.isFinite(row.close) && row.close > 0)
    .sort((a, b) => a.month.localeCompare(b.month));
  if (rows.length < 13) throw new Error(`v4.1 signal needs at least 13 completed months; got ${rows.length}`);

  const latest = rows[rows.length - 1];
  const last10 = rows.slice(-10);
  const sma10 = last10.reduce((sum, row) => sum + row.close, 0) / last10.length;
  const momentum12 = (latest.close / rows[rows.length - 13].close) - 1;
  const returns6 = rows.slice(-7).slice(1).map((row, index) => (
    (row.close / rows.slice(-7)[index].close) - 1
  ));
  const annualizedVolatility = standardDeviation(returns6) * Math.sqrt(12);
  const volatilityThreshold = Number(options.volatilityThresholdPercent ?? 35) / 100;
  const trendPositive = latest.close > sma10;
  const momentumPositive = momentum12 > 0;
  const state = trendPositive && momentumPositive
    ? 'strong'
    : (!trendPositive && !momentumPositive ? 'defensive' : 'transition');

  return {
    signalMonth: latest.month,
    state,
    stateLabel: STATE_LABELS[state],
    close: round2(latest.close),
    sma10: round2(sma10),
    momentum12Percent: round2(momentum12 * 100),
    annualizedVolatilityPercent: round2(annualizedVolatility * 100),
    trendPositive,
    momentumPositive,
    highVolatility: annualizedVolatility > volatilityThreshold,
    volatilityThresholdPercent: round2(volatilityThreshold * 100),
  };
};

const buildTargets = (state, highVolatility, options = {}) => {
  const base = BASE_TARGETS[state];
  if (!base) throw new Error(`Unknown v4.1 state: ${state}`);
  const reduction = highVolatility ? Number(options.highVolatilityReductionPercent ?? 15) : 0;
  const floor = Number(options.nasdaqFloorPercent ?? 15);
  const nasdaq = Math.max(floor, base.nasdaq - reduction);
  return {
    nasdaq,
    gold: base.gold,
    bond: 100 - nasdaq - base.gold,
  };
};

const numericValue = (asset) => {
  if (!asset || asset.enabled === false) return 0;
  if (Number.isFinite(Number(asset.marketValueCny))) return Math.max(0, Number(asset.marketValueCny));
  if (asset.kind === 'cash') return Math.max(0, Number(asset.amountCny) || 0);
  return Math.max(0, Number(asset.shares) || 0) * Math.max(0, Number(asset.lastPrice) || 0);
};

const summarizeStrategyPortfolio = (assets, requestedEmergencyCashCny = 0) => {
  const raw = { nasdaq: 0, gold: 0, bond: 0, other: 0 };
  for (const asset of Array.isArray(assets) ? assets : []) {
    const value = numericValue(asset);
    const category = String(asset?.category || 'other');
    if (category === 'nasdaq' || category === 'gold' || category === 'bond') raw[category] += value;
    else raw.other += value;
  }
  const excludedEmergencyCashCny = Math.min(raw.other, Math.max(0, Number(requestedEmergencyCashCny) || 0));
  const amounts = {
    nasdaq: round2(raw.nasdaq),
    gold: round2(raw.gold),
    bond: round2(raw.bond),
    other: round2(raw.other - excludedEmergencyCashCny),
  };
  return {
    amounts,
    investableTotalCny: round2(Object.values(amounts).reduce((sum, value) => sum + value, 0)),
    excludedEmergencyCashCny: round2(excludedEmergencyCashCny),
    totalAssetsCny: round2(Object.values(raw).reduce((sum, value) => sum + value, 0)),
  };
};

const allocateCashToGaps = (amounts, targets, cashflow) => {
  const projectedTotal = Object.values(amounts).reduce((sum, value) => sum + value, 0) + cashflow;
  const allocation = { nasdaq: 0, gold: 0, bond: 0 };
  let remaining = cashflow;
  const gaps = Object.keys(allocation)
    .map((key) => ({ key, gap: Math.max(0, (projectedTotal * targets[key] / 100) - amounts[key]) }))
    .sort((a, b) => b.gap - a.gap);
  for (const row of gaps) {
    const use = Math.min(remaining, row.gap);
    allocation[row.key] += use;
    remaining -= use;
  }
  if (remaining > 0) {
    for (const key of Object.keys(allocation)) allocation[key] += remaining * targets[key] / 100;
  }
  return Object.fromEntries(Object.entries(allocation).map(([key, value]) => [key, round2(value)]));
};

const buildExecutionPlan = ({
  amounts,
  targets,
  monthlyCashflowCny = 0,
  previousSignal = null,
  currentSignal,
  thresholdPercent = 3,
}) => {
  const current = {
    nasdaq: Math.max(0, Number(amounts?.nasdaq) || 0),
    gold: Math.max(0, Number(amounts?.gold) || 0),
    bond: Math.max(0, Number(amounts?.bond) || 0),
    other: Math.max(0, Number(amounts?.other) || 0),
  };
  const currentTotal = Object.values(current).reduce((sum, value) => sum + value, 0);
  const monthly = Math.max(0, Number(monthlyCashflowCny) || 0);
  const projectedTotalCny = currentTotal + monthly;
  const currentPercents = Object.fromEntries(['nasdaq', 'gold', 'bond', 'other'].map((key) => [
    key,
    currentTotal > 0 ? round2((current[key] / currentTotal) * 100) : 0,
  ]));
  const driftPercent = Object.fromEntries(['nasdaq', 'gold', 'bond', 'other'].map((key) => [
    key,
    round2(currentPercents[key] - (targets[key] || 0)),
  ]));
  const stateChanged = !previousSignal
    || previousSignal.state !== currentSignal.state
    || Boolean(previousSignal.highVolatility) !== Boolean(currentSignal.highVolatility);
  const thresholdBreached = Object.values(driftPercent).some((value) => Math.abs(value) > Number(thresholdPercent));
  const rebalanceRequired = stateChanged || thresholdBreached;
  const monthlyCashflowAllocation = allocateCashToGaps(current, targets, monthly);

  let actions;
  if (rebalanceRequired) {
    actions = {
      nasdaq: round2((projectedTotalCny * targets.nasdaq / 100) - current.nasdaq),
      gold: round2((projectedTotalCny * targets.gold / 100) - current.gold),
      bond: round2((projectedTotalCny * targets.bond / 100) - current.bond),
      other: round2(-current.other),
    };
  } else {
    actions = { ...monthlyCashflowAllocation, other: 0 };
  }

  return {
    rebalanceRequired,
    reason: stateChanged ? 'state_changed' : (thresholdBreached ? 'drift_over_threshold' : 'cashflow_only'),
    projectedTotalCny: round2(projectedTotalCny),
    currentPercents,
    driftPercent,
    actions,
    monthlyCashflowAllocation,
  };
};

module.exports = {
  STATE_LABELS,
  BASE_TARGETS,
  computeSignal,
  buildTargets,
  summarizeStrategyPortfolio,
  buildExecutionPlan,
};
