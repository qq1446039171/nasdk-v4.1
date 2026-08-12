const { getCompletedMonthlyAdjustedCloses: getEastmoneyMonthlyRows } = require('./qqq-monthly');
const { getCompletedMonthlyAdjustedCloses: getTiingoMonthlyRows } = require('./tiingo');
const { getNasdaq100DailySnapshot: getFredNasdaq100 } = require('./fred');
const { getLatestPrice, getOneYearHigh } = require('./eastmoney');

const NDX_SECID = '100.NDX100';
const round2 = (value) => Math.round(Number(value) * 100) / 100;

const getSignalRows = async (cfg, deps = {}) => {
  const symbol = cfg && cfg.strategyV41 && cfg.strategyV41.signalSymbol || 'QQQ';
  const tiingo = deps.getTiingoRows || getTiingoMonthlyRows;
  const eastmoney = deps.getEastmoneyRows || getEastmoneyMonthlyRows;
  const warnings = [];
  if (cfg && cfg.tiingoApiToken) {
    try {
      return { rows: await tiingo(symbol, cfg.tiingoApiToken), provider: 'tiingo-adjusted', warnings };
    } catch (error) {
      warnings.push(`Tiingo: ${error && error.message || String(error)}`);
    }
  }
  try {
    return { rows: await eastmoney(symbol), provider: 'eastmoney-adjusted', warnings };
  } catch (error) {
    warnings.push(`Eastmoney: ${error && error.message || String(error)}`);
  }
  throw new Error(`QQQ monthly data unavailable (${warnings.join('; ')})`);
};

const getBenchmarkSnapshot = async (cfg, deps = {}) => {
  const fred = deps.getFredSnapshot || getFredNasdaq100;
  const eastmoneyLatest = deps.getEastmoneyLatest || getLatestPrice;
  const eastmoneyHigh = deps.getEastmoneyHigh || getOneYearHigh;
  const warnings = [];
  if (cfg && cfg.fredApiKey) {
    try {
      return { ...(await fred(cfg.fredApiKey)), warnings };
    } catch (error) {
      warnings.push(`FRED: ${error && error.message || String(error)}`);
    }
  }
  try {
    const [latest, high] = await Promise.all([eastmoneyLatest(NDX_SECID), eastmoneyHigh(NDX_SECID)]);
    return {
      provider: 'eastmoney',
      code: 'NDX',
      name: latest.name || '纳斯达克100（NDX）',
      price: latest.price,
      pct: latest.pct,
      high1y: high.maxHigh,
      high1yDay: high.maxDay,
      drawdownPct: round2(Math.max(0, ((Number(high.maxHigh) - Number(latest.price)) / Number(high.maxHigh)) * 100)),
      warnings,
    };
  } catch (error) {
    warnings.push(`Eastmoney: ${error && error.message || String(error)}`);
  }
  throw new Error(`NDX daily data unavailable (${warnings.join('; ')})`);
};

module.exports = {
  NDX_SECID,
  getSignalRows,
  getBenchmarkSnapshot,
};
