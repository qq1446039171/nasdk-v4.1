const { getCompletedMonthlyAdjustedCloses: getEastmoneyMonthlyRows } = require('./qqq-monthly');
const { getCompletedMonthlyAdjustedCloses: getTiingoMonthlyRows } = require('./tiingo');
const { getNasdaq100DailySnapshot: getFredNasdaq100 } = require('./fred');
const { getLatestPrice, getOneYearHigh, getLatestKlineClose } = require('./eastmoney');

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

/**
 * FRED 的 NASDAQ100 日度序列有 T+1~T+2 延迟（周五的数据要等到下周一晚间才入库），
 * 而推送在北京时间白天发出，此时 FRED 必然落后一个交易日。
 * 这里用东财日 K 的收盘价补齐 FRED 缺失的最后交易日；一年高点仍沿用 FRED（收盘价口径），
 * 保证回撤的分子分母口径一致。东财失败时静默沿用 FRED 原值，不写入 warnings，
 * 避免污染推送里的「数据状态」文案。
 */
const fillLatestCloseFromEastmoney = async (snapshot, fetchKline) => {
  try {
    const latest = await fetchKline(NDX_SECID);
    const day = String(latest && latest.day || '');
    const price = Number(latest && latest.price);
    const high1y = Number(snapshot && snapshot.high1y);
    if (!day || !Number.isFinite(price) || price <= 0) return snapshot;
    if (!Number.isFinite(high1y) || high1y <= 0) return snapshot;
    if (!snapshot.priceDay || day <= snapshot.priceDay) return snapshot;
    return {
      ...snapshot,
      price,
      priceDay: day,
      pct: Number.isFinite(Number(latest.pct)) ? latest.pct : snapshot.pct,
      drawdownPct: round2(Math.max(0, ((high1y - price) / high1y) * 100)),
    };
  } catch (error) {
    return snapshot;
  }
};

const getBenchmarkSnapshot = async (cfg, deps = {}) => {
  const fred = deps.getFredSnapshot || getFredNasdaq100;
  const eastmoneyLatest = deps.getEastmoneyLatest || getLatestPrice;
  const eastmoneyHigh = deps.getEastmoneyHigh || getOneYearHigh;
  const eastmoneyKlineClose = deps.getEastmoneyKlineClose || getLatestKlineClose;
  const warnings = [];
  if (cfg && cfg.fredApiKey) {
    try {
      const snapshot = await fred(cfg.fredApiKey);
      return { ...(await fillLatestCloseFromEastmoney(snapshot, eastmoneyKlineClose)), warnings };
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
