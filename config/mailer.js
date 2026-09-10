/**
 * Nodemailer configuration for sending emails.
 * If SMTP env vars are empty (development), emails are logged only.
 */
require('dotenv').config();
const nodemailer = require('nodemailer');

// Build transport only if SMTP credentials are provided
let transporter = null;

if (process.env.SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
  console.log('[mailer] SMTP transport configured.');
} else {
  console.log('[mailer] SMTP not configured - emails will be logged to console only.');
}

/**
 * Send an email. Falls back to console logging in dev.
 * @param {Object} options - {to, subject, html, text}
 */
async function sendMail(options) {
  if (!transporter) {
    console.log(`[mailer:DEV] To: ${options.to} | Subject: ${options.subject}`);
    console.log(`[mailer:DEV] Body: ${options.html || options.text}`);
    return { dev: true };
  }
  try {
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || '"Opportunity School Admin" <no-reply@opportunityschool.com>',
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text
    });
    return info;
  } catch (err) {
    console.error('[mailer] Send failed:', err.message);
    throw err;
  }
}

module.exports = { sendMail, transporter };
