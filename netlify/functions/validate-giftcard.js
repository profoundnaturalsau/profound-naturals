const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ── RATE LIMITER — hard limit, brute-force protection ──
// Gift card codes are PN-XXXX-XXXX — limited combinations, must be locked down
const rateMap = {};
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60 * 1000; // 1 minute (much stricter than other functions)

function isRateLimited(ip) {
  const now = Date.now();
  if (!rateMap[ip] || now - rateMap[ip].start > RATE_WINDOW_MS) {
    rateMap[ip] = { count: 1, start: now };
    return false;
  }
  rateMap[ip].count++;
  return rateMap[ip].count > RATE_LIMIT;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Rate limit by IP — 5 attempts per minute max
  const ip = event.headers['x-forwarded-for']?.split(',')[0].trim() || 'unknown';
  if (isRateLimited(ip)) {
    return { statusCode: 429, body: JSON.stringify({ valid: false, error: 'Too many attempts — please wait before trying again' }) };
  }

  let code;
  try {
    ({ code } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ valid: false, error: 'Invalid request' }) };
  }

  // Validate code format before hitting Stripe
  if (!code || typeof code !== 'string' || !/^PN-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(code.trim())) {
    return {
      statusCode: 200,
      body: JSON.stringify({ valid: false, error: 'Invalid gift card code' }),
    };
  }

  try {
    const coupon = await stripe.coupons.retrieve(code.trim().toUpperCase());

    // Must be a Profound Naturals gift card
    if (coupon.metadata?.type !== 'gift_card') {
      return {
        statusCode: 200,
        body: JSON.stringify({ valid: false, error: 'Invalid gift card code' }),
      };
    }

    // Must not already be redeemed
    if (coupon.times_redeemed >= coupon.max_redemptions) {
      return {
        statusCode: 200,
        body: JSON.stringify({ valid: false, error: 'This gift card has already been used' }),
      };
    }

    // Must still be valid
    if (!coupon.valid) {
      return {
        statusCode: 200,
        body: JSON.stringify({ valid: false, error: 'This gift card is no longer valid' }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        valid: true,
        amount_off: coupon.amount_off,
        currency: coupon.currency,
      }),
    };

  } catch (err) {
    if (err.code === 'resource_missing') {
      return {
        statusCode: 200,
        body: JSON.stringify({ valid: false, error: 'Gift card code not found' }),
      };
    }
    console.error('Gift card validation error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ valid: false, error: 'Unable to validate code — please try again' }),
    };
  }
};
