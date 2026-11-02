// api/news.js
//
// A tiny Vercel serverless function. Deployed alongside the Mini App's
// static files, it reads the "app:news" key from Upstash *server-side*
// (the Upstash token lives only in Vercel's environment variables,
// never in the browser) and returns it as plain JSON.
//
// The Mini App's frontend calls GET /api/news — nothing more.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    res.status(500).json({ error: 'Server not configured: missing UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN' });
    return;
  }

  try {
    const upstashRes = await fetch(`${url}/GET/app:news`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!upstashRes.ok) {
      res.status(502).json({ error: 'Upstash request failed', status: upstashRes.status });
      return;
    }
    const data = await upstashRes.json();
    const items = data.result ? JSON.parse(data.result) : [];
    res.status(200).json({ items, fetchedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: 'Unexpected error', message: String(err) });
  }
}
