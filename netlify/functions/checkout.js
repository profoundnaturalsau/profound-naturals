const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const PRODUCTS = require('./products.json');

// Full server-side catalogue: id -> { name, price, category, inStock, variants }
// The browser sends IDs and quantities. Nothing else it sends is used.
const CATALOGUE = {};
PRODUCTS.products.forEach(p => { CATALOGUE[p.id] = p; });

const MAX_QTY_PER_LINE = 99;
const MAX_LINES        = 50;    // Stripe caps checkout sessions at 100 line items
const MAX_ORDER_TOTAL  = 10000; // AUD sanity ceiling before anything reaches Stripe

// ── RATE LIMITER (in-memory; resets on cold start) ──
// Generous for humans (a checkout retry loop never hits 12/hr), tight enough to
// stop a script minting thousands of Stripe sessions under this account.
const rateMap = {};
const RATE_LIMIT = 12;
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
function isRateLimited(ip) {
  const now = Date.now();
  // Bound the map: a scanner cycling spoofed IPs must not grow warm-instance
  // memory without limit. Sweep expired windows first; if still oversized,
  // reset (worst case a few extra requests slip through one window).
  const keys = Object.keys(rateMap);
  if (keys.length > 5000) {
    for (const k of keys) if (now - rateMap[k].start > RATE_WINDOW_MS) delete rateMap[k];
    if (Object.keys(rateMap).length > 5000) for (const k in rateMap) delete rateMap[k];
  }
  if (!rateMap[ip] || now - rateMap[ip].start > RATE_WINDOW_MS) {
    rateMap[ip] = { count: 1, start: now };
    return false;
  }
  rateMap[ip].count++;
  return rateMap[ip].count > RATE_LIMIT;
}

