const Stripe = require('stripe');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let items;
  try {
    ({ items } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request' }) };
  }

  if (!items || !items.length) {
    return { statusCode: 400, body: JSON.stringify({ error: 'No items in cart' }) };
  }

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

  const lineItems = items.map(item => ({
    price_data: {
      currency: 'aud',
      product_data: {
        name: item.variant ? `${item.name} (${item.variant})` : item.name,
        description: item.category || undefined,
      },
      unit_amount: Math.round(item.price * 100), // cents
    },
    quantity: item.qty,
  }));

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'afterpay_clearpay', 'klarna'],
      line_items: lineItems,
      mode: 'payment',
      success_url: `${event.headers.origin || 'https://quiet-yeot-f6f573.netlify.app'}/?order=success`,
      cancel_url: `${event.headers.origin || 'https://quiet-yeot-f6f573.netlify.app'}/?order=cancelled`,
      billing_address_collection: 'required',
      shipping_address_collection: {
        allowed_countries: ['AU'],
      },
      phone_number_collection: {
        enabled: true,
      },
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ url: session.url }),
    };
  } catch (err) {
    console.error('Stripe error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
