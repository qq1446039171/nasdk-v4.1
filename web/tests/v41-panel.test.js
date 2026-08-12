const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const settings = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'Config', 'settings.json'), 'utf8'));

assert.match(html, /function renderV41Overview\(/, 'web should render a v4.1 overview');
assert.match(html, /async function refreshV41LiveSignal\(/, 'web should refresh the effective v4.1 state on page load');
assert.match(html, /function computeV41LiveSignal\(/, 'web should calculate the v4.1 signal from completed QQQ months');
assert.match(html, /const signal = live\.signal \|\| runtime\.lastSignal \|\| null/, 'live signal should take priority over cloud state fallback');
assert.match(html, /await refreshV41LiveSignal\(\)/, 'settings load should trigger a live signal refresh');
assert.match(html, /async function tryLoadMarketSnapshot\(/, 'web should load the GitHub Actions market snapshot');
assert.match(html, /Config\/market-snapshot\.json/, 'web should use the persisted market snapshot');
assert.match(html, /if \(!forceDirect && await tryLoadMarketSnapshot\(\)\)/, 'automatic refresh should prefer the snapshot while manual refresh can bypass it');
assert.match(html, /hasPortfolioAssets\(\) && !state\.marketSnapshot/, 'automatic loading should avoid direct per-asset requests after the snapshot succeeds');
assert.match(html, /row\.month < currentMonth/, 'the current incomplete month must not be used by the signal');
assert.match(html, /当前有效状态/, 'web should label the state as currently effective rather than a daily trading signal');
assert.match(html, /data-action="refresh-latest-data"/, 'effective state card should expose a latest-data refresh button');
assert.match(html, /async function refreshLatestData\(\)/, 'web should coordinate a full latest-data refresh');
assert.match(html, /refreshV41LiveSignal\(\{ forceDirect: true \}\)/, 'manual latest refresh must bypass the static snapshot for the signal');
assert.match(html, /refreshAssetPrices\(\{ forceDirect: true \}\)/, 'manual latest refresh must bypass the static snapshot for asset prices');
assert.match(
  html,
  /\$\{renderV41Overview\(\)\}[\s\S]*strategy-maintenance-divider[\s\S]*\$\{renderAssetSection\(\)\}[\s\S]*\$\{renderGroups\(\)\}/,
  'asset holdings should appear after the v4.1 strategy block with a divider'
);
assert.doesNotMatch(html, /\$\{renderStateSection\(\)\}/, 'legacy state.json status block should not be rendered');
assert.match(html, /id: "portfolio",\s*titleZh: "投资金额（手动输入）",\s*titleEn: "Portfolio Amounts",\s*hidden: true/, 'legacy manual portfolio amount group should be hidden');
assert.match(html, /强势\/过渡\/防守/, 'web should explain the three market states');
assert.match(html, /本月具体金额变动方向/, 'web should show exact monthly money directions');
assert.match(html, /各状态对应资产仓位/, 'web should show the allocation table for all market states');
assert.match(html, /renderMarketStateTimeline\(\)/, 'web should render the market state timeline');
assert.match(html, /renderCurrentMarketTimelineSvg\(/, 'market state timeline should render from the configured start month without fetching local SVG');
assert.match(html, /const height = 142;/, 'market state timeline should use a compact presentation height');
assert.match(html, /background: #0a1c2d;/, 'market state timeline should use a restrained solid surface');
assert.match(html, /\.market-timeline-svg \{[\s\S]*width: auto;/, 'market state timeline should keep fixed card sizes instead of stretching across the panel');
assert.match(html, /width="\$\{width\}" height="\$\{height\}"/, 'market state timeline should expose its intrinsic SVG size');
assert.match(html, /function currentYearMonth\(/, 'market state timeline should default to the current program month');
assert.doesNotMatch(html, /fetch\(`\$\{MARKET_STATE_TIMELINE_ASSET\}/, 'market state timeline should not fetch a local SVG from file://');
assert.match(html, /assets\/v41-market-state-timeline\.svg/, 'web should retain the bundled market state SVG as the historical source asset');
assert.match(html, /marketStateTimelineStartMonth/, 'web should expose the timeline start month setting');
assert.match(html, /renderAssetCategoryPie\(summary\)/, 'web should render a category allocation pie chart');
assert.match(html, /conic-gradient\(/, 'category allocation should use a pie chart gradient');
assert.match(html, /\.category-pie::after/, 'category allocation should render a doughnut center');
assert.match(html, /transparent \$\{colorEnd\.toFixed/, 'category allocation should separate doughnut segments');
assert.match(html, /key: "strong"[\s\S]*nasdaq: 70, gold: 15, bond: 15/, 'strong state should use 70/15/15');
assert.match(html, /key: "transition"[\s\S]*nasdaq: 55, gold: 15, bond: 30/, 'transition state should use 55/15/30');
assert.match(html, /key: "defensive"[\s\S]*nasdaq: 15, gold: 15, bond: 70/, 'defensive state should use 15/15/70');
assert.match(html, /v41-current-badge/, 'current market state should be highlighted');
assert.match(html, /assetCategories\.splice\(3, 0, \{ value: "bond"/, 'web should support bond assets');
assert.match(html, /deepSet\(repositorySettings, "nsdk\.serverChan\.sendKey", ""\)/, 'GitHub save must redact ServerChan credentials');
assert.strictEqual(settings.strategyV41.signalSymbol, 'QQQ');
assert.strictEqual(settings.strategyV41.bondCode, '511360');
assert.strictEqual(settings.strategyV41.marketStateTimelineStartMonth, '2026-08');
assert.strictEqual(settings.strategyV41.rebalanceThresholdPercent, 3);
assert.ok(settings.portfolio.assets.some((asset) => asset.code === '511360' && asset.category === 'bond'));
assert.ok(settings.portfolio.assets.filter((asset) => ['270042', '018043', '000834', '019172', '016452', '017436', '008976', '110020', '000217', '009505'].includes(asset.code)).every((asset) => asset.kind === 'fund' && asset.secid === ''), 'OTC funds must not be sent to exchange quote APIs');
assert.strictEqual(settings.nsdk.serverChan.sendKey, '');
assert.strictEqual(settings.nsdk.finnhub.apiKey, '');
assert.strictEqual(settings.nsdk.marketData.tiingoApiToken, '', 'tracked settings must not contain the Tiingo token');
assert.strictEqual(settings.nsdk.marketData.fredApiKey, '', 'tracked settings must not contain the FRED key');
assert.strictEqual(settings.nsdk.marketData.tushareToken, '', 'tracked settings must not contain the Tushare token');
assert.match(html, /nsdk\.marketData\.tiingoApiToken/, 'web normalization should preserve the Tiingo token');
assert.match(html, /nsdk\.marketData\.fredApiKey/, 'web normalization should preserve the FRED key');
assert.match(html, /nsdk\.marketData\.tushareToken/, 'web normalization should preserve the Tushare token');
assert.match(html, /deepSet\(repositorySettings, "nsdk\.marketData\.tiingoApiToken", ""\)/, 'GitHub save must redact Tiingo credentials');
assert.match(html, /deepSet\(repositorySettings, "nsdk\.marketData\.fredApiKey", ""\)/, 'GitHub save must redact FRED credentials');
assert.match(html, /deepSet\(repositorySettings, "nsdk\.marketData\.tushareToken", ""\)/, 'GitHub save must redact Tushare credentials');
assert.ok(fs.existsSync(path.join(__dirname, '..', 'assets', 'v41-market-state-timeline.svg')));

console.log('v41-panel.test.js passed');
