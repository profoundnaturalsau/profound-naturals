const Stripe = require('stripe');
const nodemailer = require('nodemailer');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ── ZOHO SMTP TRANSPORTER ──
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

// ── GENERATE READABLE GIFT CARD CODE ──
// Format: PN-XXXX-XXXX (easier to read and type than a raw Stripe coupon ID)
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O,0,I,1 to avoid confusion
  let code = 'PN-';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  code += '-';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// ── GIFT CARD EMAIL ──
async function sendGiftCardEmail({ recipientEmail, recipientName, senderName, amount, code, message }) {
  const dollarAmount = (amount / 100).toFixed(2);

  const html = `
    <div style="font-family:'Georgia',serif; background:#080d09; padding:0; margin:0;">
      <div style="max-width:560px; margin:0 auto; padding:48px 32px;">

        <div style="text-align:center; margin-bottom:40px;">
          <p style="font-family:'Arial',sans-serif; font-size:.65rem; letter-spacing:.3em; text-transform:uppercase; color:#8cc40f; margin:0 0 12px;">Profound Naturals</p>
          <h1 style="font-family:'Georgia',serif; font-size:2rem; font-weight:300; color:#e6ece7; margin:0; line-height:1.2;">A Gift of<br><em style="color:#d4a017;">Botanicals</em></h1>
        </div>

        <p style="font-family:'Arial',sans-serif; font-size:.85rem; color:rgba(230,236,231,0.7); line-height:1.7; margin-bottom:8px;">
          Dear ${recipientName},
        </p>
        <p style="font-family:'Arial',sans-serif; font-size:.85rem; color:rgba(230,236,231,0.7); line-height:1.7; margin-bottom:32px;">
          ${senderName} has sent you a Profound Naturals gift card${message ? ` with a personal message:` : '.'}
        </p>

        ${message ? `
        <div style="border-left:2px solid #d4a017; padding:16px 20px; margin-bottom:32px; background:#0f1610;">
          <p style="font-family:'Georgia',serif; font-size:1rem; color:#e6ece7; font-style:italic; line-height:1.7; margin:0;">"${message}"</p>
          <p style="font-family:'Arial',sans-serif; font-size:.72rem; color:#a0d916; margin:12px 0 0; letter-spacing:.1em;">— ${senderName}</p>
        </div>
        ` : ''}

        <div style="border:1px solid rgba(212,160,23,0.5); padding:32px; text-align:center; margin-bottom:32px; background:#0f1610;">
          <p style="font-family:'Arial',sans-serif; font-size:.65rem; letter-spacing:.25em; text-transform:uppercase; color:#d4a017; margin:0 0 12px;">Gift Card Value</p>
          <p style="font-family:'Georgia',serif; font-size:3rem; font-weight:300; color:#e6ece7; margin:0 0 24px;">$${dollarAmount}</p>
          <p style="font-family:'Arial',sans-serif; font-size:.65rem; letter-spacing:.25em; text-transform:uppercase; color:#d4a017; margin:0 0 10px;">Your Code</p>
          <p style="font-family:'Courier New',monospace; font-size:1.4rem; font-weight:700; color:#e6ece7; letter-spacing:.15em; margin:0 0 24px; background:#1a2419; padding:14px 20px; display:inline-block;">${code}</p>
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

  await sendMail({
    from: `"Profound Naturals" <${process.env.ZOHO_USER}>`,
    to: recipientEmail,
    replyTo: process.env.ZOHO_USER,
    subject: `${senderName} sent you a $${dollarAmount} Profound Naturals gift card 🌿`,
    html,
  });

  // Notification copy to store owner
  await sendMail({
    from: `"Profound Naturals" <${process.env.ZOHO_USER}>`,
    to: process.env.ZOHO_USER,
    subject: `Gift card sold — $${dollarAmount} to ${recipientEmail}`,
    html: `
      <div style="font-family:sans-serif; padding:24px; background:#0f1610; color:#e6ece7; max-width:500px;">
        <h2 style="color:#d4a017; margin-bottom:20px;">Gift Card Sold</h2>
        <table style="width:100%; border-collapse:collapse;">
          <tr><td style="padding:8px 0; color:#a0d916; width:140px;">Amount</td><td>$${dollarAmount}</td></tr>
          <tr><td style="padding:8px 0; color:#a0d916;">Code</td><td style="font-family:monospace; font-size:1.1rem;">${code}</td></tr>
          <tr><td style="padding:8px 0; color:#a0d916;">From</td><td>${senderName}</td></tr>
          <tr><td style="padding:8px 0; color:#a0d916;">To (name)</td><td>${recipientName}</td></tr>
          <tr><td style="padding:8px 0; color:#a0d916;">To (email)</td><td>${recipientEmail}</td></tr>
          ${message ? `<tr><td style="padding:8px 0; color:#a0d916;">Message</td><td><em>"${message}"</em></td></tr>` : ''}
        </table>
      </div>
    `,
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const { action } = body;

  // ── ACTION: SEND (post-payment email trigger) ──
  if (action === 'send') {
    const { amount, recipientEmail, recipientName, senderName, message, code } = body;
    if (!amount || !recipientEmail || !code) {
      return { statusCode: 400, body: 'Missing required fields' };
    }
    try {
      await sendGiftCardEmail({ recipientEmail, recipientName, senderName, amount, code, message });
      return { statusCode: 200, body: JSON.stringify({ success: true }) };
    } catch (err) {
      console.error('Email send failed:', err);
      return { statusCode: 500, body: 'Email failed' };
    }
  }

  // ── ACTION: CREATE CHECKOUT SESSION ──
  const { amount, recipientEmail, recipientName, senderName, message } = body;

  if (!amount || amount < 2500) {
    return { statusCode: 400, body: 'Minimum gift card value is $25' };
  }
  if (!recipientEmail || !recipientName || !senderName) {
    return { statusCode: 400, body: 'Missing required fields' };
  }

  try {
    // 1. Create a Stripe coupon for the exact gift card amount
    const code = generateCode();
    const coupon = await stripe.coupons.create({
      id: code,                      // use our readable code as the Stripe coupon ID
      amount_off: amount,            // in cents
      currency: 'aud',
      duration: 'once',              // single use
      max_redemptions: 1,            // hard limit — can only be used once
      name: `Profound Naturals Gift Card — ${senderName}`,
      metadata: {
        type: 'gift_card',
        recipient_email: recipientEmail,
        recipient_name: recipientName,
        sender_name: senderName,
        amount_cents: String(amount),
      },
    });

    // 2. Create Stripe Checkout session for the gift card purchase
    //    We sell it as a one-off line item priced at the gift card value
    const dollarAmount = (amount / 100).toFixed(2);
    const successUrl = `${process.env.URL || 'https://profoundnaturals.com.au'}/?gc_success=1&code=${encodeURIComponent(coupon.id)}&amount=${amount}&recipient=${encodeURIComponent(recipientEmail)}&recipientName=${encodeURIComponent(recipientName)}&sender=${encodeURIComponent(senderName)}&msg=${encodeURIComponent(message || '')}`;
    const cancelUrl  = `${process.env.URL || 'https://profoundnaturals.com.au'}/?gc_cancelled=1`;

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
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: recipientEmail,
      metadata: {
        type: 'gift_card',
        coupon_code: coupon.id,
        recipient_email: recipientEmail,
        recipient_name: recipientName,
        sender_name: senderName,
        message: message || '',
      },
      payment_intent_data: {
        metadata: {
          type: 'gift_card',
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
      body: JSON.stringify({ error: err.message }),
    };
  }
};
