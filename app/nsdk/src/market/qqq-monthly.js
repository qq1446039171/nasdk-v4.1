const parseEastmoneyMonthly = (payload, now = new Date()) => {
  const currentMonth = now.toISOString().slice(0, 7);
  const rows = payload?.data?.klines || [];
  return rows.map((line) => {
    const [date, , close] = String(line).split(',');
    return { month: String(date).slice(0, 7), close: Number(close) };
  }).filter((row) => row.month < currentMonth && Number.isFinite(row.close) && row.close > 0)
    .sort((a, b) => a.month.localeCompare(b.month));
};

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const fetchWithRetry = async (url, options = {}) => {
  const request = options.fetch || fetch;
  const sleep = options.sleep || wait;
  const maxAttempts = Math.max(1, Number(options.maxAttempts) || 3);
  const retryDelayMs = Math.max(0, Number(options.retryDelayMs) || 1000);
  const requestOptions = {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
  };
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let res = null;
    try {
      res = await request(url, requestOptions);
    } catch (error) {
      lastError = error;
    }
    if (res) {
      if (res.ok) return res;
      const status = Number(res.status) || 0;
      lastError = new Error(`Eastmoney QQQ monthly history HTTP ${status}`);
      // 4xx（429 除外）是请求本身的问题，重试也不会改变结果。
      if (status >= 400 && status < 500 && status !== 429) throw lastError;
    }
    if (attempt < maxAttempts) await sleep(retryDelayMs * attempt);
  }

  throw lastError || new Error('Eastmoney QQQ monthly history request failed');
};

const getCompletedMonthlyAdjustedCloses = async (symbol = 'QQQ', options = {}) => {
  if (String(symbol).toUpperCase() !== 'QQQ') throw new Error('v4.1 Eastmoney monthly source currently supports QQQ only');
  const fields1 = 'f1,f2,f3,f4,f5,f6';
  const fields2 = 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61';
  const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=105.QQQ&klt=103&fqt=1&lmt=60&end=20500101&fields1=${fields1}&fields2=${fields2}`;
  const res = await fetchWithRetry(url, options);
  const rows = parseEastmoneyMonthly(await res.json(), options.now || new Date());
  if (rows.length < 13) throw new Error(`Eastmoney QQQ monthly history insufficient: ${rows.length}`);
  return rows;
};

module.exports = {
  getCompletedMonthlyAdjustedCloses,
  _parseEastmoneyMonthly: parseEastmoneyMonthly,
};
