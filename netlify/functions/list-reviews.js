// netlify/functions/list-reviews.js - Profound Naturals MAIN SITE
// Owner-only review queue, the safety net for the email moderation flow: if a moderation
// email ever fails to send, the review is still reachable here. Protected by a passcode
// (REVIEW_ADMIN_PASSCODE), compared constant-time, behind a strict per-minute rate limit.
// Each returned review carries its signed moderation token, so the queue page can approve /
// reject through the EXISTING moderate-review function - no change needed there.
const crypto = require('crypto');
const { getStore, connectLambda } = require('@netlify/blobs');

// Strict rate limiter to slow passcode brute-force (in-memory; resets on cold start).
const rateMap = {};
const RATE_LIMIT = 8;
const RATE_WINDOW_MS = 60 * 1000; // 1 minute
function isRateLimited(ip) {
  const now = Date.now();
  if (!rateMap[ip] || now - rateMap[ip].start > RATE_WINDOW_MS) {
    rateMap[ip] = { count: 1, start: now };
    return false;
  }
  rateMap[ip].count++;
  return rateMap[ip].count > RATE_LIMIT;
}

// Constant-time compare that also hides length differences (hash both, compare digests).
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function sign(id) {
  return crypto
    .createHmac('sha256', process.env.REVIEW_MODERATION_SECRET || '')
    .update(id)
    .digest('hex');
}

const json = (code, obj) => ({
  statusCode: code,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(obj),
});

exports.handler = async (event) => {
  connectLambda(event);

  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });

  const ip = event.headers['x-forwarded-for']?.split(',')[0].trim() || 'unknown';
  if (isRateLimited(ip)) return json(429, { error: 'Too many attempts. Wait a minute.' });

  if (!process.env.REVIEW_ADMIN_PASSCODE || !process.env.REVIEW_MODERATION_SECRET) {
    console.error('REVIEW_ADMIN_PASSCODE or REVIEW_MODERATION_SECRET is not set');
    return json(500, { error: 'Not configured' });
  }

  let passcode, status;
  try {
    ({ passcode, status } = JSON.parse(event.body));
  } catch {
    return json(400, { error: 'Invalid request' });
  }

  if (!passcode || typeof passcode !== 'string' || !safeEqual(passcode, process.env.REVIEW_ADMIN_PASSCODE)) {
    return json(401, { error: 'Not authorised' });
  }

  const wanted = ['pending', 'published', 'rejected', 'all'].includes(status) ? status : 'pending';

  try {
    const store = getStore('reviews');
    const { blobs = [] } = await store.list();

    const all = [];
    for (const b of blobs) {
      let rev;
      try {
        rev = await store.get(b.key, { type: 'json' });
      } catch {
        continue;
      }
      if (rev) all.push(rev);
    }

    const counts = { pending: 0, published: 0, rejected: 0 };
    all.forEach((r) => {
      if (counts[r.status] !== undefined) counts[r.status]++;
    });

    const reviews = all
      .filter((r) => wanted === 'all' || r.status === wanted)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map((r) => Object.assign({}, r, { token: sign(r.id) }));

    return json(200, { reviews, status: wanted, counts });
  } catch (err) {
    console.error('list-reviews failed:', err);
    return json(500, { error: 'Lookup failed' });
  }
};
