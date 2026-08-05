const parseEastmoneyMonthly = (payload, now = new Date()) => {
  const currentMonth = now.toISOString().slice(0, 7);
  const rows = payload?.data?.klines || [];
  return rows.map((line) => {
    const [date, , close] = String(line).split(',');
    return { month: String(date).slice(0, 7), close: Number(close) };
  }).filter((row) => row.month < currentMonth && Number.isFinite(row.close) && row.close > 0)
    .sort((a, b) => a.month.localeCompare(b.month));
};

const getCompletedMonthlyAdjustedCloses = async (symbol = 'QQQ', options = {}) => {
  if (String(symbol).toUpperCase() !== 'QQQ') throw new Error('v4.1 Eastmoney monthly source currently supports QQQ only');
  const fields1 = 'f1,f2,f3,f4,f5,f6';
  const fields2 = 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61';
  const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=105.QQQ&klt=103&fqt=1&lmt=60&end=20500101&fields1=${fields1}&fields2=${fields2}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Eastmoney QQQ monthly history HTTP ${res.status}`);
  const rows = parseEastmoneyMonthly(await res.json(), options.now || new Date());
  if (rows.length < 13) throw new Error(`Eastmoney QQQ monthly history insufficient: ${rows.length}`);
  return rows;
};

module.exports = {
  getCompletedMonthlyAdjustedCloses,
  _parseEastmoneyMonthly: parseEastmoneyMonthly,
};
