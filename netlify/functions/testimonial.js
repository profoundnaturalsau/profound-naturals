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

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Rate limit by IP
  const ip = event.headers['x-forwarded-for']?.split(',')[0].trim() || 'unknown';
  if (isRateLimited(ip)) {
    return { statusCode: 429, body: JSON.stringify({ error: 'Too many requests' }) };
  }

  let name, email, review, honeypot;
  try {
    ({ name, email, review, honeypot } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request' }) };
  }

  // Honeypot — silent discard for bots
  if (honeypot) return { statusCode: 200, body: JSON.stringify({ success: true }) };

  // Validate fields
  if (!name || typeof name !== 'string' || name.length > 100) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request' }) };
  }
  if (!email || typeof email !== 'string' || !email.includes('@') || email.length > 254) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request' }) };
  }
  if (!review || typeof review !== 'string' || review.length > 2000) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request' }) };
  }

  // Escape all inputs before use in email HTML
  const safeName   = esc(name.trim());
  const safeEmail  = esc(email.trim());
  const safeReview = esc(review.trim());

  try {
    await sendMail({
      from: `"Profound Naturals" <${process.env.ZOHO_USER}>`,
      to: process.env.ZOHO_USER,
      replyTo: email.trim(),
      subject: `New Testimonial Submission`,
      html: `
        <div style="font-family:sans-serif; max-width:600px; margin:0 auto; padding:32px; background:#0f1610; color:#e6ece7;">
          <h2 style="color:#d4a017; font-size:1.2rem; margin-bottom:24px; letter-spacing:.1em; text-transform:uppercase;">
            New Testimonial Submission
          </h2>
          <table style="width:100%; border-collapse:collapse;">
            <tr>
              <td style="padding:10px 0; color:#a0d916; font-size:.8rem; letter-spacing:.1em; text-transform:uppercase; width:120px;">Name</td>
              <td style="padding:10px 0; color:#e6ece7;">${safeName}</td>
            </tr>
            <tr>
              <td style="padding:10px 0; color:#a0d916; font-size:.8rem; letter-spacing:.1em; text-transform:uppercase;">Email</td>
              <td style="padding:10px 0; color:#e6ece7;">${safeEmail}</td>
            </tr>
          </table>
          <div style="margin-top:24px; padding:20px; background:#141d15; border-left:3px solid #d4a017;">
            <p style="font-size:.8rem; color:#a0d916; letter-spacing:.1em; text-transform:uppercase; margin-bottom:12px;">Testimonial</p>
            <p style="color:#e6ece7; line-height:1.7; font-style:italic;">"${safeReview}"</p>
          </div>
          <p style="margin-top:24px; font-size:.75rem; color:rgba(230,236,231,0.5);">
            Submitted via profoundnaturals.com.au
          </p>
        </div>
      `,
    });

    return { statusCode: 200, body: JSON.stringify({ success: true }) };

  } catch (err) {
    console.error('Testimonial email failed:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Unable to process request' }) };
  }
};
