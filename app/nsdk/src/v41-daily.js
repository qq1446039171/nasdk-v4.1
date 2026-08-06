const { getCompletedMonthlyAdjustedCloses } = require('./market/qqq-monthly');
const { applyFreshHoldings } = require('./market/holdings');
const { getLatestPrice, getOneYearHigh } = require('./market/eastmoney');
const { computeDrawdown } = require('./plan');
const { computeSignal, buildTargets, summarizeStrategyPortfolio } = require('./v41-strategy');
const { logEvent, logPush } = require('./logger');
const { push } = require('./push');

const NDX_SECID = '100.NDX100';
const round2 = (value) => Math.round(Number(value) * 100) / 100;
const fmtNumber = (value) => Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 2 });

const getDailyMarketSnapshot = async (cfg) => {
  const [ndxLatest, ndxHigh] = await Promise.all([
    getLatestPrice(NDX_SECID),
    getOneYearHigh(NDX_SECID),
  ]);
  const benchmark = {
    provider: 'eastmoney',
    code: 'NDX',
    name: ndxLatest.name || '纳斯达克100（NDX）',
    price: ndxLatest.price,
    pct: ndxLatest.pct,
    high1y: ndxHigh.maxHigh,
    high1yDay: ndxHigh.maxDay,
    drawdownPct: Math.max(0, computeDrawdown({ current: ndxLatest.price, high: ndxHigh.maxHigh }) || 0),
  };
  return { market: { benchmark }, benchmark, drawdownPct: benchmark.drawdownPct };
};

const buildAllocationComparisons = (portfolio, targets) => {
  const amounts = portfolio?.amounts || {};
  const total = Math.max(0, Number(portfolio?.investableTotalCny) || 0);
  return ['nasdaq', 'gold', 'bond', 'other'].map((key) => {
    const currentPercent = total > 0 ? round2((Number(amounts[key] || 0) / total) * 100) : 0;
    const targetPercent = round2(Number(targets?.[key] || 0));
    return {
      key,
      currentPercent,
      targetPercent,
      gapPercent: round2(currentPercent - targetPercent),
    };
  });
};

const comparisonText = (row) => {
  const gap = Number(row.gapPercent);
  const status = Math.abs(gap) < 0.01
    ? '持平'
    : `${gap > 0 ? '超配' : '低配'} ${Math.abs(gap).toFixed(2)} 个百分点`;
  return `当前 ${row.currentPercent.toFixed(2)}%/目标 ${row.targetPercent.toFixed(2)}%（${status}）`;
};

const buildDailyMessage = ({ cfg, signal, targets, portfolio, market }) => {
  const comparisons = Object.fromEntries(buildAllocationComparisons(portfolio, targets).map((row) => [row.key, row]));
  const benchmark = market.benchmark;
  const drawdown = Number(benchmark.drawdownPct);
  const protection = signal.highVolatility ? '＋高波动保护' : '';
  const bondLabel = `${cfg.strategyV41.bondName}（${cfg.strategyV41.bondCode}）`;
  const body = [
    '【每日观察】只作观察提示，不给出买卖建议；正式操作以月末通知为准。',
    `当前模式：${signal.stateLabel}${protection}（信号月份 ${signal.signalMonth}）`,
    `NDX当前点位：${fmtNumber(benchmark.price)}`,
    `NDX近一年高点：${fmtNumber(benchmark.high1y)}（${benchmark.high1yDay || '日期未知'}）`,
    `当前距离近一年高点：-${Math.abs(drawdown).toFixed(2)}%`,
    '当前仓位 vs 当前模式目标（策略内资产口径，不含独立应急金）：',
    `纳指：${comparisonText(comparisons.nasdaq)}`,
    `黄金：${comparisonText(comparisons.gold)}`,
    `${bondLabel}：${comparisonText(comparisons.bond)}`,
    `策略外/待归类：${comparisonText(comparisons.other)}`,
  ].join('\n\n');
  return {
    title: `v4.1每日观察：${signal.stateLabel}${protection}｜NDX回撤-${Math.abs(drawdown).toFixed(2)}%`,
    body,
  };
};

const runV41DailySummary = async (cfg, state, deps = {}) => {
  if (cfg.strategyV41?.enabled === false) return false;
  const refreshHoldings = deps.refreshHoldings || applyFreshHoldings;
  const getMonthlyRows = deps.getMonthlyRows || getCompletedMonthlyAdjustedCloses;
  const fetchMarketSnapshot = deps.getMarketSnapshot || getDailyMarketSnapshot;
  const summarizePortfolio = deps.summarizePortfolio || summarizeStrategyPortfolio;
  const sendPush = deps.push || push;

  try {
    const refreshResult = await refreshHoldings(cfg);
    logEvent({ type: 'v41_daily_holdings_refresh', ...refreshResult });
  } catch (error) {
    logEvent({ type: 'v41_daily_holdings_refresh_failed', error: error?.message || String(error) });
  }

  const rows = await getMonthlyRows(cfg.strategyV41.signalSymbol || 'QQQ');
  const signal = computeSignal(rows, {
    volatilityThresholdPercent: cfg.strategyV41.volatilityThresholdPercent,
  });
  const targets = buildTargets(signal.state, signal.highVolatility, {
    highVolatilityReductionPercent: cfg.strategyV41.highVolatilityReductionPercent,
    nasdaqFloorPercent: cfg.strategyV41.nasdaqFloorPercent,
  });
  const portfolio = summarizePortfolio(
    cfg.portfolio?.assetSummary?.assets || cfg.portfolio?.assets || [],
    cfg.strategyV41.excludedEmergencyCashCny,
  );
  const marketSnapshot = await fetchMarketSnapshot(cfg);
  const market = {
    benchmark: marketSnapshot.benchmark,
  };
  const message = buildDailyMessage({ cfg, signal, targets, portfolio, market });
  const pushRet = await sendPush(cfg, message);

  state.lastMarket = { ...(marketSnapshot.market || market), at: new Date().toISOString() };
  state.v41Daily = {
    lastCheckedAt: new Date().toISOString(),
    lastSignal: signal,
    lastTargets: targets,
    lastPortfolio: portfolio,
    lastMarket: market,
    lastMessage: message,
  };
  if (pushRet?.ok) state.v41Daily.lastNotifiedAt = new Date().toISOString();
  logEvent({ type: 'v41_daily_summary', signal, targets, market, pushRet });
  logPush({
    kind: 'v41-daily',
    title: message.title,
    ok: Boolean(pushRet?.ok),
    status: pushRet?.status ?? null,
    code: pushRet?.code ?? null,
  });
  return Boolean(pushRet?.ok);
};

module.exports = {
  buildAllocationComparisons,
  buildDailyMessage,
  getDailyMarketSnapshot,
  runV41DailySummary,
};
