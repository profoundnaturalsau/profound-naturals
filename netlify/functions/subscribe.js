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

  // Honeypot - silent discard for bots
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
          <div style="font-family:'Georgia',serif; background:#080d09; padding:0; margin:0;">
      <div style="max-width:560px; margin:0 auto; padding:48px 32px;">

        <div style="text-align:center; margin-bottom:40px;">
          <p style="font-family:'Arial',sans-serif; font-size:.8rem; letter-spacing:.32em; text-transform:uppercase; color:#8cc40f; margin:0 0 14px;">Profound Naturals</p>
          <h1 style="font-family:'Georgia',serif; font-size:2.5rem; font-weight:300; color:#e6ece7; margin:0; line-height:1.2;">The Botanical <em style="color:#d4a017;">Circle</em></h1>
        </div>

        <p style="font-family:'Arial',sans-serif; font-size:.85rem; color:rgba(230,236,231,0.7); line-height:1.7; margin-bottom:32px;">
          Thank you for joining the botanical circle. As a welcome gift, here&#x27;s <strong style="color:#e6ece7;">10% off your first order</strong>.
        </p>

        <div style="border:1px solid rgba(212,160,23,0.5); padding:32px; text-align:center; margin-bottom:32px; background:#0f1610;">
          <p style="font-family:'Arial',sans-serif; font-size:.65rem; letter-spacing:.25em; text-transform:uppercase; color:#d4a017; margin:0 0 12px;">Your Welcome Code</p>
          <p style="font-family:'Courier New',monospace; font-size:1.4rem; font-weight:700; color:#e6ece7; letter-spacing:.15em; margin:0 0 12px; background:#1a2419; padding:14px 20px; display:inline-block;">BOTANICAL10</p>
          <p style="font-family:'Arial',sans-serif; font-size:.72rem; color:rgba(230,236,231,0.5); margin:0;">10% off your first order</p>
        </div>

        <p style="font-family:'Arial',sans-serif; font-size:.85rem; color:rgba(230,236,231,0.7); line-height:1.7; margin-bottom:32px;">
          Use this code at checkout. We&#x27;ll be in touch with seasonal stories, new arrivals and exclusive offers.
        </p>

        <div style="text-align:center; margin-bottom:32px;">
          <a href="https://profoundnaturals.com.au" style="display:inline-block; background:transparent; color:#d4a017; border:1px solid rgba(212,160,23,0.6); padding:14px 32px; font-family:'Arial',sans-serif; font-size:.72rem; letter-spacing:.18em; text-transform:uppercase; text-decoration:none;">Continue Shopping</a>
        </div>
        <p style="font-family:'Arial',sans-serif; font-size:.82rem; letter-spacing:.04em; color:#a0d916; line-height:1.7; text-align:center; margin:0 0 20px;">
          Thanks for supporting a small Australian business&nbsp;<img src="https://profoundnaturals.com.au/images/icons/australian-native.png" width="17" height="17" alt="Australia" style="vertical-align:middle; margin-left:2px;">
        </p>

        <p style="font-family:'Arial',sans-serif; font-size:.68rem; color:rgba(230,236,231,0.3); text-align:center; margin-top:32px; padding-top:24px; border-top:1px solid rgba(255,255,255,0.06);">
          profoundnaturals.com.au &nbsp;·&nbsp; Australian made botanical wellness
        </p>
      </div>
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
