// api/candles.js
//
// Returns real OHLC candles for a pair+timeframe, fetched server-side
// from Twelve Data (https://twelvedata.com) — a proper, official REST
// API built for server-side use, free tier: 800 requests/day, 8/min,
// no credit card. This replaced two earlier attempts that both hit
// dead ends:
//   1. Finnhub's /forex/candle — confirmed premium-only, returns 403
//      on the free plan.
//   2. Yahoo Finance's unofficial chart endpoint — works from a
//      browser, but Yahoo silently blocks many cloud/datacenter IP
//      ranges (including Vercel's), so it 404'd from here.
//
// Free account + key: https://twelvedata.com/register

const TD_SYMBOL = {
  XAUUSD: 'XAU/USD',
  EURUSD: 'EUR/USD',
  GBPUSD: 'GBP/USD',
  AUDUSD: 'AUD/USD',
  NZDUSD: 'NZD/USD',
  USDJPY: 'USD/JPY',
  USDCAD: 'USD/CAD',
};

// Twelve Data's own interval strings — note it supports 4h natively,
// so (unlike the Finnhub/Yahoo attempts) no manual bar-merging is needed.
const TF_TO_INTERVAL = {
  '1m': '1min', '5m': '5min', '15m': '15min', '30m': '30min',
  '1H': '1h', '4H': '4h', '1D': '1day',
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=45, stale-while-revalidate=90');

  const apiKey = process.env.TWELVEDATA_API_KEY;
  if (!apiKey) { res.status(500).json({ error: 'Server not configured: missing TWELVEDATA_API_KEY' }); return; }

  const pair = String(req.query.pair || '').toUpperCase();
  const tf = String(req.query.tf || '1H');
  const symbol = TD_SYMBOL[pair];
  const interval = TF_TO_INTERVAL[tf];
  if (!symbol || !interval) { res.status(400).json({ error: 'Unknown pair or timeframe' }); return; }

  try {
    const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=${interval}&outputsize=90&apikey=${apiKey}`;
    const td = await fetch(url);
    if (!td.ok) { res.status(502).json({ error: 'Twelve Data request failed', status: td.status }); return; }
    const data = await td.json();

    if (data.status === 'error') {
      res.status(502).json({ error: 'Twelve Data error', message: data.message || 'unknown' });
      return;
    }
    if (!Array.isArray(data.values) || data.values.length === 0) {
      res.status(200).json({ candles: [], note: 'no data from provider yet' });
      return;
    }

    // Twelve Data returns newest-first; the chart wants oldest-first.
    const candles = data.values
      .slice()
      .reverse()
      .map((v) => ({
        time: v.datetime,
        open: parseFloat(v.open),
        high: parseFloat(v.high),
        low: parseFloat(v.low),
        close: parseFloat(v.close),
      }))
      .filter((c) => !isNaN(c.open) && !isNaN(c.high) && !isNaN(c.low) && !isNaN(c.close));

    res.status(200).json({ candles, fetchedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: 'Unexpected error', message: String(err) });
  }
}
