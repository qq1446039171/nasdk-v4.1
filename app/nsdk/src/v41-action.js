const { getCompletedMonthlyAdjustedCloses: getEastmoneyMonthlyCloses } = require('./market/qqq-monthly');
const { applyFreshHoldings } = require('./market/holdings');
const {
  computeSignal,
  buildTargets,
  summarizeStrategyPortfolio,
  buildExecutionPlan,
} = require('./v41-strategy');
const { logEvent, logPush } = require('./logger');
const { push } = require('./push');

const fmtCny = (value) => Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 0 });
const signedPercent = (value) => `${Number(value) >= 0 ? '+' : ''}${Number(value).toFixed(2)}%`;

const getSignalRows = async (cfg, deps = {}) => {
  const strategy = cfg.strategyV41 || {};
  const symbol = strategy.signalSymbol || 'QQQ';
  const eastmoney = deps.getEastmoneyRows || getEastmoneyMonthlyCloses;
  return { rows: await eastmoney(symbol), provider: 'eastmoney-adjusted' };
};

const actionLines = (plan, cfg) => {
  const labels = {
    nasdaq: '纳斯达克（优先 513100）',
    gold: '黄金基金',
    bond: `${cfg.strategyV41.bondName}（${cfg.strategyV41.bondCode}）`,
    other: '策略外股票/现金',
  };
  const order = ['other', 'nasdaq', 'gold', 'bond'];
  const lines = order
    .filter((key) => Math.abs(Number(plan.actions[key]) || 0) >= 1)
    .map((key) => {
      const value = Number(plan.actions[key]);
      return `${value > 0 ? '买入/转入' : '卖出/转出'} ${labels[key]}：¥${fmtCny(Math.abs(value))}`;
    });
  return lines.length ? lines : ['无需交易；保持当前仓位'];
};

const buildMessage = ({ cfg, signal, targets, portfolio, plan, provider }) => {
  const reason = plan.reason === 'state_changed'
    ? '市场状态或高波动保护发生变化，需要整体调仓'
    : (plan.reason === 'drift_over_threshold' ? '至少一类资产偏离目标超过 3 个百分点，需要再平衡' : '状态未变且偏离未超阈值，只分配本月新增现金');
  const title = `v4.1月末：${signal.stateLabel}${signal.highVolatility ? '＋高波动保护' : ''}`;
  const body = [
    `信号月份：${signal.signalMonth}（数据源：${provider}，${cfg.strategyV41.signalSymbol} 月度复权价）`,
    `趋势：收盘 ${signal.close} ${signal.trendPositive ? '>' : '≤'} SMA10 ${signal.sma10}；12月动量 ${signedPercent(signal.momentum12Percent)}`,
    `6月年化波动率：${signal.annualizedVolatilityPercent.toFixed(2)}%（阈值 ${signal.volatilityThresholdPercent.toFixed(2)}%）`,
    `目标仓位：纳指 ${targets.nasdaq}% / 黄金 ${targets.gold}% / 债券 ${targets.bond}%`,
    `策略内资产：¥${fmtCny(portfolio.investableTotalCny)}；独立应急金：¥${fmtCny(portfolio.excludedEmergencyCashCny)}；本月新增：¥${fmtCny(cfg.monthlyCashflowCny)}`,
    `处理原因：${reason}`,
    ...actionLines(plan, cfg),
    '执行时间：信号确认后的下一个中国可交易日；金额按当日成交价允许有少量误差。',
  ].join('\n\n');
  return { title, body };
};

const runV41MonthEnd = async (cfg, state, options = {}) => {
  if (cfg.strategyV41?.enabled === false) return false;
  try {
    await applyFreshHoldings(cfg);
  } catch (error) {
    logEvent({ type: 'v41_holdings_refresh_failed', error: error?.message || String(error) });
  }

  const { rows, provider } = await getSignalRows(cfg, options.deps);
  const signal = computeSignal(rows, {
    volatilityThresholdPercent: cfg.strategyV41.volatilityThresholdPercent,
  });
  state.v41 = state.v41 || {};
  if (!options.force && state.v41.lastNotifiedSignalMonth === signal.signalMonth) {
    state.v41.lastCheckedAt = new Date().toISOString();
    return false;
  }

  let plan;
  let portfolio;
  let targets;
  if (!options.force && state.v41.lastSignal?.signalMonth === signal.signalMonth && state.v41.lastPlan) {
    plan = state.v41.lastPlan;
    portfolio = state.v41.lastPortfolio;
    targets = state.v41.lastTargets;
  } else {
    portfolio = summarizeStrategyPortfolio(
      cfg.portfolio?.assetSummary?.assets || cfg.portfolio?.assets || [],
      cfg.strategyV41.excludedEmergencyCashCny,
    );
    targets = buildTargets(signal.state, signal.highVolatility, {
      highVolatilityReductionPercent: cfg.strategyV41.highVolatilityReductionPercent,
      nasdaqFloorPercent: cfg.strategyV41.nasdaqFloorPercent,
    });
    plan = buildExecutionPlan({
      amounts: portfolio.amounts,
      targets,
      monthlyCashflowCny: cfg.monthlyCashflowCny,
      previousSignal: state.v41.lastSignal,
      currentSignal: signal,
      thresholdPercent: cfg.strategyV41.rebalanceThresholdPercent,
    });
  }

  const message = buildMessage({ cfg, signal, targets, portfolio, plan, provider });
  const pushRet = await push(cfg, message);
  state.v41 = {
    ...state.v41,
    lastCheckedAt: new Date().toISOString(),
    lastSignal: signal,
    lastTargets: targets,
    lastPortfolio: portfolio,
    lastPlan: plan,
    lastProvider: provider,
    lastMessage: message,
  };
  if (pushRet?.ok) state.v41.lastNotifiedSignalMonth = signal.signalMonth;
  logEvent({ type: 'v41_month_end', signal, targets, plan, pushRet });
  logPush({ kind: 'v41-month-end', title: message.title, ok: Boolean(pushRet?.ok), status: pushRet?.status ?? null, code: pushRet?.code ?? null });
  return Boolean(pushRet?.ok);
};

module.exports = {
  runV41MonthEnd,
  buildMessage,
  actionLines,
  getSignalRows,
};
