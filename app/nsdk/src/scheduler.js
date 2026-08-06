const { loadConfig } = require('./config');
const { loadState, saveState } = require('./state');
const { getParts, isWeekday, isSlotDue } = require('./time');
const { runV41MonthEnd } = require('./v41-action');
const { runDueV41DailyChecks } = require('./v41-daily-schedule');
const { logEvent } = require('./logger');

const shouldRunMonthEndCheck = (state, ymd) => {
  const key = `v41-check:${ymd}`;
  state.lastRunKeys = state.lastRunKeys || {};
  if (state.lastRunKeys[key]) return false;
  state.lastRunKeys[key] = new Date().toISOString();
  return true;
};

const tick = async (cfg, state) => {
  const parts = getParts(new Date(), cfg.timezone);
  const target = (cfg.dailyChecks || [])[0] || { hour: 11, minute: 0 };
  if (!isWeekday(parts.weekday)) return;
  try {
    try {
      await runDueV41DailyChecks(cfg, state);
    } catch (error) {
      logEvent({ type: 'error', where: 'runDueV41DailyChecks', message: error?.message || String(error) });
    }
    if (isSlotDue(parts, target) && shouldRunMonthEndCheck(state, parts.ymd)) {
      try {
        await runV41MonthEnd(cfg, state);
      } catch (error) {
        logEvent({ type: 'error', where: 'runV41MonthEnd', message: error?.message || String(error) });
      }
    }
  } finally {
    saveState(state);
  }
};

const main = async () => {
  const state = loadState();
  let cfg = loadConfig();
  logEvent({ type: 'scheduler_start', strategy: 'v4.1', timezone: cfg.timezone });
  saveState(state);
  await tick(cfg, state);

  setInterval(() => tick(cfg, state), 30 * 60 * 1000);
  setInterval(() => {
    try {
      cfg = loadConfig();
      logEvent({ type: 'config_reloaded' });
    } catch (error) {
      logEvent({ type: 'error', where: 'reloadConfig', message: error?.message || String(error) });
    }
  }, 5 * 60 * 60 * 1000);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
