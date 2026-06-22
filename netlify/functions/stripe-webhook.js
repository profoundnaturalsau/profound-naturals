// netlify/functions/stripe-webhook.js — Profound Naturals MAIN SITE
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
          <p style="font-family:'Arial',sans-serif; font-size:.65rem; letter-spacing:.3em; text-transform:uppercase; color:#8cc40f; margin:0 0 12px;">Profound Naturals</p>
          <h1 style="font-family:'Georgia',serif; font-size:2rem; font-weight:300; color:#e6ece7; margin:0; line-height:1.2;">A Gift of<br><em style="color:#d4a017;">Botanicals</em></h1>
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
          <p style="font-family:'Arial',sans-serif; font-size:.72rem; color:#a0d916; margin:12px 0 0; letter-spacing:.1em;">— ${safeSenderName}</p>
        </div>
        ` : ''}

        <div style="border:1px solid rgba(212,160,23,0.5); padding:32px; text-align:center; margin-bottom:32px; background:#0f1610;">
          <p style="font-family:'Arial',sans-serif; font-size:.65rem; letter-spacing:.25em; text-transform:uppercase; color:#d4a017; margin:0 0 12px;">Gift Card Value</p>
          <p style="font-family:'Georgia',serif; font-size:3rem; font-weight:300; color:#e6ece7; margin:0 0 24px;">$${dollarAmount}</p>
          <p style="font-family:'Arial',sans-serif; font-size:.65rem; letter-spacing:.25em; text-transform:uppercase; color:#d4a017; margin:0 0 10px;">Your Code</p>
          <p style="font-family:'Courier New',monospace; font-size:1.4rem; font-weight:700; color:#e6ece7; letter-spacing:.15em; margin:0 0 24px; background:#1a2419; padding:14px 20px; display:inline-block;">${safeCode}</p>
          <br>
          <a href="https://profoundnaturals.com.au" style="display:inline-block; background:transparent; color:#d4a017; border:1px solid rgba(212,160,23,0.6); padding:14px 32px; font-family:'Arial',sans-serif; font-size:.72rem; letter-spacing:.18em; text-transform:uppercase; text-decoration:none;">Shop Now</a>
        </div>

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
    subject: `Gift card sold — $${dollarAmount}`,
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

// ── WEBHOOK HANDLER ──
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Verify Stripe signature — rejects anything not from Stripe
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
      console.log(`Gift card email sent — code: ${couponCode}, recipient: ${recipientEmail}`);
    } catch (err) {
      console.error('Gift card email failed:', err);
      // Still return 200 — email failure shouldn't cause Stripe to retry the webhook
      // which would send duplicate emails on retry
    }

    return { statusCode: 200, body: 'OK' };
  }

  // ── REGULAR PRODUCT ORDER BRANCH ──
  // No email needed here — Stripe sends its own receipt for regular orders
  // Add order fulfilment logic here if needed in future
  return { statusCode: 200, body: 'OK' };
};
