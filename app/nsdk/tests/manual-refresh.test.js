const assert = require('assert');
const { runManualRefresh } = require('../src/manual-refresh');

(async () => {
  let calls = 0;
  const cfg = { strategyV41: { enabled: true } };
  const state = {};
  const success = await runManualRefresh(cfg, state, {
    runSummary: async (receivedCfg, receivedState) => {
      calls += 1;
      assert.strictEqual(receivedCfg, cfg);
      assert.strictEqual(receivedState, state);
      return true;
    },
  });
  assert.deepStrictEqual(success, { snapshotGenerated: true, pushed: true });
  assert.strictEqual(calls, 1, 'manual refresh should bypass daily slot checks and run exactly once');

  const pushFailure = await runManualRefresh(cfg, state, { runSummary: async () => false });
  assert.deepStrictEqual(pushFailure, { snapshotGenerated: true, pushed: false });
  console.log('manual-refresh.test.js passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
