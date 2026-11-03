// api/price.js
//
// Lightweight companion to api/candles.js: returns just the current
// price for a pair. Also uses lib/twelvedata.js's automatic key
// failover (TWELVEDATA_API_KEY -> TWELVEDATA_API_KEY_2).
//
// Budget note: Twelve Data's free tier is 800 requests/day per key
// (so up to 1,600/day total with two keys), 8/min per key. The Mini
// App polls this roughly every 8s while a chart is open and the tab
// is visible — see `pollPriceTick` in the frontend.

import { fetchTwelveData } from '../lib/twelvedata.js';

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

  const pair = String(req.query.pair || '').toUpperCase();
  const symbol = TD_SYMBOL[pair];
  if (!symbol) { res.status(400).json({ error: 'Unknown pair' }); return; }

  try {
    const { ok, status, data } = await fetchTwelveData('price', { symbol });

    if (!ok) {
      res.status(status === 429 ? 429 : 502).json({ error: 'Twelve Data request failed', status, message: data?.message });
      return;
    }
    if (data.status === 'error' || data.price == null) {
      res.status(502).json({ error: 'Twelve Data error', message: data.message || 'no price' });
      return;
    }

    res.status(200).json({ price: parseFloat(data.price), fetchedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: 'Unexpected error', message: String(err) });
  }
}
