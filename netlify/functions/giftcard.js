const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const nodemailer = require('nodemailer');
const crypto = require('crypto');

function generateCode() {
  return 'PN-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

async function sendMail(to, subject, html) {
  const hosts = ['smtp.zoho.com.au', 'smtp.zoho.com'];
  for (const host of hosts) {
    try {
      const transporter = nodemailer.createTransport({
        host, port: 465, secure: true,
        auth: { user: process.env.ZOHO_USER, pass: process.env.ZOHO_PASS },
      });
      await transporter.verify();
      await transporter.sendMail({ from: `"Profound Naturals" <${process.env.ZOHO_USER}>`, to, subject, html });
      return;
    } catch (err) {
      console.error('Mail failed on ' + host + ': ' + err.message);
    }
  }
  throw new Error('All SMTP hosts failed');
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let amount, recipientEmail, recipientName, senderName, message, action;
  try {
    ({ amount, recipientEmail, recipientName, senderName, message, action } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request' }) };
  }

  // Handle post-payment success — generate and send code
  if (action === 'send') {
    const code = generateCode();
    const amountFormatted = '$' + (amount / 100).toFixed(2);

    try {
      // Email to recipient
      await sendMail(
        recipientEmail,
        `You've received a ${amountFormatted} Profound Naturals gift card`,
        `
        <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#1a1a1a;">
          <h2 style="font-weight:300;font-size:28px;margin-bottom:8px;">A gift from ${senderName}</h2>
          <p style="color:#555;line-height:1.7;">${message ? message : 'Enjoy this gift of botanical luxury.'}</p>
          <div style="background:#f9f7f2;border-left:3px solid #8cc40f;padding:20px 24px;margin:28px 0;">
            <p style="font-size:12px;letter-spacing:.15em;text-transform:uppercase;color:#888;margin-bottom:6px;">Your gift card code</p>
            <p style="font-family:monospace;font-size:28px;font-weight:600;color:#1a1a1a;letter-spacing:.1em;margin:0;">${code}</p>
            <p style="font-size:13px;color:#888;margin-top:8px;">Value: ${amountFormatted}</p>
          </div>
          <p style="color:#555;line-height:1.7;">Redeem at <a href="https://profoundnaturals.com.au" style="color:#8cc40f;">profoundnaturals.com.au</a> by entering your code at checkout.</p>
          <p style="color:#555;margin-top:32px;">Profound Naturals</p>
        </div>
        `
      );

      // Admin notification
      await sendMail(
        process.env.ZOHO_USER,
        'Gift Card Issued - ' + code,
        `<p>Gift card <strong>${code}</strong> for <strong>${amountFormatted}</strong> issued to <strong>${recipientEmail}</strong> (${recipientName}) from ${senderName}.</p>`
      );

      return { statusCode: 200, body: JSON.stringify({ success: true, code }) };
    } catch (err) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Failed to send gift card' }) };
    }
  }

  // Create Stripe Checkout session
  const amountCents = Math.round(amount);
  if (!amountCents || amountCents < 2500) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Minimum gift card value is $25' }) };
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'aud',
          product_data: {
            name: 'Profound Naturals Gift Card',
            description: 'Redeemable at profoundnaturals.com.au',
          },
          unit_amount: amountCents,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${process.env.URL || 'https://profoundnaturals.com.au'}/?gc_success=1&amount=${amountCents}&recipient=${encodeURIComponent(recipientEmail)}&recipientName=${encodeURIComponent(recipientName)}&sender=${encodeURIComponent(senderName)}&msg=${encodeURIComponent(message || '')}`,
      cancel_url: `${process.env.URL || 'https://profoundnaturals.com.au'}/?gc_cancelled=1`,
    });

    return { statusCode: 200, body: JSON.stringify({ url: session.url }) };
  } catch (err) {
    console.error('Stripe error: ' + err.message);
    return { statusCode: 500, body: JSON.stringify({ error: 'Could not create checkout session' }) };
  }
};
