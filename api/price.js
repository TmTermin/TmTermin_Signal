// api/price.js
//
// A very lightweight companion to api/candles.js: returns just the
// current price for a pair, nothing else. The Mini App polls this far
// more often (every few seconds) than it re-fetches the full 90-candle
// history (every 60s via api/candles.js), so the on-screen price ticks
// the way MT5's does, without burning the daily request budget on full
// candle re-fetches.
//
// Budget note: Twelve Data's free tier is 800 requests/day, 8/min.
// This project polls /api/price roughly every 8 seconds while a chart
// is actually open — fine for personal/occasional use, but if this
// Mini App ever gets heavy concurrent traffic, raise the poll interval
// in the frontend (search for `pollPriceTick`) or upgrade the plan.

const TD_SYMBOL = {
  XAUUSD: 'XAU/USD',
  EURUSD: 'EUR/USD',
  GBPUSD: 'GBP/USD',
  AUDUSD: 'AUD/USD',
  NZDUSD: 'NZD/USD',
  USDJPY: 'USD/JPY',
  USDCAD: 'USD/CAD',
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3, stale-while-revalidate=5');

  const apiKey = process.env.TWELVEDATA_API_KEY;
  if (!apiKey) { res.status(500).json({ error: 'Server not configured: missing TWELVEDATA_API_KEY' }); return; }

  const pair = String(req.query.pair || '').toUpperCase();
  const symbol = TD_SYMBOL[pair];
  if (!symbol) { res.status(400).json({ error: 'Unknown pair' }); return; }

  try {
    const url = `https://api.twelvedata.com/price?symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`;
    const td = await fetch(url);
    if (!td.ok) { res.status(502).json({ error: 'Twelve Data request failed', status: td.status }); return; }
    const data = await td.json();

    if (data.status === 'error' || data.price == null) {
      res.status(502).json({ error: 'Twelve Data error', message: data.message || 'no price' });
      return;
    }

    res.status(200).json({ price: parseFloat(data.price), fetchedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: 'Unexpected error', message: String(err) });
  }
}
