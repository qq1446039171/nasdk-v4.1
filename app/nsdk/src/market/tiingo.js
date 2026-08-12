const { fetchJsonWithRetry } = require('./http');

const parseTiingoMonthly = (payload, now = new Date()) => {
  const currentMonth = now.toISOString().slice(0, 7);
  return (Array.isArray(payload) ? payload : [])
    .map((row) => ({
      month: String(row && row.date || '').slice(0, 7),
      close: Number(row && (row.adjClose ?? row.close)),
    }))
    .filter((row) => row.month && row.month < currentMonth && Number.isFinite(row.close) && row.close > 0)
    .sort((a, b) => a.month.localeCompare(b.month));
};

const getCompletedMonthlyAdjustedCloses = async (symbol = 'QQQ', token, options = {}) => {
  const normalizedSymbol = String(symbol || '').trim().toUpperCase();
  if (!normalizedSymbol) throw new Error('Tiingo symbol is required');
  if (!String(token || '').trim()) throw new Error('TIINGO_API_TOKEN is missing');
  const now = options.now || new Date();
  const start = new Date(now);
  start.setUTCFullYear(start.getUTCFullYear() - 7);
  const params = new URLSearchParams({
    startDate: start.toISOString().slice(0, 10),
    endDate: now.toISOString().slice(0, 10),
    resampleFreq: 'monthly',
  });
  const url = `https://api.tiingo.com/tiingo/daily/${encodeURIComponent(normalizedSymbol)}/prices?${params}`;
  const payload = await fetchJsonWithRetry(url, {
    ...options,
    provider: 'Tiingo QQQ monthly history',
    headers: {
      Accept: 'application/json',
      Authorization: `Token ${String(token).trim()}`,
    },
  });
  const rows = parseTiingoMonthly(payload, now);
  if (rows.length < 13) throw new Error(`Tiingo QQQ monthly history insufficient: ${rows.length}`);
  return rows;
};

module.exports = {
  getCompletedMonthlyAdjustedCloses,
  parseTiingoMonthly,
};
