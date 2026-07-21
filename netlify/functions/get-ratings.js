// netlify/functions/get-ratings.js - Profound Naturals MAIN SITE
// PUBLIC, read-only. Returns:
//   ratings: { productId: { avg, count } }  -> populates the productRatings object
//   reviews: [ public review objects ]      -> per-product review lists + homepage features
// Never exposes the reviewer's email. Only PUBLISHED reviews are included.
// Note: at low volume this lists + reads each blob per call, softened by a 60s cache header.
// If volume grows, swap to a maintained aggregate blob updated at moderation time.
const { getStore, connectLambda } = require('@netlify/blobs');

function displayName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'Anonymous';
  if (parts.length === 1) return parts[0];
  return parts[0] + ' ' + parts[parts.length - 1][0].toUpperCase() + '.';
}

exports.handler = async (event) => {
  // Wire the Lambda event into Netlify Blobs before getStore() (classic handler format).
  connectLambda(event);

  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=60',
  };

  try {
    const store = getStore('reviews');
    const { blobs = [] } = await store.list();

    const agg = {};      // productId -> { sum, count }
    const reviews = [];

    for (const b of blobs) {
      let rev;
      try {
        rev = await store.get(b.key, { type: 'json' });
      } catch {
        continue;
      }
      if (!rev || rev.status !== 'published') continue;

      const pid = rev.productId;
      if (!agg[pid]) agg[pid] = { sum: 0, count: 0 };
      agg[pid].sum += rev.rating;
      agg[pid].count += 1;

      reviews.push({
        id: rev.id,
        productId: pid,
        productName: rev.productName,
        rating: rev.rating,
        name: displayName(rev.name),
        text: rev.text || '',
        featured: !!rev.featured,
        createdAt: rev.createdAt,
      });
    }

    const ratings = {};
    for (const pid in agg) {
      ratings[pid] = {
        avg: Math.round((agg[pid].sum / agg[pid].count) * 10) / 10,
        count: agg[pid].count,
      };
    }

    reviews.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)); // newest first

    return { statusCode: 200, headers, body: JSON.stringify({ ratings, reviews }) };
  } catch (err) {
    console.error('get-ratings failed:', err);
    // Fail soft: empty payload so the site simply shows "Be First to Review".
    return { statusCode: 200, headers, body: JSON.stringify({ ratings: {}, reviews: [] }) };
  }
};
