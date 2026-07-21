// netlify/functions/stripe-webhook.js - Profound Naturals MAIN SITE
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const nodemailer = require('nodemailer');

// ── ZOHO SMTP ──
function makeTransporter(host) {
  return nodemailer.createTransport({
    host,
    port: 465,
    secure: true,
    auth: { user: process.env.ZOHO_USER, pass: process.env.ZOHO_PASS },
    tls: { rejectUnauthorized: false },
  });
}

async function sendMail(opts) {
  try {
    await makeTransporter('smtp.zoho.com.au').sendMail(opts);
  } catch {
    await makeTransporter('smtp.zoho.com').sendMail(opts);
  }
}

// ── HTML ESCAPE ──
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// ── GIFT CARD EMAIL ──
async function sendGiftCardEmail({ recipientEmail, recipientName, senderName, amount, code, message }) {
  const dollarAmount = (amount / 100).toFixed(2);
  const safeRecipientName = esc(recipientName || '');
  const safeSenderName    = esc(senderName || '');
  const safeMessage       = esc(message || '');
  const safeCode          = esc(code || '');

  const html = `
    <div style="font-family:'Georgia',serif; background:#080d09; padding:0; margin:0;">
      <div style="max-width:560px; margin:0 auto; padding:48px 32px;">

        <div style="text-align:center; margin-bottom:40px;">
          <p style="font-family:'Arial',sans-serif; font-size:.8rem; letter-spacing:.32em; text-transform:uppercase; color:#8cc40f; margin:0 0 14px;">Profound Naturals</p>
          <h1 style="font-family:'Georgia',serif; font-size:2.5rem; font-weight:300; color:#e6ece7; margin:0; line-height:1.2;">A Gift of<br><em style="color:#d4a017;">Botanicals</em></h1>
        </div>

        <p style="font-family:'Arial',sans-serif; font-size:.85rem; color:rgba(230,236,231,0.7); line-height:1.7; margin-bottom:8px;">
          Dear ${safeRecipientName},
        </p>
        <p style="font-family:'Arial',sans-serif; font-size:.85rem; color:rgba(230,236,231,0.7); line-height:1.7; margin-bottom:32px;">
          ${safeSenderName} has sent you a Profound Naturals gift card${safeMessage ? ` with a personal message:` : '.'}
        </p>

        ${safeMessage ? `
        <div style="border-left:2px solid #d4a017; padding:16px 20px; margin-bottom:32px; background:#0f1610;">
          <p style="font-family:'Georgia',serif; font-size:1rem; color:#e6ece7; font-style:italic; line-height:1.7; margin:0;">"${safeMessage}"</p>
          <p style="font-family:'Arial',sans-serif; font-size:.72rem; color:#a0d916; margin:12px 0 0; letter-spacing:.1em;">- ${safeSenderName}</p>
        </div>
        ` : ''}

        <div style="border:1px solid rgba(212,160,23,0.5); padding:32px; text-align:center; margin-bottom:32px; background:#0f1610;">
          <p style="font-family:'Arial',sans-serif; font-size:.65rem; letter-spacing:.25em; text-transform:uppercase; color:#d4a017; margin:0 0 12px;">Gift Card Value</p>
          <p style="font-family:'Fraunces',Georgia,serif; font-size:3rem; font-weight:300; color:#e6ece7; margin:0 0 24px;">$${dollarAmount}</p>
          <p style="font-family:'Arial',sans-serif; font-size:.65rem; letter-spacing:.25em; text-transform:uppercase; color:#d4a017; margin:0 0 10px;">Your Code</p>
          <p style="font-family:'Courier New',monospace; font-size:1.4rem; font-weight:700; color:#e6ece7; letter-spacing:.15em; margin:0 0 24px; background:#1a2419; padding:14px 20px; display:inline-block;">${safeCode}</p>
          <br>
          <a href="https://profoundnaturals.com.au" style="display:inline-block; background:transparent; color:#d4a017; border:1px solid rgba(212,160,23,0.6); padding:14px 32px; font-family:'Arial',sans-serif; font-size:.72rem; letter-spacing:.18em; text-transform:uppercase; text-decoration:none;">Shop Now</a>
        </div>

        <p style="font-family:'Arial',sans-serif; font-size:.82rem; letter-spacing:.04em; color:#a0d916; line-height:1.7; text-align:center; margin:0 0 20px;">
          Thanks for supporting a small Australian business&nbsp;<img src="https://profoundnaturals.com.au/images/icons/australian-native.png" width="17" height="17" alt="Australia" style="vertical-align:middle; margin-left:2px;">
        </p>
        <p style="font-family:'Arial',sans-serif; font-size:.75rem; color:rgba(230,236,231,0.45); line-height:1.7; text-align:center;">
          Enter your code in the cart at checkout. Never expires &nbsp;·&nbsp; Single use &nbsp;·&nbsp; Full value redeemable
        </p>
        <p style="font-family:'Arial',sans-serif; font-size:.68rem; color:rgba(230,236,231,0.3); text-align:center; margin-top:32px; padding-top:24px; border-top:1px solid rgba(255,255,255,0.06);">
          profoundnaturals.com.au &nbsp;·&nbsp; Australian made botanical wellness
        </p>

      </div>
    </div>
  `;

  // Email to recipient
  await sendMail({
    from: `"Profound Naturals" <${process.env.ZOHO_USER}>`,
    to: recipientEmail,
    replyTo: process.env.ZOHO_USER,
    subject: `${safeSenderName} sent you a $${dollarAmount} Profound Naturals gift card 🌿`,
    html,
  });

  // Notification to store owner
  await sendMail({
    from: `"Profound Naturals" <${process.env.ZOHO_USER}>`,
    to: process.env.ZOHO_USER,
    subject: `Gift card sold - $${dollarAmount}`,
    html: `
      <div style="font-family:sans-serif; padding:24px; background:#0f1610; color:#e6ece7; max-width:500px;">
        <h2 style="color:#d4a017; margin-bottom:20px;">Gift Card Sold</h2>
        <table style="width:100%; border-collapse:collapse;">
          <tr><td style="padding:8px 0; color:#a0d916; width:140px;">Amount</td><td>$${dollarAmount}</td></tr>
          <tr><td style="padding:8px 0; color:#a0d916;">Code</td><td style="font-family:monospace; font-size:1.1rem;">${safeCode}</td></tr>
          <tr><td style="padding:8px 0; color:#a0d916;">From</td><td>${safeSenderName}</td></tr>
          <tr><td style="padding:8px 0; color:#a0d916;">To (name)</td><td>${safeRecipientName}</td></tr>
          <tr><td style="padding:8px 0; color:#a0d916;">To (email)</td><td>${esc(recipientEmail)}</td></tr>
          ${safeMessage ? `<tr><td style="padding:8px 0; color:#a0d916;">Message</td><td><em>"${safeMessage}"</em></td></tr>` : ''}
        </table>
        <p style="margin-top:20px; font-size:.75rem; color:rgba(230,236,231,0.4);">
          Profound Naturals · profoundnaturals.com.au
        </p>
      </div>
    `,
  });
}

