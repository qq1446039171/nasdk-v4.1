const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { buildMarketSnapshot, loadMarketSnapshot, saveMarketSnapshot } = require('../src/market/snapshot');

const snapshotPath = path.join(os.tmpdir(), `nsdk-market-snapshot-${process.pid}.json`);
const snapshot = buildMarketSnapshot({
  signal: { signalMonth: '2026-07', state: 'strong' },
  targets: { nasdaq: 70, gold: 15, bond: 15 },
  portfolio: { assets: [{ id: '513100', lastPrice: 2.3, lastPriceAt: '2026-08-10T00:00:00.000Z' }] },
  benchmark: { provider: 'fred', code: 'NDX', price: 29400 },
  sources: { signal: 'tiingo-adjusted', benchmark: 'fred', holdings: 'mixed' },
});

saveMarketSnapshot(snapshot, snapshotPath);
const loaded = loadMarketSnapshot(snapshotPath);
assert.strictEqual(loaded.version, 1);
assert.strictEqual(loaded.signal.state, 'strong');
assert.strictEqual(loaded.holdings[0].id, '513100');
assert.strictEqual(loaded.stale, false);
fs.unlinkSync(snapshotPath);

console.log('market-snapshot.test.js passed');
