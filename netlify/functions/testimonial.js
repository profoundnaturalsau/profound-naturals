const nodemailer = require('nodemailer');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let name, email, review;
  try {
    ({ name, email, review } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, body: 'Invalid request body' };
  }

  if (!name || !email || !review) {
    return { statusCode: 400, body: 'Missing required fields' };
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.zoho.com.au',
    port: 465,
    secure: true,
    auth: {
      user: process.env.ZOHO_USER,
      pass: process.env.ZOHO_PASS,
    },
    tls: { rejectUnauthorized: false },
  });

  // Fallback to global Zoho SMTP if AU host fails
  const fallbackTransporter = nodemailer.createTransport({
    host: 'smtp.zoho.com',
    port: 465,
    secure: true,
    auth: {
      user: process.env.ZOHO_USER,
      pass: process.env.ZOHO_PASS,
    },
    tls: { rejectUnauthorized: false },
  });

  const mailOptions = {
    from: `"Profound Naturals" <${process.env.ZOHO_USER}>`,
    to: process.env.ZOHO_USER,
    replyTo: email,
    subject: `New Testimonial Submission — ${name}`,
    html: `
      <div style="font-family:sans-serif; max-width:600px; margin:0 auto; padding:32px; background:#0f1610; color:#e6ece7;">
        <h2 style="color:#d4a017; font-size:1.2rem; margin-bottom:24px; letter-spacing:.1em; text-transform:uppercase;">
          New Testimonial Submission
        </h2>
        <table style="width:100%; border-collapse:collapse;">
          <tr>
            <td style="padding:10px 0; color:#a0d916; font-size:.8rem; letter-spacing:.1em; text-transform:uppercase; width:120px;">Name</td>
            <td style="padding:10px 0; color:#e6ece7;">${name}</td>
          </tr>
          <tr>
            <td style="padding:10px 0; color:#a0d916; font-size:.8rem; letter-spacing:.1em; text-transform:uppercase;">Email</td>
            <td style="padding:10px 0; color:#e6ece7;"><a href="mailto:${email}" style="color:#35b8d4;">${email}</a></td>
          </tr>
        </table>
        <div style="margin-top:24px; padding:20px; background:#141d15; border-left:3px solid #d4a017;">
          <p style="font-size:.8rem; color:#a0d916; letter-spacing:.1em; text-transform:uppercase; margin-bottom:12px;">Testimonial</p>
          <p style="color:#e6ece7; line-height:1.7; font-style:italic;">"${review}"</p>
        </div>
        <p style="margin-top:24px; font-size:.75rem; color:rgba(230,236,231,0.5);">
          Submitted via profoundnaturals.com.au
        </p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch {
    try {
      await fallbackTransporter.sendMail(mailOptions);
    } catch (err) {
      console.error('Testimonial email failed:', err);
      return { statusCode: 500, body: 'Failed to send email' };
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ success: true }),
  };
};
