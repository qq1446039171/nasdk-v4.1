const { applyFreshHoldings } = require('./market/holdings');
const { getSignalRows, getBenchmarkSnapshot } = require('./market/providers');
const {
  buildMarketSnapshot,
  loadMarketSnapshot,
  saveMarketSnapshot,
} = require('./market/snapshot');
const { computeSignal, buildTargets, summarizeStrategyPortfolio } = require('./v41-strategy');
const { logEvent, logPush } = require('./logger');
const { push } = require('./push');

const round2 = (value) => Math.round(Number(value) * 100) / 100;
const fmtNumber = (value) => Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
const fmtCny = (value) => Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 0 });

const getDailyMarketSnapshot = async (cfg, deps = {}) => {
  const benchmark = await getBenchmarkSnapshot(cfg, deps);
  return { market: { benchmark }, benchmark, drawdownPct: benchmark.drawdownPct };
};

const buildAllocationComparisons = (portfolio, targets) => {
  const amounts = portfolio && portfolio.amounts || {};
  const total = Math.max(0, Number(portfolio && portfolio.investableTotalCny) || 0);
  return ['nasdaq', 'gold', 'bond', 'other'].map((key) => {
    const currentPercent = total > 0 ? round2((Number(amounts[key] || 0) / total) * 100) : 0;
    const targetPercent = round2(Number(targets && targets[key] || 0));
    return { key, currentPercent, targetPercent, gapPercent: round2(currentPercent - targetPercent) };
  });
};

const comparisonText = (row) => {
  const gap = Number(row.gapPercent);
  const status = Math.abs(gap) < 0.01
    ? '持平'
    : `${gap > 0 ? '超配' : '低配'} ${Math.abs(gap).toFixed(2)} 个百分点`;
  return `当前 ${row.currentPercent.toFixed(2)}%/目标 ${row.targetPercent.toFixed(2)}%（${status}）`;
};

const buildDailyMessage = ({ cfg, signal, targets, portfolio, market, stale = false, warnings = [] }) => {
  const comparisons = Object.fromEntries(buildAllocationComparisons(portfolio, targets).map((row) => [row.key, row]));
  const benchmark = market.benchmark;
  const drawdown = Number(benchmark.drawdownPct);
  const protection = signal.highVolatility ? '＋高波动保护' : '';
  const bondLabel = `${cfg.strategyV41.bondName}（${cfg.strategyV41.bondCode}）`;
  const dataStatus = stale
    ? `数据状态：沿用最后有效快照（${warnings.join('；') || '本次数据源暂不可用'}）`
    : (warnings.length
      ? `数据状态：备用数据源已接管（${warnings.join('；')}）`
      : `数据状态：${benchmark.provider || '行情源'} 已更新${benchmark.priceDay ? `至 ${benchmark.priceDay}` : ''}`);
  const body = [
    '【每日观察】只作观察提示，不给出买卖建议；正式操作以月末通知为准。',
    dataStatus,
    `当前模式：${signal.stateLabel}${protection}（信号月份 ${signal.signalMonth}）`,
    `NDX当前点位：${fmtNumber(benchmark.price)}`,
    `NDX近一年高点：${fmtNumber(benchmark.high1y)}（${benchmark.high1yDay || '日期未知'}）`,
    `当前距离近一年高点：-${Math.abs(drawdown).toFixed(2)}%`,
    `当前金额：纳指 ¥${fmtCny(portfolio.amounts && portfolio.amounts.nasdaq)}｜黄金 ¥${fmtCny(portfolio.amounts && portfolio.amounts.gold)}`,
    '当前仓位 vs 当前模式目标（策略内资产口径，不含独立应急金）：',
    `纳指：${comparisonText(comparisons.nasdaq)}`,
    `黄金：${comparisonText(comparisons.gold)}`,
    `${bondLabel}：${comparisonText(comparisons.bond)}`,
    `策略外/待归类：${comparisonText(comparisons.other)}`,
  ].join('\n\n');
  return {
    title: `每日：-${Math.abs(drawdown).toFixed(2)}%｜${signal.stateLabel}${protection}${stale ? '｜缓存' : ''}`,
    body,
  };
};