// ── ORDER CONFIRMATION EMAIL ──
// Styled to match the gift card email (same palette / fonts / SMTP).
// Sends a branded confirmation to the customer + a fulfilment notification to the owner.
// Webhook-only: Stripe's built-in "Successful payments" receipt must stay OFF so orders
// don't get two emails (mirrors the gift-card pattern - see handover gotcha #12).
async function sendOrderEmail({ customerEmail, customerName, lineItems, subtotal, discount, shippingLabel, shippingCost, total, orderRef, shipName, shipAddr }) {
  const money = (c) => '$' + (Number(c || 0) / 100).toFixed(2);
  const safeName = esc(customerName || 'there');

  const itemRows = lineItems.map((li) => `
        <tr>
          <td style="padding:12px 0; border-bottom:1px solid rgba(255,255,255,0.06); font-family:'Arial',sans-serif; font-size:.82rem; color:#e6ece7; line-height:1.5;">
            ${esc(li.description || 'Item')}${li.quantity > 1 ? ` <span style="color:rgba(230,236,231,0.45);">× ${li.quantity}</span>` : ''}
          </td>
          <td style="padding:12px 0; border-bottom:1px solid rgba(255,255,255,0.06); font-family:'Arial',sans-serif; font-size:.82rem; color:#e6ece7; text-align:right; white-space:nowrap;">
            ${money(li.amount_total)}
          </td>
        </tr>`).join('');

  const totalsRows = `
        <tr>
          <td style="padding:10px 0 4px; font-family:'Arial',sans-serif; font-size:.78rem; color:rgba(230,236,231,0.55);">Subtotal</td>
          <td style="padding:10px 0 4px; font-family:'Arial',sans-serif; font-size:.78rem; color:rgba(230,236,231,0.55); text-align:right;">${money(subtotal)}</td>
        </tr>
        ${discount > 0 ? `
        <tr>
          <td style="padding:4px 0; font-family:'Arial',sans-serif; font-size:.78rem; color:#a0d916;">Discount</td>
          <td style="padding:4px 0; font-family:'Arial',sans-serif; font-size:.78rem; color:#a0d916; text-align:right;">−${money(discount)}</td>
        </tr>` : ''}
        <tr>
          <td style="padding:4px 0; font-family:'Arial',sans-serif; font-size:.78rem; color:rgba(230,236,231,0.55);">${esc(shippingLabel)}</td>
          <td style="padding:4px 0; font-family:'Arial',sans-serif; font-size:.78rem; color:rgba(230,236,231,0.55); text-align:right;">${shippingCost > 0 ? money(shippingCost) : 'Free'}</td>
        </tr>`;

  const addressBlock = shipAddr ? `
        <div style="margin-bottom:32px;">
          <p style="font-family:'Arial',sans-serif; font-size:.65rem; letter-spacing:.25em; text-transform:uppercase; color:#8cc40f; margin:0 0 10px;">Shipping To</p>
          <p style="font-family:'Arial',sans-serif; font-size:.82rem; color:rgba(230,236,231,0.7); line-height:1.7; margin:0;">
            ${[shipName, shipAddr.line1, shipAddr.line2, `${shipAddr.city || ''} ${shipAddr.state || ''} ${shipAddr.postal_code || ''}`.trim(), shipAddr.country].filter(Boolean).map(esc).join('<br>')}
          </p>
        </div>` : '';

  const html = `
    <div style="font-family:'Georgia',serif; background:#080d09; padding:0; margin:0;">
      <div style="max-width:560px; margin:0 auto; padding:48px 32px;">

        <div style="text-align:center; margin-bottom:40px;">
          <p style="font-family:'Arial',sans-serif; font-size:.8rem; letter-spacing:.32em; text-transform:uppercase; color:#8cc40f; margin:0 0 14px;">Profound Naturals</p>
          <h1 style="font-family:'Georgia',serif; font-size:2.5rem; font-weight:300; color:#e6ece7; margin:0; line-height:1.2;">Order <em style="color:#d4a017;">Confirmed</em></h1>
          ${orderRef ? `<p style="font-family:'Courier New',monospace; font-size:1rem; letter-spacing:.18em; color:rgba(230,236,231,0.55); margin:14px 0 0;">${esc(orderRef)}</p>` : ''}
        </div>

        <p style="font-family:'Arial',sans-serif; font-size:.85rem; color:rgba(230,236,231,0.7); line-height:1.7; margin-bottom:8px;">
          Dear ${safeName},
        </p>
        <p style="font-family:'Arial',sans-serif; font-size:.85rem; color:rgba(230,236,231,0.7); line-height:1.7; margin-bottom:32px;">
          Thank you for your order. Everything below is hand-packed and dispatched within 1-3 business days - here's what's on its way to you.
        </p>

        <div style="border:1px solid rgba(212,160,23,0.5); padding:28px 28px 24px; margin-bottom:32px; background:#0f1610;">
          <table style="width:100%; border-collapse:collapse;">
            ${itemRows}
            ${totalsRows}
          </table>
          <div style="border-top:1px solid rgba(212,160,23,0.3); margin-top:16px; padding-top:20px; text-align:center;">
            <p style="font-family:'Arial',sans-serif; font-size:.65rem; letter-spacing:.25em; text-transform:uppercase; color:#d4a017; margin:0 0 8px;">Total Paid</p>
            <p style="font-family:'Fraunces',Georgia,serif; font-size:2.4rem; font-weight:300; color:#e6ece7; margin:0;">${money(total)} <span style="font-size:.9rem; color:rgba(230,236,231,0.4);">AUD</span></p>
          </div>
        </div>

        ${addressBlock}

        <div style="text-align:center; margin-bottom:32px;">
          <a href="https://profoundnaturals.com.au" style="display:inline-block; background:transparent; color:#d4a017; border:1px solid rgba(212,160,23,0.6); padding:14px 32px; font-family:'Arial',sans-serif; font-size:.72rem; letter-spacing:.18em; text-transform:uppercase; text-decoration:none;">Continue Shopping</a>
        </div>

        <p style="font-family:'Arial',sans-serif; font-size:.82rem; letter-spacing:.04em; color:#a0d916; line-height:1.7; text-align:center; margin:0 0 20px;">
          Thanks for supporting a small Australian business&nbsp;<img src="https://profoundnaturals.com.au/images/icons/australian-native.png" width="17" height="17" alt="Australia" style="vertical-align:middle; margin-left:2px;">
        </p>
        <p style="font-family:'Arial',sans-serif; font-size:.75rem; color:rgba(230,236,231,0.45); line-height:1.7; text-align:center;">
          You'll hear from us if anything's needed. Questions? Just reply to this email.
        </p>
        <p style="font-family:'Arial',sans-serif; font-size:.68rem; color:rgba(230,236,231,0.3); text-align:center; margin-top:32px; padding-top:24px; border-top:1px solid rgba(255,255,255,0.06);">
          profoundnaturals.com.au &nbsp;·&nbsp; Australian made botanical wellness
        </p>

      </div>
    </div>
  `;

  // Confirmation to customer
  await sendMail({
    from: `"Profound Naturals" <${process.env.ZOHO_USER}>`,
    to: customerEmail,
    replyTo: process.env.ZOHO_USER,
    subject: `Order confirmed - Profound Naturals 🌿`,
    html,
  });

  // Fulfilment notification to store owner
  const ownerItems = lineItems.map((li) =>
    `<tr><td style="padding:6px 0; color:#e6ece7;">${esc(li.description || 'Item')}${li.quantity > 1 ? ` × ${li.quantity}` : ''}</td><td style="padding:6px 0; text-align:right; color:#e6ece7;">${money(li.amount_total)}</td></tr>`
  ).join('');

  await sendMail({
    from: `"Profound Naturals" <${process.env.ZOHO_USER}>`,
    to: process.env.ZOHO_USER,
    subject: `New order - ${money(total)}${orderRef ? ` (${orderRef})` : ''}`,
    html: `
      <div style="font-family:sans-serif; padding:24px; background:#0f1610; color:#e6ece7; max-width:500px;">
        <h2 style="color:#d4a017; margin-bottom:20px;">New Order</h2>
        <table style="width:100%; border-collapse:collapse; margin-bottom:16px;">
          ${ownerItems}
          <tr><td style="padding:8px 0 2px; border-top:1px solid rgba(255,255,255,0.1); color:#a0d916;">${esc(shippingLabel)}</td><td style="padding:8px 0 2px; border-top:1px solid rgba(255,255,255,0.1); text-align:right;">${shippingCost > 0 ? money(shippingCost) : 'Free'}</td></tr>
          ${discount > 0 ? `<tr><td style="padding:2px 0; color:#a0d916;">Discount</td><td style="padding:2px 0; text-align:right;">−${money(discount)}</td></tr>` : ''}
          <tr><td style="padding:2px 0; color:#d4a017; font-weight:700;">Total</td><td style="padding:2px 0; text-align:right; color:#d4a017; font-weight:700;">${money(total)}</td></tr>
        </table>
        <table style="width:100%; border-collapse:collapse;">
          <tr><td style="padding:6px 0; color:#a0d916; width:120px; vertical-align:top;">Customer</td><td>${safeName}</td></tr>
          <tr><td style="padding:6px 0; color:#a0d916; vertical-align:top;">Email</td><td>${esc(customerEmail)}</td></tr>
          ${shipAddr ? `<tr><td style="padding:6px 0; color:#a0d916; vertical-align:top;">Ship to</td><td>${[shipName, shipAddr.line1, shipAddr.line2, `${shipAddr.city || ''} ${shipAddr.state || ''} ${shipAddr.postal_code || ''}`.trim(), shipAddr.country].filter(Boolean).map(esc).join('<br>')}</td></tr>` : ''}
          ${orderRef ? `<tr><td style="padding:6px 0; color:#a0d916; vertical-align:top;">Ref</td><td style="font-family:monospace;">${esc(orderRef)}</td></tr>` : ''}
        </table>
        <p style="margin-top:20px; font-size:.75rem; color:rgba(230,236,231,0.4);">
          Profound Naturals · profoundnaturals.com.au
        </p>
      </div>
    `,
  });
}

