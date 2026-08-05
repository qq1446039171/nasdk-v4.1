const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const settings = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'Config', 'settings.json'), 'utf8'));

assert.match(html, /function renderV41Overview\(/, 'web should render a v4.1 overview');
assert.match(html, /强势\/过渡\/防守/, 'web should explain the three market states');
assert.match(html, /本月具体金额变动方向/, 'web should show exact monthly money directions');
assert.match(html, /assetCategories\.splice\(3, 0, \{ value: "bond"/, 'web should support bond assets');
assert.match(html, /deepSet\(repositorySettings, "nsdk\.serverChan\.sendKey", ""\)/, 'GitHub save must redact ServerChan credentials');
assert.strictEqual(settings.strategyV41.signalSymbol, 'QQQ');
assert.strictEqual(settings.strategyV41.bondCode, '511360');
assert.strictEqual(settings.strategyV41.rebalanceThresholdPercent, 3);
assert.ok(settings.portfolio.assets.some((asset) => asset.code === '511360' && asset.category === 'bond'));
assert.strictEqual(settings.nsdk.serverChan.sendKey, '');
assert.strictEqual(settings.nsdk.finnhub.apiKey, '');

console.log('v41-panel.test.js passed');
