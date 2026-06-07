const nodemailer = require('nodemailer');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let name, email, phone, notes, formula, price;
  try {
    ({ name, email, phone, notes, formula, price } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, body: 'Invalid request body' };
  }

  if (!name || !email || !formula || !formula.length) {
    return { statusCode: 400, body: 'Missing required fields' };
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.zoho.com.au',
    port: 465,
    secure: true,
    auth: { user: process.env.ZOHO_USER, pass: process.env.ZOHO_PASS },
    tls: { rejectUnauthorized: false },
  });

  const fallbackTransporter = nodemailer.createTransport({
    host: 'smtp.zoho.com',
    port: 465,
    secure: true,
    auth: { user: process.env.ZOHO_USER, pass: process.env.ZOHO_PASS },
    tls: { rejectUnauthorized: false },
  });

  const formulaRows = formula.map(line =>
    `<tr>
      <td style="padding:8px 0; color:#e6ece7; border-bottom:1px solid rgba(255,255,255,0.06);">${line}</td>
    </tr>`
  ).join('');

  const mailOptions = {
    from: `"Profound Naturals" <${process.env.ZOHO_USER}>`,
    to: process.env.ZOHO_USER,
    replyTo: email,
    subject: `Custom Formula Request — ${name}`,
    html: `
      <div style="font-family:sans-serif; max-width:600px; margin:0 auto; padding:32px; background:#0f1610; color:#e6ece7;">
        <h2 style="color:#8cc40f; font-size:1.1rem; margin-bottom:4px; letter-spacing:.1em; text-transform:uppercase;">
          Custom Scent Formula Request
        </h2>
        <p style="font-size:.75rem; color:rgba(230,236,231,0.5); margin-bottom:28px; letter-spacing:.06em;">profoundnaturals.online</p>

        <table style="width:100%; border-collapse:collapse; margin-bottom:24px;">
          <tr>
            <td style="padding:8px 0; color:#a0d916; font-size:.75rem; letter-spacing:.1em; text-transform:uppercase; width:100px;">Name</td>
            <td style="padding:8px 0; color:#e6ece7;">${name}</td>
          </tr>
          <tr>
            <td style="padding:8px 0; color:#a0d916; font-size:.75rem; letter-spacing:.1em; text-transform:uppercase;">Email</td>
            <td style="padding:8px 0;"><a href="mailto:${email}" style="color:#35b8d4;">${email}</a></td>
          </tr>
          ${phone ? `<tr>
            <td style="padding:8px 0; color:#a0d916; font-size:.75rem; letter-spacing:.1em; text-transform:uppercase;">Phone</td>
            <td style="padding:8px 0; color:#e6ece7;">${phone}</td>
          </tr>` : ''}
        </table>

        <div style="background:#141d15; padding:20px 24px; border-left:3px solid #8cc40f; margin-bottom:20px;">
          <p style="font-size:.7rem; color:#a0d916; letter-spacing:.12em; text-transform:uppercase; margin-bottom:12px;">
            Formula — 50ml Eau de Parfum · 30% Concentrate
          </p>
          <table style="width:100%; border-collapse:collapse;">
            ${formulaRows}
          </table>
          <p style="margin-top:14px; font-size:.85rem; color:#d4a017; font-weight:500;">
            Estimated Price: $${price}
          </p>
        </div>

        ${notes ? `
        <div style="padding:16px 20px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); margin-bottom:20px;">
          <p style="font-size:.7rem; color:#a0d916; letter-spacing:.1em; text-transform:uppercase; margin-bottom:8px;">Notes</p>
          <p style="color:#e6ece7; font-size:.85rem; line-height:1.7; font-style:italic;">${notes}</p>
        </div>` : ''}

        <p style="font-size:.7rem; color:rgba(230,236,231,0.4); margin-top:24px;">
          Submitted via the Profound Naturals Custom Scent Builder
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
      console.error('Formula request email failed:', err);
      return { statusCode: 500, body: 'Failed to send email' };
    }
  }

  return { statusCode: 200, body: JSON.stringify({ success: true }) };
};
