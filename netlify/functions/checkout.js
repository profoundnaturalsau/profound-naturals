const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const PRODUCTS = require('./products.json');

// Build a lookup map: id -> price
const priceMap = {};
PRODUCTS.products.forEach(p => { priceMap[p.id] = p.price; });

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let items, couponCode;
  try {
    ({ items, couponCode } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, body: 'Invalid request body' };
  }

  if (!items || !items.length) {
    return { statusCode: 400, body: 'No items provided' };
  }

  // Resolve server-side prices - browser price is never trusted
  const resolvedItems = [];
  for (const item of items) {
    const serverPrice = priceMap[item.id];
    if (!serverPrice) {
      return { statusCode: 400, body: 'Invalid product' };
    }
    resolvedItems.push({
      id:       item.id,
      name:     item.name,
      category: item.category,
      variant:  item.variant || null,
      qty:      item.qty,
      price:    serverPrice,   // server price only - never item.price
    });
  }

  // Calculate subtotal from server-side prices to determine free shipping thresholds
  const subtotal = resolvedItems.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const standardFree = subtotal >= 85;
  const expressFree  = subtotal >= 180;

  // Build line items for Stripe
  const lineItems = resolvedItems.map(item => ({
    price_data: {
      currency: 'aud',
      unit_amount: Math.round(item.price * 100),
      product_data: {
        name: item.variant ? `${item.name} (${item.variant})` : item.name,
        description: item.category || undefined,
      },
    },
    quantity: item.qty,
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
          fixed_amount: { amount: standardFree ? 0 : 895, currency: 'aud' },
          display_name: standardFree ? 'Standard Shipping - Free' : 'Standard Shipping - $8.95',
          delivery_estimate: {
            minimum: { unit: 'business_day', value: 3 },
            maximum: { unit: 'business_day', value: 7 },
          },
        },
      },
      {
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: { amount: expressFree ? 0 : 1395, currency: 'aud' },
          display_name: expressFree ? 'Express Shipping - Free' : 'Express Shipping - $13.95',
          delivery_estimate: {
            minimum: { unit: 'business_day', value: 1 },
            maximum: { unit: 'business_day', value: 3 },
          },
        },
      },
    ],
    automatic_tax: { enabled: false },
    allow_promotion_codes: true,
  };

  // Apply gift card coupon if provided and valid format
  if (couponCode && /^PN-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(couponCode.toUpperCase())) {
    try {
      const coupon = await stripe.coupons.retrieve(couponCode.toUpperCase());
      if (coupon.valid && coupon.times_redeemed < coupon.max_redemptions && coupon.metadata?.type === 'gift_card') {
        sessionParams.discounts = [{ coupon: couponCode.toUpperCase() }];
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
      body: JSON.stringify({ url: session.url }),
    };
  } catch (err) {
    console.error('Stripe checkout error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Checkout unavailable' }),
    };
  }
};
