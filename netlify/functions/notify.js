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

  let email, productName, honeypot;
  try {
    ({ email, productName, honeypot } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request' }) };
  }

  // Honeypot — silent discard for bots
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
  const safeEmail = esc(email.trim());
  const safeName  = esc(productName.trim());

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
          <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#1a1a1a;">
            <h2 style="font-weight:300;font-size:28px;margin-bottom:8px;">You're on the list</h2>
            <p style="color:#555;line-height:1.7;">Interest in <strong>${safeName}</strong> has been noted. As soon as it's back in stock, you'll be the first to know.</p>
            <p style="color:#555;line-height:1.7;">Thank you for your patience - good things are worth waiting for.</p>
            <p style="color:#555;margin-top:32px;">Profound Naturals</p>
          </div>
        `,
      });

      await transporter.sendMail({
        from: `"Profound Naturals" <${process.env.ZOHO_USER}>`,
        to: process.env.ZOHO_USER,
        subject: `Restock Request - ${safeName}`,
        html: `<p><strong>${safeEmail}</strong> wants to be notified when <strong>${safeName}</strong> is back in stock.</p>`,
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
