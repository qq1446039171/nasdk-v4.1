const { fetchJsonWithRetry } = require('./http');

const round2 = (value) => Math.round(Number(value) * 100) / 100;

const parseFredNasdaq100 = (payload, now = new Date()) => {
  const rows = (Array.isArray(payload && payload.observations) ? payload.observations : [])
    .map((row) => ({ date: String(row && row.date || ''), value: Number(row && row.value) }))
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date) && Number.isFinite(row.value) && row.value > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (rows.length < 2) throw new Error(`FRED NASDAQ100 history insufficient: ${rows.length}`);

  const latest = rows[rows.length - 1];
  const previous = rows[rows.length - 2];
  const cutoff = new Date(now);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1);
  const cutoffDay = cutoff.toISOString().slice(0, 10);
  const oneYearRows = rows.filter((row) => row.date >= cutoffDay);
  const highRow = oneYearRows.reduce((highest, row) => (!highest || row.value > highest.value ? row : highest), null);
  if (!highRow) throw new Error('FRED NASDAQ100 one-year history is empty');
  return {
    provider: 'fred',
    code: 'NDX',
    name: '纳斯达克100（NDX）',
    price: latest.value,
    pct: round2(((latest.value / previous.value) - 1) * 100),
    priceDay: latest.date,
    high1y: highRow.value,
    high1yDay: highRow.date,
    drawdownPct: round2(Math.max(0, ((highRow.value - latest.value) / highRow.value) * 100)),
  };
};

const getNasdaq100DailySnapshot = async (token, options = {}) => {
  if (!String(token || '').trim()) throw new Error('FRED_API_KEY is missing');
  const now = options.now || new Date();
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - 400);
  const params = new URLSearchParams({
    series_id: 'NASDAQ100',
    api_key: String(token).trim(),
    file_type: 'json',
    observation_start: start.toISOString().slice(0, 10),
    sort_order: 'asc',
  });
  const payload = await fetchJsonWithRetry(`https://api.stlouisfed.org/fred/series/observations?${params}`, {
    ...options,
    provider: 'FRED NASDAQ100 daily history',
    headers: { Accept: 'application/json' },
  });
  return parseFredNasdaq100(payload, now);
};

module.exports = {
  getNasdaq100DailySnapshot,
  parseFredNasdaq100,
};
