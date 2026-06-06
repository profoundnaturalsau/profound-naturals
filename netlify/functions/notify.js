const nodemailer = require('nodemailer');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let email, productName, honeypot;
  try {
    ({ email, productName, honeypot } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request' }) };
  }

  if (honeypot) return { statusCode: 200, body: JSON.stringify({ success: true }) };

  if (!email || !email.includes('@')) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid email' }) };
  }

  // Try .com.au first, fall back to .com
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
        to: email,
        subject: `We'll notify you when ${productName} is back`,
        html: `
          <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#1a1a1a;">
            <h2 style="font-weight:300;font-size:28px;margin-bottom:8px;">You're on the list</h2>
            <p style="color:#555;line-height:1.7;">Interest in <strong>${productName}</strong> has been noted. As soon as it's back in stock, you'll be the first to know.</p>
            <p style="color:#555;line-height:1.7;">Thank you for your patience - good things are worth waiting for.</p>
            <p style="color:#555;margin-top:32px;">Profound Naturals</p>
          </div>
        `,
      });

      await transporter.sendMail({
        from: `"Profound Naturals" <${process.env.ZOHO_USER}>`,
        to: process.env.ZOHO_USER,
        subject: `Restock Request - ${productName}`,
        html: `<p><strong>${email}</strong> wants to be notified when <strong>${productName}</strong> is back in stock.</p>`,
      });

      return { statusCode: 200, body: JSON.stringify({ success: true }) };

    } catch (err) {
      console.error(`Failed with host ${host}:`, err.message);
      lastErr = err;
    }
  }

  return {
    statusCode: 500,
    body: JSON.stringify({ error: 'Failed to send email', detail: lastErr.message }),
  };
};
