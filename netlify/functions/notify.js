const nodemailer = require('nodemailer');

// Simple in-memory rate limiter (resets on function cold start)
const rateMap = {};
const RATE_LIMIT = 5;
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

// Escape HTML to prevent injection in email body
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
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

  let email, productName, name, honeypot;
  try {
    ({ email, productName, name, honeypot } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request' }) };
  }

  // Honeypot - silent discard for bots
  if (honeypot) return { statusCode: 200, body: JSON.stringify({ success: true }) };

  // Validate email
  if (!email || typeof email !== 'string' || !email.includes('@') || email.length > 254) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid email' }) };
  }

  // Validate productName
  if (!productName || typeof productName !== 'string' || productName.length > 200) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request' }) };
  }

  // Escape both inputs before use in email HTML
  const safeEmail   = esc(email.trim());
  const safeName    = esc(productName.trim());
  const safeCustomerName = name && typeof name === 'string' ? esc(name.trim()) : '';
  const greeting    = safeCustomerName ? `Hi ${safeCustomerName},` : 'Hi,';

  const hosts = ['smtp.zoho.com.au', 'smtp.zoho.com'];
  let lastErr;

  for (const host of hosts) {
    try {
      const transporter = nodemailer.createTransport({
        host,
        port: 465,
        secure: true,
        auth: {
          user: process.env.ZOHO_USER,
          pass: process.env.ZOHO_PASS,
        },
      });

      await transporter.verify();

      await transporter.sendMail({
        from: `"Profound Naturals" <${process.env.ZOHO_USER}>`,
        to: email.trim(),
        subject: `I'll notify you when ${safeName} is back`,
        html: `
          <div style="font-family:'Georgia',serif; background:#080d09; padding:0; margin:0;">
      <div style="max-width:560px; margin:0 auto; padding:48px 32px;">

        <div style="text-align:center; margin-bottom:40px;">
          <p style="font-family:'Arial',sans-serif; font-size:.8rem; letter-spacing:.32em; text-transform:uppercase; color:#8cc40f; margin:0 0 14px;">Profound Naturals</p>
          <h1 style="font-family:'Georgia',serif; font-size:2.5rem; font-weight:300; color:#e6ece7; margin:0; line-height:1.2;">You're on the <em style="color:#d4a017;">List</em></h1>
        </div>

        <p style="font-family:'Arial',sans-serif; font-size:.85rem; color:rgba(230,236,231,0.7); line-height:1.7; margin-bottom:8px;">${greeting}</p>
        <p style="font-family:'Arial',sans-serif; font-size:.85rem; color:rgba(230,236,231,0.7); line-height:1.7; margin-bottom:32px;">
          You&#x27;re on the list for <strong style="color:#e6ece7;">${safeName}</strong>. As soon as it&#x27;s back in stock, you&#x27;ll be the first to know - good things are worth waiting for.
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

      await transporter.sendMail({
        from: `"Profound Naturals" <${process.env.ZOHO_USER}>`,
        to: process.env.ZOHO_USER,
        subject: `Restock Request - ${safeName}`,
        html: `<p><strong>${safeCustomerName ? safeCustomerName + ' - ' : ''}${safeEmail}</strong> wants to be notified when <strong>${safeName}</strong> is back in stock.</p>`,
      });

      return { statusCode: 200, body: JSON.stringify({ success: true }) };

    } catch (err) {
      console.error('Failed with host ' + host + ': ' + err.message);
      lastErr = err;
    }
  }

  return {
    statusCode: 500,
    body: JSON.stringify({ error: 'Unable to process request' }),
  };
};
