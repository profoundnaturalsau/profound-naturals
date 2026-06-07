const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let code;
  try {
    ({ code } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, body: 'Invalid request' };
  }

  if (!code) {
    return { statusCode: 400, body: JSON.stringify({ valid: false, error: 'No code provided' }) };
  }

  try {
    // Look up the coupon by ID (our readable code IS the Stripe coupon ID)
    const coupon = await stripe.coupons.retrieve(code.toUpperCase());

    // Check it's a Profound Naturals gift card coupon
    if (coupon.metadata?.type !== 'gift_card') {
      return {
        statusCode: 200,
        body: JSON.stringify({ valid: false, error: 'Invalid gift card code' }),
      };
    }

    // Check it hasn't already been redeemed
    if (coupon.times_redeemed >= coupon.max_redemptions) {
      return {
        statusCode: 200,
        body: JSON.stringify({ valid: false, error: 'This gift card has already been used' }),
      };
    }

    // Check it's still valid (not deleted/expired)
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
        amount_off: coupon.amount_off, // in cents
        currency: coupon.currency,
      }),
    };

  } catch (err) {
    // Stripe throws if coupon ID doesn't exist
    if (err.code === 'resource_missing') {
      return {
        statusCode: 200,
        body: JSON.stringify({ valid: false, error: 'Gift card code not found' }),
      };
    }
    console.error('Gift card validation error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ valid: false, error: 'Could not validate code — please try again' }),
    };
  }
};