// ── WEBHOOK HANDLER ──
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Verify Stripe signature - rejects anything not from Stripe
  const sig = event.headers['stripe-signature'];
  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature failed:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  // Only handle completed checkouts
  if (stripeEvent.type !== 'checkout.session.completed') {
    return { statusCode: 200, body: 'Event ignored' };
  }

  const session  = stripeEvent.data.object;
  const metadata = session.metadata || {};

  // ── GIFT CARD BRANCH ──
  if (metadata.type === 'gift_card') {
    const couponCode    = metadata.coupon_code;
    const recipientEmail = metadata.recipient_email;
    const recipientName  = metadata.recipient_name || 'there';
    const senderName     = metadata.sender_name || 'Someone';
    const message        = metadata.message || '';
    const amount         = parseInt(metadata.amount_cents || '0', 10) || session.amount_total;

    if (!couponCode || !recipientEmail || !amount) {
      console.error('Gift card webhook missing required metadata:', metadata);
      return { statusCode: 200, body: 'OK' }; // return 200 so Stripe doesn't retry indefinitely
    }

    try {
      await sendGiftCardEmail({ recipientEmail, recipientName, senderName, amount, code: couponCode, message });
      console.log(`Gift card email sent - code: ${couponCode}, recipient: ${recipientEmail}`);
    } catch (err) {
      console.error('Gift card email failed:', err);
      // Still return 200 - email failure shouldn't cause Stripe to retry the webhook
      // which would send duplicate emails on retry
    }

    return { statusCode: 200, body: 'OK' };
  }

  // ── REGULAR PRODUCT ORDER BRANCH ──
  // Branded confirmation (customer) + fulfilment notification (owner), sent from the
  // webhook only. Keep Stripe's "Successful payments" receipt OFF to avoid double emails.
  try {
    // Re-retrieve with expansions - the raw webhook session omits line_items and
    // sends shipping_rate as an ID; expanding gives us items + the shipping display name.
    const full = await stripe.checkout.sessions.retrieve(session.id, {
      expand: ['line_items', 'shipping_cost.shipping_rate'],
    });

    let lineItems = full.line_items?.data || [];
    if (full.line_items?.has_more) {
      // Rare: large cart with >10 distinct lines - page through the full list.
      const more = await stripe.checkout.sessions.listLineItems(session.id, { limit: 100 });
      lineItems = more.data;
    }

    const customerEmail = full.customer_details?.email;
    if (!customerEmail) {
      console.error('Order webhook: no customer email on session', full.id);
      return { statusCode: 200, body: 'OK' };
    }

    const shipping = full.shipping_details || full.collected_information?.shipping_details || null;

    await sendOrderEmail({
      customerEmail,
      customerName:  full.customer_details?.name || 'there',
      lineItems,
      subtotal:      full.amount_subtotal,
      discount:      full.total_details?.amount_discount || 0,
      shippingLabel: (full.shipping_cost?.shipping_rate?.display_name || 'Shipping').split(/\s[\u2013\u2014-]\s/)[0].trim(),
      shippingCost:  full.total_details?.amount_shipping || 0,
      total:         full.amount_total,
      orderRef:      '#' + String(full.payment_intent || full.id).slice(-8).toUpperCase(),
      shipName:      shipping?.name || full.customer_details?.name || '',
      shipAddr:      shipping?.address || null,
    });

    console.log(`Order confirmation sent - ${full.id} → ${customerEmail}`);
  } catch (err) {
    // Return 200 regardless: a 4xx/5xx would make Stripe retry the webhook and
    // could send duplicate confirmations. Mirrors the gift-card branch's behaviour.
    console.error('Order confirmation email failed:', err);
  }

  return { statusCode: 200, body: 'OK' };
};
