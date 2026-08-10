const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

assert.match(html, /assetRowsCollapsed:\s*false/, 'asset rows should start expanded');
assert.match(html, /data-action="toggle-assets"/, 'asset section should include a collapse toggle');
assert.match(html, /state\.assetRowsCollapsed \?/, 'asset section should render collapsed and expanded states');
assert.match(html, /balancesHidden:\s*false/, 'balances should start visible');
assert.match(html, /data-action="toggle-balances"/, 'overview should include an eye button to hide balances');
assert.match(html, /state\.balancesHidden \? "\*\*\*\*\*\*"/, 'money formatter should mask balances when hidden');
assert.match(html, /昨日盈亏/, 'overview should display yesterday profit and loss');
assert.match(html, /data-action="open-yesterday-detail"/, 'yesterday profit should expose an asset detail button');
assert.match(html, /renderYesterdayDetailModal/, 'asset profit details should render in a modal');
assert.match(html, /data-action="set-profit-range"/, 'profit chart should include a range switch');
assert.match(html, /renderProfitChart/, 'overview should render a profit chart');
assert.match(html, /renderAssetCategoryPie\(summary\)/, 'asset section should render category proportions as a pie chart');
assert.match(html, /当前投资资产分类占比饼图/, 'category pie chart should have an accessible label');
assert.match(html, /categoryAmount\("gold"\)/, 'overview should surface gold allocation');
assert.match(html, /categoryAmount\("stock"\)/, 'overview should surface other stock and ETF allocation');
assert.match(html, /--gold-deg/, 'donut should include gold allocation as a visible segment');
assert.match(html, /data-action="open-other-detail"/, 'other assets card should expose a detail button');
assert.match(html, /renderOtherDetailModal/, 'other asset details should render in a modal');
assert.match(html, /data-action="open-asset-amount"/, 'each asset row should include an add amount action');
assert.match(html, /renderAssetAmountModal/, 'asset amount entry should render in a modal');
assert.match(html, /function calculateAssetAddition\(asset, amountCny\)/, 'asset amount entry should use a dedicated calculation function');
assert.match(html, /data-asset-payment-account/, 'asset amount modal should include an optional payment account');
assert.match(html, /asset\.category === "cash"/, 'payment account options should only include ordinary cash assets');
assert.match(html, /其他资产与现金/, 'overview should label the combined non-NASDAQ bucket clearly');
assert.doesNotMatch(html, /<div class="stat-label">黄金<\/div>/, 'gold should not be shown as a standalone overview card');
assert.doesNotMatch(html, /<div class="stat-label">其他股票\/ETF<\/div>/, 'other stock and ETF should not be shown as a standalone overview card');

assert.match(html, /asset-category-group/, 'asset section should group holdings by category');
assert.match(html, /asset-category-summary/, 'each category should show its amount and allocation summary');
assert.match(html, /asset-card/, 'asset section should render compact asset cards');
assert.match(html, /asset-edit-details/, 'asset editing fields should use progressive disclosure');
assert.match(html, /data-asset-field="name"/, 'asset cards should retain the name editor');
assert.match(html, /data-asset-field="category"/, 'asset cards should retain the category editor');
assert.match(html, /data-asset-field="code"/, 'asset cards should retain the code editor');
assert.match(html, /data-asset-field="shares"/, 'asset cards should retain the shares editor');
assert.match(html, /data-asset-field="amountCny"/, 'asset cards should retain the fixed amount editor');

assert.doesNotMatch(html, /<table class="data-table asset-table"/, 'legacy wide asset table should be removed');

console.log('asset-table-layout.test.js passed');
