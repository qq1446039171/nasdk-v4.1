const { fetchJsonWithRetry } = require('./http');

const toTsCode = (asset) => {
  const code = String(asset && asset.code || '').trim();
  if (!/^\d{6}$/.test(code)) throw new Error(`Unsupported Tushare fund code: ${code || 'empty'}`);
  if (asset && asset.kind === 'fund') return `${code}.OF`;
  return `${code}.${/^[569]/.test(code) ? 'SH' : 'SZ'}`;
};

const fieldRows = (payload) => {
  if (Number(payload && payload.code) !== 0) throw new Error(`Tushare API error: ${payload && (payload.msg || payload.code)}`);
  const fields = payload && payload.data && payload.data.fields;
  const items = payload && payload.data && payload.data.items;
  if (!Array.isArray(fields) || !Array.isArray(items)) return [];
  return items.map((item) => Object.fromEntries(fields.map((field, index) => [field, item[index]])));
};

const tushareDay = (value) => {
  const day = String(value || '');
  return /^\d{8}$/.test(day) ? `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}` : day;
};

const fetchTushareHoldingPrice = async (asset, options = {}) => {
  const token = String(options.token || '').trim();
  if (!token) throw new Error('TUSHARE_TOKEN is missing');
  const tsCode = toTsCode(asset);
  const isOtcFund = asset && asset.kind === 'fund';
  const apiName = isOtcFund ? 'fund_nav' : 'fund_daily';
  const fields = isOtcFund
    ? 'ts_code,ann_date,nav_date,unit_nav,adj_nav'
    : 'ts_code,trade_date,close,pct_chg';
  const payload = await fetchJsonWithRetry('https://api.tushare.pro', {
    ...options,
    provider: `Tushare ${apiName}`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ api_name: apiName, token, params: { ts_code: tsCode }, fields }),
  });
  const rows = fieldRows(payload).sort((a, b) => String(b.trade_date || b.nav_date || b.ann_date || '').localeCompare(String(a.trade_date || a.nav_date || a.ann_date || '')));
  const latest = rows[0];
  if (!latest) throw new Error(`Tushare ${apiName} returned no rows for ${tsCode}`);
  const price = Number(isOtcFund ? (latest.unit_nav ?? latest.adj_nav) : latest.close);
  if (!Number.isFinite(price) || price <= 0) throw new Error(`Tushare ${apiName} returned invalid price for ${tsCode}`);
  const pct = Number(latest.pct_chg);
  return {
    price,
    pct: Number.isFinite(pct) ? pct : null,
    date: tushareDay(latest.trade_date || latest.nav_date || latest.ann_date),
    provider: 'tushare',
  };
};

module.exports = {
  fetchTushareHoldingPrice,
  toTsCode,
};
