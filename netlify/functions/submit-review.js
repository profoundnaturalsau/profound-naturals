// netlify/functions/submit-review.js - Profound Naturals MAIN SITE
// Public review submission. Stores the review as PENDING in Netlify Blobs and emails the
// owner a private moderation link. Nothing appears on the site until the owner approves.
// Stars are required; written text is optional (a text-less review still counts toward the
// product average + count, but cannot be featured on the homepage - that rule is enforced
// at moderation time).
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { getStore, connectLambda } = require('@netlify/blobs');
const productsData = require('./products.json');

const PRODUCTS = new Map((productsData.products || []).map((p) => [p.id, p.name]));
const SITE = 'https://profoundnaturals.com.au';

// ── RATE LIMITER (in-memory; resets on cold start) ──
const rateMap = {};
const RATE_LIMIT = 4;
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

// ── ZOHO SMTP ──
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

// Signs a moderation link so only links from the owner's email are valid.
function sign(id) {
  return crypto
    .createHmac('sha256', process.env.REVIEW_MODERATION_SECRET || '')
    .update(id)
    .digest('hex');
}

function starRow(rating) {
  return '\u2605'.repeat(rating) + '\u2606'.repeat(5 - rating); // filled + empty stars
}

exports.handler = async (event) => {
  // Classic (Lambda-compat) functions must wire the event into Netlify Blobs before
  // getStore() is called, or it throws MissingBlobsEnvironmentError.
  connectLambda(event);

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const ip = event.headers['x-forwarded-for']?.split(',')[0].trim() || 'unknown';
  if (isRateLimited(ip)) {
    return { statusCode: 429, body: JSON.stringify({ error: 'Too many requests' }) };
  }

  let productId, rating, name, email, text, honeypot;
  try {
    ({ productId, rating, name, email, text, honeypot } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request' }) };
  }

  // Honeypot - silent discard for bots
  if (honeypot) return { statusCode: 200, body: JSON.stringify({ success: true }) };

  // Product must be a known id
  const pid = parseInt(productId, 10);
  if (!PRODUCTS.has(pid)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request' }) };
  }

  // Rating is required: integer 1-5
  const r = parseInt(rating, 10);
  if (!Number.isInteger(r) || r < 1 || r > 5) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Please choose a star rating' }) };
  }

  // Name required
  if (!name || typeof name !== 'string' || name.trim().length === 0 || name.length > 100) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request' }) };
  }

  // Email required
  if (!email || typeof email !== 'string' || !email.includes('@') || email.length > 254) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request' }) };
  }

  // Text optional (capped)
  const cleanText = (text && typeof text === 'string') ? text.trim().slice(0, 2000) : '';

  if (!process.env.REVIEW_MODERATION_SECRET) {
    console.error('REVIEW_MODERATION_SECRET is not set - cannot sign moderation links');
    return { statusCode: 500, body: JSON.stringify({ error: 'Unable to process request' }) };
  }

  const productName = PRODUCTS.get(pid);
  const id = 'rv_' + Date.now().toString(36) + '_' + crypto.randomBytes(4).toString('hex');
  const review = {
    id,
    productId: pid,
    productName,
    rating: r,
    name: name.trim(),
    email: email.trim(),
    text: cleanText,
    status: 'pending',
    featured: false,
    createdAt: new Date().toISOString(),
  };

  // Store as pending
  try {
    const store = getStore('reviews');
    await store.setJSON(id, review);
  } catch (err) {
    console.error('Review store write failed:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Unable to process request' }) };
  }

  // Owner moderation email
  try {
    const token = sign(id);
    const modLink = `${SITE}/review-moderate.html?id=${encodeURIComponent(id)}&t=${token}`;
    const safeName = esc(review.name);
    const safeEmail = esc(review.email);
    const safeProduct = esc(productName);
    const safeText = cleanText ? esc(cleanText) : '';

    await sendMail({
      from: `"Profound Naturals" <${process.env.ZOHO_USER}>`,
      to: process.env.ZOHO_USER,
      replyTo: review.email,
      subject: `New review (${r}/5) - ${productName}`,
      html: `
        <div style="font-family:sans-serif; max-width:600px; margin:0 auto; padding:32px; background:#0f1610; color:#e6ece7;">
          <h2 style="color:#d4a017; font-size:1.15rem; margin:0 0 20px; letter-spacing:.08em; text-transform:uppercase;">New Review - Pending</h2>
          <table style="width:100%; border-collapse:collapse;">
            <tr><td style="padding:8px 0; color:#a0d916; font-size:.8rem; text-transform:uppercase; letter-spacing:.08em; width:120px;">Product</td><td style="padding:8px 0; color:#d4a017; font-weight:700;">${safeProduct}</td></tr>
            <tr><td style="padding:8px 0; color:#a0d916; font-size:.8rem; text-transform:uppercase; letter-spacing:.08em;">Rating</td><td style="padding:8px 0; color:#d4a017; font-size:1.1rem; letter-spacing:2px;">${starRow(r)} <span style="color:rgba(230,236,231,0.6); font-size:.85rem;">(${r}/5)</span></td></tr>
            <tr><td style="padding:8px 0; color:#a0d916; font-size:.8rem; text-transform:uppercase; letter-spacing:.08em;">Name</td><td style="padding:8px 0;">${safeName}</td></tr>
            <tr><td style="padding:8px 0; color:#a0d916; font-size:.8rem; text-transform:uppercase; letter-spacing:.08em;">Email</td><td style="padding:8px 0;">${safeEmail}</td></tr>
          </table>
          <div style="margin-top:20px; padding:18px; background:#141d15; border-left:3px solid ${cleanText ? '#d4a017' : 'rgba(230,236,231,0.2)'};">
            <p style="font-size:.72rem; color:#a0d916; letter-spacing:.1em; text-transform:uppercase; margin:0 0 10px;">${cleanText ? 'Review' : 'No written review'}</p>
            ${cleanText
              ? `<p style="color:#e6ece7; line-height:1.7; font-style:italic; margin:0;">"${safeText}"</p>`
              : `<p style="color:rgba(230,236,231,0.4); margin:0;">Stars only - counts toward the rating, but cannot be featured on the homepage.</p>`}
          </div>
          <div style="text-align:center; margin-top:28px;">
            <a href="${modLink}" style="display:inline-block; background:#d4a017; color:#0f1610; padding:14px 34px; font-size:.8rem; letter-spacing:.12em; text-transform:uppercase; text-decoration:none; font-weight:700;">Open to approve or reject</a>
          </div>
          <p style="margin-top:20px; font-size:.72rem; color:rgba(230,236,231,0.4); text-align:center; line-height:1.6;">
            Nothing is published until you approve it. This link is private to you.
          </p>
        </div>
      `,
    });
  } catch (err) {
    // The review is already stored as pending, so a failed email doesn't lose it.
    console.error('Review moderation email failed:', err);
  }

  return { statusCode: 200, body: JSON.stringify({ success: true }) };
};