const bad = (msg, code = 400) => ({
  statusCode: code,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ error: msg }),
});

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const ip = (event.headers || {})['x-forwarded-for']?.split(',')[0].trim() || 'unknown';
  if (isRateLimited(ip)) {
    return bad('Too many requests - please wait a moment and try again', 429);
  }

  let items, couponCode;
  try {
    ({ items, couponCode } = JSON.parse(event.body));
  } catch {
    return bad('Invalid request body');
  }

  if (!Array.isArray(items) || items.length === 0) return bad('No items provided');
  if (items.length > MAX_LINES) return bad('Too many items');

  // Resolve everything from the server catalogue. The browser is treated as a
  // source of intent (which product, how many) and never as a source of fact
  // (what it costs, what it is called, whether it can be sold at all).
  const lines = new Map();

  for (const item of items) {
    if (!item || typeof item !== 'object') return bad('Invalid item');

    // ID must be a real integer key, not a prototype key like "constructor".
    const id = Number(item.id);
    if (!Number.isInteger(id)) return bad('Invalid product');
    if (!Object.prototype.hasOwnProperty.call(CATALOGUE, id)) return bad('Invalid product');

    const product = CATALOGUE[id];

    // Existence, not truthiness - a $0.00 product must not read as "not found".
    if (typeof product.price !== 'number' || !isFinite(product.price) || product.price < 0) {
      return bad('Invalid product');
    }

    // Stock is enforced here, not just hidden in the UI.
    if (product.inStock === false) return bad('One or more items are out of stock');

    // Quantity: integer, at least 1, capped. This feeds the free shipping
    // thresholds below, so it cannot be a float or a numeric string.
    const qty = Number(item.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY_PER_LINE) {
      return bad('Invalid quantity');
    }

    // Variant must be one the server actually offers for this exact ID.
    // ids 74 and 75 are size twins and each accepts one size only, so
    // id 74 + "5ml" cannot be sold at the 10ml price.
    let variant = null;
    if (Array.isArray(product.variants) && product.variants.length) {
      if (typeof item.variant !== 'string') return bad('Please choose an option');
      variant = product.variants.find(v => v === item.variant) || null;
      if (!variant) return bad('Please choose an option');
    }

    // Merge duplicate lines rather than letting the browser pad the line count.
    const key = variant ? `${id}::${variant}` : `${id}`;
    const existing = lines.get(key);
    if (existing) {
      existing.qty = Math.min(MAX_QTY_PER_LINE, existing.qty + qty);
    } else {
      lines.set(key, { product, variant, qty });
    }
  }

  const resolved = [...lines.values()];

  // Subtotal from server prices only - this is what decides free shipping.
  const subtotal = resolved.reduce((sum, l) => sum + l.product.price * l.qty, 0);
  if (!isFinite(subtotal) || subtotal <= 0 || subtotal > MAX_ORDER_TOTAL) {
    return bad('Invalid order total');
  }

  /* ── SHIPPING (Aug 2026) ────────────────────────────────────────────
     ONE flat rate. Tiers were removed after modelling real pack sizes:
     nothing in the catalogue is big or heavy enough to need a second one.

     Every order that can still pay shipping is bounded by the $85 free
     threshold, and the worst cases are tiny against an XS satchel
     (215x280mm, 5kg limit, ~1445cm3 usable):
       9 x Sweet Orange  $80.55   205g    422cm3
       9 x Hemp Soap     $81.00  1150g   1215cm3
       4 x Necklaces     $72.00   190g    216cm3
     Heaviest possible paid order uses 23% of the weight allowance, so
     weight is never the binding constraint - the free threshold caps
     order size long before a satchel fills. An item-count tier just
     overcharged customers on orders that still cost $10.55 to send.

     Cost: XS prepaid satchel $10.55, or $10.02 buying 10+ packs of 10.
     Postage AND packaging included, any weight to 5kg, no cubic weight.

     Express was removed entirely: it lost money above the XS satchel, and
     essential oils are Class 3 flammable liquids, which AusPost permits
     only by ROAD under a contract exemption.

     Flat-packed easels will NOT fit this model - they need their own
     shipping class here and a matching Merchant Center shipping label,
     priced on cubic weight (volume/4000), once one exists to measure. */
  const SHIPPING_CENTS = 1095;
  const FREE_THRESHOLD = 85;

  const standardFree = subtotal >= FREE_THRESHOLD;
  const shippingCents = SHIPPING_CENTS;
  const shippingLabel = standardFree
    ? 'Standard Shipping - Free'
    : `Standard Shipping - $${(shippingCents / 100).toFixed(2)}`;

  // Names and descriptions come from the catalogue, so a crafted request cannot
  // rewrite what appears on the Stripe receipt, in the dashboard, or in the
  // order confirmation email the webhook builds out of these line items.
  const lineItems = resolved.map(l => ({
    price_data: {
      currency: 'aud',
      unit_amount: Math.round(l.product.price * 100),
      product_data: {
        name: l.variant ? `${l.product.name} (${l.variant})` : l.product.name,
        description: l.product.category || undefined,
      },
    },
    quantity: l.qty,
  }));

  const baseUrl = process.env.URL || 'https://profoundnaturals.com.au';

  const sessionParams = {
    mode: 'payment',
    line_items: lineItems,
    success_url: `${baseUrl}/?order_success=1`,
    cancel_url: `${baseUrl}/?order_cancelled=1`,
    shipping_address_collection: { allowed_countries: ['AU'] },
    shipping_options: [
      {
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: { amount: standardFree ? 0 : shippingCents, currency: 'aud' },
          display_name: shippingLabel,
          delivery_estimate: {
            minimum: { unit: 'business_day', value: 3 },
            maximum: { unit: 'business_day', value: 7 },
          },
        },
      },
    ],
    automatic_tax: { enabled: false },
    allow_promotion_codes: true,
  };

  // Gift card coupon - format checked, then verified against Stripe itself.
  if (typeof couponCode === 'string' && /^PN-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(couponCode.toUpperCase())) {
    const code = couponCode.toUpperCase();
    try {
      const coupon = await stripe.coupons.retrieve(code);
      if (
        coupon.valid &&
        typeof coupon.max_redemptions === 'number' &&
        coupon.times_redeemed < coupon.max_redemptions &&
        coupon.metadata?.type === 'gift_card'
      ) {
        sessionParams.discounts = [{ coupon: code }];
        delete sessionParams.allow_promotion_codes;
      }
    } catch (err) {
      console.warn('Gift card coupon not applied:', err.message);
    }
  }

  try {
    const session = await stripe.checkout.sessions.create(sessionParams);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: session.url }),
    };
  } catch (err) {
    console.error('Stripe checkout error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Checkout unavailable' }),
    };
  }
};
