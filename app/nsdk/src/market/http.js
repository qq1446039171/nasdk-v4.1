const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const fetchJsonWithRetry = async (url, options = {}) => {
  const request = options.fetch || global.fetch;
  if (typeof request !== 'function') throw new Error('Node 18+ fetch is required');
  const sleep = options.sleep || wait;
  const maxAttempts = Math.max(1, Number(options.maxAttempts) || 3);
  const retryDelayMs = Math.max(0, Number(options.retryDelayMs) || 800);
  const provider = options.provider || 'market data';
  const requestOptions = {
    method: options.method || 'GET',
    headers: options.headers || { Accept: 'application/json' },
    body: options.body,
  };
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await request(url, requestOptions);
      if (response.ok) return response.json();
      const status = Number(response.status) || 0;
      lastError = new Error(`${provider} HTTP ${status}`);
      if (status >= 400 && status < 500 && status !== 429) throw lastError;
    } catch (error) {
      lastError = error;
    }
    if (attempt < maxAttempts) await sleep(retryDelayMs * attempt);
  }
  throw lastError || new Error(`${provider} request failed`);
};

module.exports = { fetchJsonWithRetry };
