// netlify/functions/moderate-review.js - Profound Naturals MAIN SITE
// GET  = peek: returns the review so the moderation page can display it. No state change.
// POST = act: approve / approve_feature / feature / unfeature / reject. Changes state.
// Both require a valid HMAC token, so only links from the owner's email work. Email
// scanners that pre-fetch the GET link can only READ - they cannot change state, because
// that requires a POST from a button press on the moderation page.
const crypto = require('crypto');
const { getStore, connectLambda } = require('@netlify/blobs');

function sign(id) {
  return crypto
    .createHmac('sha256', process.env.REVIEW_MODERATION_SECRET || '')
    .update(id)
    .digest('hex');
}

function validToken(id, t) {
  if (!id || !t || !process.env.REVIEW_MODERATION_SECRET) return false;
  const expected = sign(id);
  const a = Buffer.from(expected);
  const b = Buffer.from(String(t));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const json = (code, obj) => ({
  statusCode: code,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(obj),
});

exports.handler = async (event) => {
  // Wire the Lambda event into Netlify Blobs before getStore() (classic handler format).
  connectLambda(event);
  const store = getStore('reviews');

  // ── PEEK (display only) ──
  if (event.httpMethod === 'GET') {
    const id = event.queryStringParameters?.id || '';
    const t = event.queryStringParameters?.t || '';
    if (!validToken(id, t)) return json(403, { error: 'Invalid or expired link' });

    let review;
    try {
      review = await store.get(id, { type: 'json' });
    } catch {
      return json(500, { error: 'Lookup failed' });
    }
    if (!review) return json(404, { error: 'Review not found' });
    return json(200, { review });
  }

  // ── ACT (state change) ──
  if (event.httpMethod === 'POST') {
    let id, t, action;
    try {
      ({ id, t, action } = JSON.parse(event.body));
    } catch {
      return json(400, { error: 'Invalid request' });
    }
    if (!validToken(id, t)) return json(403, { error: 'Invalid or expired link' });

    let review;
    try {
      review = await store.get(id, { type: 'json' });
    } catch {
      return json(500, { error: 'Lookup failed' });
    }
    if (!review) return json(404, { error: 'Review not found' });

    switch (action) {
      case 'approve':
        review.status = 'published';
        review.featured = false;
        break;
      case 'approve_feature':
      case 'feature':
        if (!review.text) {
          return json(400, { error: 'Cannot feature a review with no written text' });
        }
        review.status = 'published';
        review.featured = true;
        break;
      case 'unfeature':
        review.featured = false;
        break;
      case 'reject':
        review.status = 'rejected';
        review.featured = false;
        break;
      default:
        return json(400, { error: 'Unknown action' });
    }
    review.moderatedAt = new Date().toISOString();

    try {
      await store.setJSON(id, review);
    } catch {
      return json(500, { error: 'Save failed' });
    }

    return json(200, { success: true, status: review.status, featured: review.featured });
  }

  return json(405, { error: 'Method Not Allowed' });
};
