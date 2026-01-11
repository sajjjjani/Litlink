const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

async function sendVerificationEmail(email, verificationCode, userName) {
  try {
    const verificationLink = `http://localhost:5500/verify-email.html?email=${encodeURIComponent(email)}&code=${verificationCode}`;
    
    const mailOptions = {
      from: process.env.EMAIL_FROM || `"Litlink" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Verify Your Email - Litlink',
      html: `
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
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`📧 Verification email sent to ${email}`);
    return true;
  } catch (error) {
    console.error('❌ Error sending verification email:', error);
    return false;
  }
}

async function sendPasswordResetEmail(email, otp, userName) {
  try {
    const resetLink = `http://localhost:5500/verify-otp.html?email=${encodeURIComponent(email)}&otp=${otp}`;
    
    const mailOptions = {
      from: process.env.EMAIL_FROM || `"Litlink" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Reset Your Password - Litlink',
      html: `
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
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`📧 Password reset email sent to ${email}`);
    return true;
  } catch (error) {
    console.error('❌ Error sending password reset email:', error);
    return false;
  }
}

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail
};