const runV41DailySummary = async (cfg, state, deps = {}) => {
  if (cfg.strategyV41 && cfg.strategyV41.enabled === false) return false;
  const refreshHoldings = deps.refreshHoldings || applyFreshHoldings;
  const summarizePortfolio = deps.summarizePortfolio || summarizeStrategyPortfolio;
  const sendPush = deps.push || push;
  const writeEvent = deps.logEvent || logEvent;
  const writePushLog = deps.logPush || logPush;
  const readSnapshot = deps.loadSnapshot || loadMarketSnapshot;
  const writeSnapshot = deps.saveSnapshot || saveMarketSnapshot;
  const cached = readSnapshot() || {};
  const warnings = [];
  let stale = false;

  try {
    const refreshResult = await refreshHoldings(cfg);
    if (refreshResult && refreshResult.failed) warnings.push(`持仓价格 ${refreshResult.failed} 项沿用旧值`);
    writeEvent({ type: 'v41_daily_holdings_refresh', ...refreshResult });
  } catch (error) {
    warnings.push(`持仓价格刷新失败：${error && error.message || String(error)}`);
    writeEvent({ type: 'v41_daily_holdings_refresh_failed', error: error && error.message || String(error) });
  }

  let signal;
  let targets;
  let signalProvider;
  try {
    const signalData = deps.getMonthlyRows
      ? { rows: await deps.getMonthlyRows(cfg.strategyV41.signalSymbol || 'QQQ'), provider: 'injected', warnings: [] }
      : await (deps.getSignalData || getSignalRows)(cfg);
    signal = computeSignal(signalData.rows, { volatilityThresholdPercent: cfg.strategyV41.volatilityThresholdPercent });
    targets = buildTargets(signal.state, signal.highVolatility, {
      highVolatilityReductionPercent: cfg.strategyV41.highVolatilityReductionPercent,
      nasdaqFloorPercent: cfg.strategyV41.nasdaqFloorPercent,
    });
    signalProvider = signalData.provider;
    warnings.push(...(signalData.warnings || []));
  } catch (error) {
    if (!cached.signal || !cached.targets) throw error;
    signal = cached.signal;
    targets = cached.targets;
    signalProvider = cached.sources && cached.sources.signal || 'last-good-snapshot';
    stale = true;
    warnings.push(`QQQ月线获取失败：${error && error.message || String(error)}`);
  }

  let benchmark;
  try {
    const result = deps.getMarketSnapshot
      ? await deps.getMarketSnapshot(cfg)
      : await (deps.getBenchmarkData || getDailyMarketSnapshot)(cfg);
    benchmark = result.benchmark;
    warnings.push(...(benchmark.warnings || []));
  } catch (error) {
    if (!cached.benchmark) throw error;
    benchmark = cached.benchmark;
    stale = true;
    warnings.push(`NDX日线获取失败：${error && error.message || String(error)}`);
  }

  const portfolio = summarizePortfolio(
    cfg.portfolio && cfg.portfolio.assetSummary && cfg.portfolio.assetSummary.assets || cfg.portfolio && cfg.portfolio.assets || [],
    cfg.strategyV41.excludedEmergencyCashCny,
  );
  const market = { benchmark };
  const message = buildDailyMessage({ cfg, signal, targets, portfolio, market, stale, warnings });
  const pushRet = await sendPush(cfg, message);

  const snapshot = buildMarketSnapshot({
    signal,
    targets,
    portfolio: cfg.portfolio && cfg.portfolio.assetSummary || cfg.portfolio,
    benchmark,
    stale,
    warnings,
    sources: {
      signal: signalProvider,
      benchmark: benchmark.provider || 'unknown',
      holdings: cfg.tushareToken ? 'tushare+fallback' : 'eastmoney+fund-fallback',
    },
  });
  try {
    writeSnapshot(snapshot);
  } catch (error) {
    warnings.push(`行情快照保存失败：${error && error.message || String(error)}`);
    writeEvent({ type: 'v41_market_snapshot_save_failed', error: error && error.message || String(error) });
  }

  state.lastMarket = { benchmark, at: new Date().toISOString() };
  state.v41Daily = {
    lastCheckedAt: new Date().toISOString(),
    lastSignal: signal,
    lastTargets: targets,
    lastPortfolio: portfolio,
    lastMarket: market,
    lastMessage: message,
    stale,
    warnings,
  };
  if (pushRet && pushRet.ok) state.v41Daily.lastNotifiedAt = new Date().toISOString();
  writeEvent({ type: 'v41_daily_summary', signal, targets, market, stale, warnings, pushRet });
  writePushLog({ kind: 'v41-daily', title: message.title, ok: Boolean(pushRet && pushRet.ok), status: pushRet && pushRet.status || null, code: pushRet && pushRet.code || null });
  return Boolean(pushRet && pushRet.ok);
};

module.exports = {
  buildAllocationComparisons,
  buildDailyMessage,
  getDailyMarketSnapshot,
  runV41DailySummary,
};
