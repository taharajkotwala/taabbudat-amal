import { Redis } from '@upstash/redis';

// Automatically reads KV_REST_API_URL & KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL)
const redis = Redis.fromEnv();

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  try {
    if (req.method === 'GET') {
      const { path, prefix } = req.query;

      // Fetch a single document (e.g. ?path=system/config)
      if (path) {
        const data = await redis.get(`ta:${path}`);
        return res.status(200).json({ exists: data !== null, data });
      }

      // Fetch a collection by prefix (e.g. ?prefix=progress)
      if (prefix) {
        const keys = await redis.keys(`ta:${prefix}/*`);
        if (!keys.length) return res.status(200).json({ docs: [] });

        const values = await redis.mget(...keys);
        const docs = keys.map((k, i) => ({
          id: k.slice(`ta:${prefix}/`.length),
          data: values[i]
        })).filter(d => d.data !== null);

        return res.status(200).json({ docs });
      }

      return res.status(400).json({ error: 'Missing path or prefix' });
    }

    if (req.method === 'POST') {
      const { path, data } = req.body || {};
      if (!path || typeof path !== 'string') {
        return res.status(400).json({ error: 'Invalid document path' });
      }
      // Basic path allowlist for safety
      if (!/^(system\/(config|roster)|progress\/[a-f0-9]{20})$/.test(path)) {
        return res.status(403).json({ error: 'Forbidden path' });
      }

      await redis.set(`ta:${path}`, data);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Vercel DB Error:', err);
    return res.status(500).json({ error: err.message || 'Database error' });
  }
}