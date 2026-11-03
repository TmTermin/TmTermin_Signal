// api/candles.js
//
// Returns real OHLC candles for a pair+timeframe, fetched server-side
// from Yahoo Finance's public chart endpoint. No API key needed — and
// no key means nothing to keep secret here, but this still runs as a
// server-side function (rather than being called straight from the
// browser) to control caching and keep the pair/timeframe mapping in
// one place.
//
// NOTE: Finnhub's /forex/candle is a premium-only endpoint on their
// free tier (confirmed: it returns 403 without a paid plan), so this
// project does not use Finnhub for price data at all — only for the
// bot's forex quote in followup.js, which free Finnhub does support.

const YAHOO_SYMBOL = {
  XAUUSD: 'XAU=X',
  EURUSD: 'EURUSD=X',
  GBPUSD: 'GBPUSD=X',
  AUDUSD: 'AUDUSD=X',
  NZDUSD: 'NZDUSD=X',
  USDJPY: 'USDJPY=X',
  USDCAD: 'USDCAD=X',
};

// Yahoo's own interval codes, and a safe `range` for each that Yahoo
// will actually serve at that interval.
const TF_TO_YAHOO = {
  '1m': { interval: '1m', range: '5d' },
  '5m': { interval: '5m', range: '5d' },
  '15m': { interval: '15m', range: '1mo' },
  '30m': { interval: '30m', range: '1mo' },
  '1H': { interval: '60m', range: '2mo' },
  '4H': { interval: '60m', range: '2mo' }, // merged 4:1 below — Yahoo has no native 4h
  '1D': { interval: '1d', range: '1y' },
};
const TF_MERGE = { '4H': 4 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=45, stale-while-revalidate=90');

  const pair = String(req.query.pair || '').toUpperCase();
  const tf = String(req.query.tf || '1H');
  const symbol = YAHOO_SYMBOL[pair];
  const cfg = TF_TO_YAHOO[tf];
  if (!symbol || !cfg) { res.status(400).json({ error: 'Unknown pair or timeframe' }); return; }

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${cfg.interval}&range=${cfg.range}`;
    const yf = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TmTerminSignal/1.0)' },
    });
    if (!yf.ok) { res.status(502).json({ error: 'Yahoo Finance request failed', status: yf.status }); return; }
    const data = await yf.json();

    const result = data?.chart?.result?.[0];
    const timestamps = result?.timestamp;
    const quote = result?.indicators?.quote?.[0];
    if (!result || !timestamps || !quote) {
      res.status(200).json({ candles: [], note: 'no data from provider yet' });
      return;
    }

    let candles = timestamps
      .map((t, i) => ({
        time: t,
        open: quote.open[i],
        high: quote.high[i],
        low: quote.low[i],
        close: quote.close[i],
      }))
      // Yahoo pads gaps (holidays, no trading) with nulls — drop those
      .filter((c) => c.open != null && c.high != null && c.low != null && c.close != null);

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
          high: Math.max(...chunk.map((c) => c.high)),
          low: Math.min(...chunk.map((c) => c.low)),
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
