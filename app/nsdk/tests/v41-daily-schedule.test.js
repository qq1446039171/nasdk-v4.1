const assert = require('assert');
const { runDueV41DailyChecks } = require('../src/v41-daily-schedule');

(async () => {
  const cfg = {
    timezone: 'Asia/Shanghai',
    dailyChecks: [{ hour: '11', minute: '00' }, { hour: '14', minute: '00' }],
  };
  const state = {};
  let calls = 0;
  const now = new Date('2026-08-06T06:05:00Z'); // 北京时间周四 14:05
  const first = await runDueV41DailyChecks(cfg, state, {
    now,
    runDaily: async () => { calls += 1; return true; },
  });
  assert.strictEqual(first.sent, 2, '14:05 首次运行应补发 11:00 并发送 14:00');
  assert.strictEqual(calls, 2);
  assert.ok(state.lastRunKeys['v41-daily:2026-08-06:11:00']);
  assert.ok(state.lastRunKeys['v41-daily:2026-08-06:14:00']);

  const second = await runDueV41DailyChecks(cfg, state, {
    now,
    runDaily: async () => { calls += 1; return true; },
  });
  assert.strictEqual(second.sent, 0, '同一时段成功后不得重复推送');
  assert.strictEqual(calls, 2);

  const weekend = await runDueV41DailyChecks(cfg, {}, {
    now: new Date('2026-08-08T06:05:00Z'), // 北京时间周六
    runDaily: async () => { calls += 1; return true; },
  });
  assert.strictEqual(weekend.sent, 0, '周末不推送');
  assert.strictEqual(calls, 2);
  console.log('v41-daily-schedule.test.js passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
