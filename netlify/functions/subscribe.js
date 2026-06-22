const nodemailer = require('nodemailer');

// ── RATE LIMITER ──
const rateMap = {};
const RATE_LIMIT = 3;
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

// ── HTML ESCAPE ──
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function makeTransporter(host) {
  return nodemailer.createTransport({
    host,
    port: 465,
    secure: true,
    auth: { user: process.env.ZOHO_USER, pass: process.env.ZOHO_PASS },
  });
}

async function sendMail(opts) {
  try {
    await makeTransporter('smtp.zoho.com.au').sendMail(opts);
  } catch {
    await makeTransporter('smtp.zoho.com').sendMail(opts);
  }
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

  let email, honeypot;
  try {
    ({ email, honeypot } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request' }) };
  }

  // Honeypot — silent discard for bots
  if (honeypot) return { statusCode: 200, body: JSON.stringify({ success: true }) };

  // Validate email
  if (!email || typeof email !== 'string' || !email.includes('@') || email.length > 254) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid email' }) };
  }

  const safeEmail = esc(email.trim());

  try {
    // Welcome email to subscriber
    await sendMail({
      from: `"Profound Naturals" <${process.env.ZOHO_USER}>`,
      to: email.trim(),
      subject: 'Welcome to the Botanical Circle 🌿',
      html: `
        <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#1a1a1a;">
          <h2 style="font-weight:300;font-size:28px;margin-bottom:8px;">Welcome to Profound Naturals</h2>
          <p style="color:#555;line-height:1.7;">Thank you for joining the botanical circle. As a welcome gift, here's <strong>10% off your first order</strong>.</p>
          <p style="font-size:22px;letter-spacing:4px;font-weight:bold;color:#2d6b40;margin:28px 0;">BOTANICAL10</p>
          <p style="color:#555;line-height:1.7;">Use this code at checkout. We'll be in touch with seasonal stories, new arrivals and exclusive offers.</p>
          <p style="color:#555;margin-top:32px;">With love,<br><em>The Profound Naturals Team</em></p>
        </div>
      `,
    });

    // Admin notification
    await sendMail({
      from: `"Profound Naturals" <${process.env.ZOHO_USER}>`,
      to: process.env.ZOHO_USER,
      subject: `New Newsletter Subscriber`,
      html: `<p>New subscriber: <strong>${safeEmail}</strong></p>`,
    });

    return { statusCode: 200, body: JSON.stringify({ success: true }) };

  } catch (err) {
    console.error('Subscribe error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Unable to process request' }) };
  }
};
