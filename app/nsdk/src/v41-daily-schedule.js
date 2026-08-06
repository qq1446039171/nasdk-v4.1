const { getParts, isWeekday, isSlotDue } = require('./time');
const { shouldAttemptSlot, recordSlotAttempt, markSlotDone } = require('./state');
const { runV41DailySummary } = require('./v41-daily');

const runKeyForTarget = (parts, target) => {
  const hour = String(target.hour).padStart(2, '0');
  const minute = String(target.minute).padStart(2, '0');
  return `v41-daily:${parts.ymd}:${hour}:${minute}`;
};

const runDueV41DailyChecks = async (cfg, state, options = {}) => {
  const parts = getParts(options.now || new Date(), cfg.timezone);
  if (!isWeekday(parts.weekday)) return { attempted: 0, sent: 0 };

  const runDaily = options.runDaily || runV41DailySummary;
  let attempted = 0;
  let sent = 0;
  for (const target of cfg.dailyChecks || []) {
    if (!isSlotDue(parts, target)) continue;
    const key = runKeyForTarget(parts, target);
    if (!shouldAttemptSlot(state, key)) continue;
    recordSlotAttempt(state, key);
    attempted += 1;
    const pushed = await runDaily(cfg, state);
    if (pushed) {
      markSlotDone(state, key);
      sent += 1;
    }
  }
  return { attempted, sent };
};

module.exports = {
  runKeyForTarget,
  runDueV41DailyChecks,
};
