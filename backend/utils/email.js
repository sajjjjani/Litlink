const axios = require('axios');
const nodemailer = require('nodemailer');
const { getHomepageUrl } = require('./publicUrl');

function isSendGridApiKey(key) {
  return key && key.startsWith('SG.');
}

async function sendViaSendGridApi(to, subject, html) {
  const key = process.env.EMAIL_PASSWORD;
  if (!key || !isSendGridApiKey(key)) return false;

  const from = process.env.EMAIL_FROM || 'Litlink <noreply@litlink.app>';
  const fromMatch = from.match(/(.*)\s*<(.*)>/);
  const fromName = fromMatch ? fromMatch[1].trim() : 'Litlink';
  const fromEmail = fromMatch ? fromMatch[2].trim() : from;

  try {
    await axios.post('https://api.sendgrid.com/v3/mail/send', {
      personalizations: [{ to: [{ email: to }] }],
      from: { email: fromEmail, name: fromName },
      subject,
      content: [{ type: 'text/html', value: html }]
    }, {
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });
    console.log(`✅ SendGrid API email sent to ${to}`);
    return true;
  } catch (error) {
    const detail = error.response?.data || error.message;
    console.error(`❌ SendGrid API error for ${to}:`, JSON.stringify(detail));
    return false;
  }
}

function createTransporter() {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASSWORD;

  if (!user || !pass) {
    console.error('❌ EMAIL_USER or EMAIL_PASSWORD not set');
    return null;
  }

  if (isSendGridApiKey(pass)) {
    console.log(`📧 Using SendGrid API (detected SG. key)`);
    return 'sendgrid-api';
  }

  const port = parseInt(process.env.EMAIL_PORT || '587');
  const secure = process.env.EMAIL_SECURE === 'true' || port === 465;

  const config = {
    host: process.env.EMAIL_HOST || 'smtp.sendgrid.net',
    port,
    secure,
    auth: { user, pass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000
  };

  if (!secure && port !== 465) {
    config.tls = { rejectUnauthorized: false };
    config.requireTLS = true;
  }

  console.log(`📧 Creating SMTP transporter: host=${config.host}, port=${config.port}`);
  return nodemailer.createTransport(config);
}

async function sendMail(to, subject, html) {
  const transporter = createTransporter();
  if (!transporter) return false;

  if (transporter === 'sendgrid-api') {
    return sendViaSendGridApi(to, subject, html);
  }

  try {
    const from = process.env.EMAIL_FROM || 'Litlink <noreply@litlink.app>';
    await transporter.sendMail({ from, to, subject, html });
    console.log(`✅ SMTP email sent to ${to}`);
    return true;
  } catch (error) {
    console.error(`❌ SMTP error for ${to}:`, error);
    return false;
  }
}

async function sendVerificationEmail(email, verificationCode, userName) {
  const verificationLink = getHomepageUrl('verify-email.html', { email });

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #2c1810; color: #f5e6d3; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .button {
                background-color: #2c1810;
                color: #f5e6d3 !important;
                padding: 12px 24px;
                text-decoration: none;
                border-radius: 5px;
                display: inline-block;
                margin: 20px 0;
                font-weight: bold;
            }
            .code {
                background-color: #f0f0f0;
                padding: 15px;
                border-radius: 5px;
                font-family: monospace;
                font-size: 18px;
                letter-spacing: 2px;
                text-align: center;
                margin: 20px 0;
            }
            .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 12px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>Welcome to Litlink! 📚</h1>
            </div>
            <div class="content">
                <h2>Hi ${userName},</h2>
                <p>Thank you for joining Litlink! To complete your registration, please verify your email address.</p>
                <p><strong>Click the button below to verify your email:</strong></p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${verificationLink}" class="button">Verify My Email</a>
                </div>
                <p>Or enter this verification code on our website:</p>
                <div class="code">${verificationCode}</div>
                <p>This verification link will expire in 30 minutes.</p>
                <p>If you didn't create an account with Litlink, please ignore this email.</p>
                <div class="footer">
                    <p>Happy reading!</p>
                    <p>The Litlink Team</p>
                </div>
            </div>
        </div>
    </body>
    </html>
  `;

  return sendMail(email, 'Verify Your Email - Litlink', html);
}

async function sendPasswordResetEmail(email, otp, userName) {
  const resetLink = getHomepageUrl('verify-otp.html', { email });

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #2c1810; color: #f5e6d3; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .button {
                background-color: #2c1810;
                color: #f5e6d3 !important;
                padding: 12px 24px;
                text-decoration: none;
                border-radius: 5px;
                display: inline-block;
                margin: 20px 0;
                font-weight: bold;
            }
            .code {
                background-color: #f0f0f0;
                padding: 15px;
                border-radius: 5px;
                font-family: monospace;
                font-size: 18px;
                letter-spacing: 2px;
                text-align: center;
                margin: 20px 0;
            }
            .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 12px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>Password Reset Request 🔐</h1>
            </div>
            <div class="content">
                <h2>Hi ${userName || 'there'},</h2>
                <p>We received a request to reset your password for your Litlink account.</p>
                <p><strong>Click the button below to reset your password:</strong></p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${resetLink}" class="button">Reset My Password</a>
                </div>
                <p>Or enter this OTP on our website:</p>
                <div class="code">${otp}</div>
                <p>This OTP will expire in 15 minutes.</p>
                <p><strong>If you didn't request a password reset, please ignore this email.</strong></p>
                <div class="footer">
                    <p>The Litlink Team</p>
                </div>
            </div>
        </div>
    </body>
    </html>
  `;

  return sendMail(email, 'Reset Your Password - Litlink', html);
}

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail
};