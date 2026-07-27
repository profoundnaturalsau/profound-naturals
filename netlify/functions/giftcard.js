const crypto = require('crypto');
const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ── RATE LIMITER ──
const rateMap = {};
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function isRateLimited(ip) {
  const now = Date.now();
  if (!rateMap[ip] || now - rateMap[ip].start > RATE_WINDOW_MS) {
    rateMap[ip] = { count: 1, start: now };
    return false;
  }
  rateMap[ip].count++;
  return rateMap[ip].count > RATE_LIMIT;
}

// ── GENERATE READABLE GIFT CARD CODE ──
// Format: PN-XXXX-XXXX (no O,0,I,1 to avoid confusion)
// crypto.randomInt, NOT Math.random: V8's Math.random state can be recovered
// from observed outputs, and every legitimately bought gift card hands its
// buyer 8 consecutive outputs. Coupons are minted at session creation (before
// payment), so a predictable generator would let someone derive live codes.
// crypto.randomInt makes every code independently unguessable.
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'PN-';
  for (let i = 0; i < 4; i++) code += chars[crypto.randomInt(chars.length)];
  code += '-';
  for (let i = 0; i < 4; i++) code += chars[crypto.randomInt(chars.length)];
  return code;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Rate limit by IP
  const ip = event.headers['x-forwarded-for']?.split(',')[0].trim() || 'unknown';
  if (isRateLimited(ip)) {
    return { statusCode: 429, body: JSON.stringify({ error: 'Too many requests' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  // ── ACTION: CREATE CHECKOUT SESSION ──
  // Note: email sending has moved to stripe-webhook.js (checkout.session.completed)
  // action:'send' has been removed — emails are now triggered by Stripe payment confirmation only

  const { amount, recipientEmail, recipientName, senderName, message } = body;

  if (!amount || amount < 2500) {
    return { statusCode: 400, body: 'Minimum gift card value is $25' };
  }
  // Amount ceiling — max $1000
  if (amount > 100000) {
    return { statusCode: 400, body: 'Maximum gift card value is $1000' };
  }
  if (!recipientEmail || typeof recipientEmail !== 'string' || !recipientEmail.includes('@') || recipientEmail.length > 254) {
    return { statusCode: 400, body: 'Invalid recipient email' };
  }
  if (!recipientName || typeof recipientName !== 'string' || recipientName.length > 100) {
    return { statusCode: 400, body: 'Invalid recipient name' };
  }
  if (!senderName || typeof senderName !== 'string' || senderName.length > 100) {
    return { statusCode: 400, body: 'Invalid sender name' };
  }
  if (message && (typeof message !== 'string' || message.length > 500)) {
    return { statusCode: 400, body: 'Message too long' };
  }

  try {
    // 1. Create Stripe coupon for the gift card amount
    const code = generateCode();
    const coupon = await stripe.coupons.create({
      id: code,
      amount_off: amount,
      currency: 'aud',
      duration: 'once',
      max_redemptions: 1,
      name: `Profound Naturals Gift Card`,
      metadata: {
        type: 'gift_card',
        recipient_email: recipientEmail,
        recipient_name: recipientName,
        sender_name: senderName,
        amount_cents: String(amount),
      },
    });

    // 2. Create Stripe Checkout session
    // All gift card data stored in session metadata so the webhook can read it
    const dollarAmount = (amount / 100).toFixed(2);
    const baseUrl = process.env.URL || 'https://profoundnaturals.com.au';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'aud',
          unit_amount: amount,
          product_data: {
            name: `Profound Naturals Gift Card — $${dollarAmount}`,
            description: `For ${recipientName} · From ${senderName}`,
            images: [],
          },
        },
        quantity: 1,
      }],
      success_url: `${baseUrl}/?gc_success=1`,
      cancel_url:  `${baseUrl}/?gc_cancelled=1`,
      customer_email: recipientEmail,
      metadata: {
        type:             'gift_card',
        coupon_code:      coupon.id,
        recipient_email:  recipientEmail,
        recipient_name:   recipientName,
        sender_name:      senderName,
        message:          message || '',
        amount_cents:     String(amount),
      },
      payment_intent_data: {
        metadata: {
          type:        'gift_card',
          coupon_code: coupon.id,
        },
      },
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ url: session.url }),
    };

  } catch (err) {
    console.error('Stripe gift card error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Unable to process request' }),
    };
  }
};
