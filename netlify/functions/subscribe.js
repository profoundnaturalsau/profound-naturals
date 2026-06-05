const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.zoho.com.au',
  port: 465,
  secure: true,
  auth: {
    user: process.env.ZOHO_USER,
    pass: process.env.ZOHO_PASS,
  },
});

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let email;
  try {
    ({ email } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request' }) };
  }

  if (!email || !email.includes('@')) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid email' }) };
  }

  try {
    // Welcome email to subscriber
    await transporter.sendMail({
      from: `"Profound Naturals" <${process.env.ZOHO_USER}>`,
      to: email,
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
    await transporter.sendMail({
      from: `"Profound Naturals" <${process.env.ZOHO_USER}>`,
      to: process.env.ZOHO_USER,
      subject: `New Newsletter Subscriber: ${email}`,
      html: `<p>New subscriber: <strong>${email}</strong></p>`,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true }),
    };
  } catch (err) {
    console.error('Subscribe error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to send email' }),
    };
  }
};
