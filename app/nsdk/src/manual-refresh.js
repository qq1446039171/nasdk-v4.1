const { runV41DailySummary } = require('./v41-daily');

const runManualRefresh = async (cfg, state, deps = {}) => {
  const runSummary = deps.runSummary || runV41DailySummary;
  const pushed = await runSummary(cfg, state);
  return { snapshotGenerated: true, pushed: Boolean(pushed) };
};

module.exports = {
  runManualRefresh,
};
