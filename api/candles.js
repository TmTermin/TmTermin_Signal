// api/candles.js
//
// Returns real OHLC candles for a pair+timeframe, fetched server-side
// from Finnhub (the same provider the bot uses). The Finnhub token
// stays in Vercel's environment variables — the Mini App only ever
// calls GET /api/candles?pair=XAUUSD&tf=1H.

const FINNHUB_SYMBOL = {
  XAUUSD: 'OANDA:XAU_USD',
  EURUSD: 'OANDA:EUR_USD',
  GBPUSD: 'OANDA:GBP_USD',
  AUDUSD: 'OANDA:AUD_USD',
  NZDUSD: 'OANDA:NZD_USD',
  USDJPY: 'OANDA:USD_JPY',
  USDCAD: 'OANDA:USD_CAD',
};

// Finnhub "resolution" values: 1, 5, 15, 30, 60, D, W, M
const TF_TO_RESOLUTION = {
  '1m': '1', '5m': '5', '15m': '15', '30m': '30',
  '1H': '60', '4H': '60', '1D': 'D',
};
// How many raw bars back to request, and how many of those to merge
// into one candle (only '4H' needs merging — Finnhub has no native 4h).
const TF_LOOKBACK_SECONDS = {
  '1m': 90 * 60, '5m': 90 * 5 * 60, '15m': 90 * 15 * 60, '30m': 90 * 30 * 60,
  '1H': 90 * 3600, '4H': 90 * 4 * 3600, '1D': 120 * 86400,
};
const TF_MERGE = { '4H': 4 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=45, stale-while-revalidate=90');

  const token = process.env.FINNHUB_API_KEY;
  if (!token) { res.status(500).json({ error: 'Server not configured: missing FINNHUB_API_KEY' }); return; }

  const pair = String(req.query.pair || '').toUpperCase();
  const tf = String(req.query.tf || '1H');
  const symbol = FINNHUB_SYMBOL[pair];
  const resolution = TF_TO_RESOLUTION[tf];
  if (!symbol || !resolution) { res.status(400).json({ error: 'Unknown pair or timeframe' }); return; }

  const to = Math.floor(Date.now() / 1000);
  const from = to - (TF_LOOKBACK_SECONDS[tf] || 90 * 3600);

  try {
    const url = `https://finnhub.io/api/v1/forex/candle?symbol=${encodeURIComponent(symbol)}&resolution=${resolution}&from=${from}&to=${to}&token=${token}`;
    const fh = await fetch(url);
    if (!fh.ok) { res.status(502).json({ error: 'Finnhub request failed', status: fh.status }); return; }
    const data = await fh.json();
    if (data.s !== 'ok' || !Array.isArray(data.c) || data.c.length === 0) {
      res.status(200).json({ candles: [], note: 'no data from provider yet' });
      return;
    }

    let candles = data.t.map((t, i) => ({ time: t, open: data.o[i], high: data.h[i], low: data.l[i], close: data.c[i] }));

    const mergeN = TF_MERGE[tf];
    if (mergeN) {
      const merged = [];
      for (let i = 0; i < candles.length; i += mergeN) {
        const chunk = candles.slice(i, i + mergeN);
        if (chunk.length === 0) continue;
        merged.push({
          time: chunk[0].time,
          open: chunk[0].open,
          close: chunk[chunk.length - 1].close,
          high: Math.max(...chunk.map(c => c.high)),
          low: Math.min(...chunk.map(c => c.low)),
        });
      }
      candles = merged;
    }

    candles = candles.slice(-90); // keep it to what the chart actually needs
    res.status(200).json({ candles, fetchedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: 'Unexpected error', message: String(err) });
  }
}
