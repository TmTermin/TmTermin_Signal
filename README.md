# XAUUSD Signals — Mini App (frontend + API)

This is the static Mini App (`public/index.html`) plus a tiny serverless
API (`api/news.js`) that safely reads data the bot (see the separate
`news-signal-bot` project) writes into Upstash.

## Why a separate API instead of calling Upstash directly?

Calling Upstash from the browser would mean putting your Upstash token
inside the page's own JavaScript — anyone could open dev tools, read it,
and write to your database. `api/news.js` runs on Vercel's server, keeps
the token in an environment variable, and only ever hands the browser
plain news data.

## Data flow

```
news-signal-bot (GitHub Actions)
        │ writes
        ▼
   Upstash Redis  "app:news" key
        │ read (server-side, token hidden)
        ▼
   api/news.js  (this project, on Vercel)
        │ GET /api/news → JSON
        ▼
   public/index.html  (the Mini App itself)
```

## Deploying

1. Push this folder to its own GitHub repo (or a `mini-app/` folder in
   a monorepo — either works with Vercel).
2. On [vercel.com](https://vercel.com), **New Project** → import the repo.
3. In **Settings → Environment Variables**, add:
   - `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` — same credentials the bot uses, for `/api/news`
   - `FINNHUB_API_KEY` — same key the bot uses, for `/api/candles` (real OHLC price data)
4. Deploy. Vercel serves `public/index.html` at your project's root URL
   and `api/news.js` at `/api/news` automatically — no extra config
   needed.
5. Open the deployed URL — the News tab's badge should switch from
   "🟡 Demo data" to "🟢 Live data" once the bot has published at least
   one item (run its GitHub Action once manually to seed it).

## Real price data

`api/candles.js` fetches real OHLC candles straight from Finnhub, server-side
(`GET /api/candles?pair=XAUUSD&tf=1H`). The Mini App calls it whenever the
pair or timeframe changes, and every 60 seconds for whichever is currently
open. While waiting for the first response — and if the request ever fails —
the chart keeps showing its built-in demo candles, with a "🟡 Demo data"
label next to the price; once real candles load, the label switches to
"🟢 Live data" and the chart redraws with them. Live timeframe/pair
combinations are tracked in `liveCandleKeys` so the synthetic per-tick
jitter used to animate demo charts never runs on real data.

## Current limitation: live content is English-only

The bot (`lib/appData.js` in `news-signal-bot`) writes its `reason`
text in plain English. The Mini App's own interface (buttons, labels,
section titles) is fully localized in EN/RU/ZH, but this bot-sourced
text will display in English regardless of the language picked, until
a translation step is added — for example, calling the Claude API with
your own API key to translate each item into RU/ZH when it's published.
Ask if you'd like this added.
