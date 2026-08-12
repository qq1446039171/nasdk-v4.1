const fs = require('fs');
const path = require('path');

const DEFAULT_SNAPSHOT_PATH = path.resolve(__dirname, '..', '..', '..', '..', 'Config', 'market-snapshot.json');

const resolveMarketSnapshotPath = () => process.env.MARKET_SNAPSHOT_PATH
  ? path.resolve(process.env.MARKET_SNAPSHOT_PATH)
  : DEFAULT_SNAPSHOT_PATH;

const loadMarketSnapshot = (snapshotPath = resolveMarketSnapshotPath()) => {
  try {
    if (!fs.existsSync(snapshotPath)) return null;
    const value = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
};

const saveMarketSnapshot = (snapshot, snapshotPath = resolveMarketSnapshotPath()) => {
  fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
  const tempPath = `${snapshotPath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  fs.renameSync(tempPath, snapshotPath);
};

const buildMarketSnapshot = ({ signal, targets, portfolio, benchmark, sources = {}, stale = false, warnings = [] }) => ({
  version: 1,
  generatedAt: new Date().toISOString(),
  stale: Boolean(stale),
  warnings: Array.isArray(warnings) ? warnings.filter(Boolean) : [],
  sources,
  signal: signal || null,
  targets: targets || null,
  benchmark: benchmark || null,
  holdings: (Array.isArray(portfolio && portfolio.assets) ? portfolio.assets : []).map((asset) => ({
    id: asset.id || asset.code || asset.name,
    code: asset.code || '',
    lastPrice: Number(asset.lastPrice) || 0,
    lastPriceAt: asset.lastPriceAt || '',
    lastPriceError: asset.lastPriceError || '',
  })),
});

module.exports = {
  DEFAULT_SNAPSHOT_PATH,
  buildMarketSnapshot,
  loadMarketSnapshot,
  resolveMarketSnapshotPath,
  saveMarketSnapshot,
};
