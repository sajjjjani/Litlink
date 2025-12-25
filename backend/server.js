const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const User = require('./models/User');
const Verification = require('./models/Verification');

const app = express();

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5500', 'http://127.0.0.1:5500'],
  credentials: true
}));
app.use(express.json());

// Email transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

// ===== EMAIL FUNCTIONS =====
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
                        <p><small>This email was sent from Litlink - Where Readers Connect Through Stories</small></p>
                    </div>
                </div>
            </div>
        </body>
        </html>
      `
    };

    const info = await transporter.sendMail(mailOptions);
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
                        <p><small>This email was sent from Litlink - Where Readers Connect Through Stories</small></p>
                    </div>
                </div>
            </div>
        </body>
        </html>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`📧 Password reset email sent to ${email}`);
    return true;
  } catch (error) {
    console.error('❌ Error sending password reset email:', error);
    return false;
  }
}

// ===== DATABASE CONNECTION =====
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ MongoDB Connected Successfully');
    
    // Count total users
    const userCount = await User.countDocuments();
    console.log(`📊 Total Users in Database: ${userCount}`);
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error.message);
    process.exit(1);
  }
};

// ===== HELPER FUNCTIONS =====
function generateCode(length = 6) {
  return Math.floor(Math.pow(10, length - 1) + Math.random() * 9 * Math.pow(10, length - 1)).toString();
}

// ===== API ROUTES =====

// Health check
app.get('/api/health', async (req, res) => {
  try {
    const userCount = await User.countDocuments();
    const verificationCount = await Verification.countDocuments();
    
    res.json({ 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      database: 'MongoDB',
      usersCount: userCount,
      verificationsCount: verificationCount,
      emailConfigured: !!process.env.EMAIL_USER
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'ERROR', 
      message: error.message 
    });
  }
});

// Debug endpoint to see all users
app.get('/api/debug/users', async (req, res) => {
  try {
    const users = await User.find({}, '-password');
    
    res.json({
      success: true,
      count: users.length,
      users: users
    });
  } catch (error) {
    console.error('Debug users error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
});

// Signup
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    console.log('📝 Signup request:', { name, email });
    
    // Validation
    if (!name || !email || !password) {
      return res.json({ 
        success: false, 
        message: 'All fields are required' 
      });
    }
    
    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      console.log(`❌ User already exists: ${email}`);
      return res.json({ 
        success: false, 
        message: 'Email already registered. Please login or use a different email.' 
      });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Generate verification code
    const verificationCode = generateCode(6);
    
    // Create user with verification code
    const user = new User({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      isVerified: false,
      verificationCode,
      verificationExpiry: new Date(Date.now() + 30 * 60 * 1000) // 30 minutes
    });
    
    await user.save();
    
    // Store verification code separately for easy lookup
    const verification = new Verification({
      email: email.toLowerCase(),
      code: verificationCode,
      type: 'email_verification',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000)
    });
    
    await verification.save();
    
    console.log(`📧 Generated verification code for ${email}: ${verificationCode}`);
    console.log(`👤 New user created: ${email}`);
    
    // Send verification email
    const emailSent = await sendVerificationEmail(email, verificationCode, name);
    
    if (!emailSent) {
      console.warn('⚠️ Email sending failed');
      return res.json({
        success: true,
        message: 'Account created but verification email failed to send. Please contact support.',
        verificationCode: verificationCode,
        user: {
          id: user._id,
          name: user.name,
          email: user.email
        }
      });
    }
    
    res.json({
      success: true,
      message: 'Account created successfully! Please check your email for verification link.',
      verificationCode: verificationCode, // For testing
      user: {
        id: user._id,
        name: user.name,
        email: user.email
      }
    });
    
  } catch (error) {
    console.error('❌ Signup error:', error);
    
    // Handle duplicate key error
    if (error.code === 11000) {
      return res.json({ 
        success: false, 
        message: 'Email already registered.' 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Server error occurred. Please try again.' 
    });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    console.log('🔑 Login attempt for:', email);
    
    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      console.log(`❌ User not found: ${email}`);
      return res.json({ 
        success: false, 
        message: 'Invalid email or password' 
      });
    }
    
    console.log(`✅ User found: ${user.email}, Verified: ${user.isVerified}`);
    
    // Check if email is verified
    if (!user.isVerified) {
      console.log(`⚠️ User not verified: ${user.email}`);
      return res.json({
        success: false,
        requiresVerification: true,
        message: 'Please verify your email first. Check your inbox for the verification link.'
      });
    }
    
    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password);
    
    if (!isValidPassword) {
      console.log(`❌ Invalid password for: ${email}`);
      return res.json({ 
        success: false, 
        message: 'Invalid email or password' 
      });
    }
    
    // Create JWT token
    const token = jwt.sign(
      { 
        userId: user._id, 
        email: user.email 
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    console.log(`✅ Login successful for: ${email}`);
    
    res.json({
      success: true,
      message: 'Login successful!',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email
      },
      redirectTo: 'profile.html'
    });
    
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error occurred. Please try again.' 
    });
  }
});

// Verify Email
app.post('/api/auth/verify-email', async (req, res) => {
  try {
    const { email, code } = req.body;
    
    console.log('📧 Verify email request:', { email, code });
    
    // Find verification code
    const verification = await Verification.findOne({
      email: email.toLowerCase(),
      code: code,
      type: 'email_verification'
    });
    
    if (!verification) {
      console.log(`❌ No verification code found for: ${email}`);
      return res.json({ 
        success: false, 
        message: 'Invalid verification code' 
      });
    }
    
    // Check if expired
    if (verification.expiresAt < new Date()) {
      await Verification.deleteOne({ _id: verification._id });
      console.log(`❌ Verification code expired for: ${email}`);
      return res.json({ 
        success: false, 
        message: 'Verification code has expired. Please request a new one.' 
      });
    }
    
    // Find and update user
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      console.log(`❌ User not found: ${email}`);
      return res.json({
        success: false,
        message: 'User not found. Please sign up again.'
      });
    }
    
    // Update user verification status
    user.isVerified = true;
    user.verificationCode = null;
    user.verificationExpiry = null;
    await user.save();
    
    // Delete verification code
    await Verification.deleteOne({ _id: verification._id });
    
    console.log(`✅ Email verified for: ${email}`);
    
    res.json({
      success: true,
      message: 'Email verified successfully! You can now login to your account.',
      user: {
        email: user.email,
        isVerified: true
      }
    });
    
  } catch (error) {
    console.error('❌ Verify email error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error occurred. Please try again.' 
    });
  }
});

// Resend Verification
app.post('/api/auth/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;
    
    console.log('🔄 Resend verification request:', { email });
    
    // Check if user exists
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.json({ 
        success: false, 
        message: 'Email not found' 
      });
    }
    
    if (user.isVerified) {
      return res.json({
        success: false,
        message: 'Email is already verified'
      });
    }
    
    // Generate new verification code
    const verificationCode = generateCode(6);
    
    // Update user verification info
    user.verificationCode = verificationCode;
    user.verificationExpiry = new Date(Date.now() + 30 * 60 * 1000);
    await user.save();
    
    // Create new verification record
    const verification = new Verification({
      email: email.toLowerCase(),
      code: verificationCode,
      type: 'email_verification',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000)
    });
    
    await verification.save();
    
    console.log(`📧 New verification code for ${email}: ${verificationCode}`);
    
    // Send verification email
    const emailSent = await sendVerificationEmail(email, verificationCode, user.name);
    
    if (!emailSent) {
      console.warn('⚠️ Email sending failed');
    }
    
    res.json({
      success: true,
      message: 'New verification email sent successfully.',
      verificationCode: verificationCode
    });
    
  } catch (error) {
    console.error('❌ Resend verification error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error occurred. Please try again.' 
    });
  }
});

// Forgot Password
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    console.log('🔐 Forgot password request:', { email });
    
    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.json({ 
        success: false, 
        message: 'Email not found. Please check your email address.' 
      });
    }
    
    // Generate OTP
    const otp = generateCode(6);
    
    // Create verification record
    const verification = new Verification({
      email: email.toLowerCase(),
      code: otp,
      type: 'password_reset',
      expiresAt: new Date(Date.now() + 15 * 60 * 1000) // 15 minutes
    });
    
    await verification.save();
    
    console.log(`📧 Generated OTP for ${email}: ${otp}`);
    
    // Send password reset email
    const emailSent = await sendPasswordResetEmail(email, otp, user.name);
    
    if (!emailSent) {
      console.warn('⚠️ Email sending failed');
      return res.json({
        success: false,
        message: 'Failed to send reset email. Please try again later.'
      });
    }
    
    res.json({
      success: true,
      message: 'Password reset email sent successfully! Please check your inbox.',
      otp: otp // For testing only
    });
    
  } catch (error) {
    console.error('❌ Forgot password error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error occurred. Please try again.' 
    });
  }
});

// Verify OTP
app.post('/api/auth/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    
    console.log('🔢 Verify OTP request:', { email, otp });
    
    // Find verification
    const verification = await Verification.findOne({
      email: email.toLowerCase(),
      code: otp,
      type: 'password_reset'
    });
    
    if (!verification) {
      return res.json({ 
        success: false, 
        message: 'Invalid OTP' 
      });
    }
    
    // Check if expired
    if (verification.expiresAt < new Date()) {
      await Verification.deleteOne({ _id: verification._id });
      return res.json({ 
        success: false, 
        message: 'OTP has expired' 
      });
    }
    
    // OTP verified successfully
    await Verification.deleteOne({ _id: verification._id });
    
    console.log(`✅ OTP verified for: ${email}`);
    
    res.json({
      success: true,
      message: 'OTP verified successfully'
    });
    
  } catch (error) {
    console.error('❌ Verify OTP error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
});

// Reset Password
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { email, newPassword } = req.body;
    
    console.log('🔄 Reset password request:', { email });
    
    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      return res.json({ 
        success: false, 
        message: 'User not found' 
      });
    }
    
    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    user.resetToken = null;
    user.resetTokenExpiry = null;
    await user.save();
    
    console.log(`✅ Password reset for: ${email}`);
    
    res.json({
      success: true,
      message: 'Password reset successfully! You can now login with your new password.'
    });
    
  } catch (error) {
    console.error('❌ Reset password error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
});

// Delete Account
app.delete('/api/auth/delete-account', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    console.log('🗑️ Delete account request for:', email);
    
    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      return res.json({ 
        success: false, 
        message: 'User not found' 
      });
    }
    
    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    
    if (!isValidPassword) {
      return res.json({ 
        success: false, 
        message: 'Invalid password' 
      });
    }
    
    // Delete user
    await User.deleteOne({ _id: user._id });
    
    // Delete related verifications
    await Verification.deleteMany({ email: email.toLowerCase() });
    
    console.log(`✅ Account deleted for: ${email}`);
    
    res.json({
      success: true,
      message: 'Account deleted successfully',
      user: {
        email: user.email,
        name: user.name
      }
    });
    
  } catch (error) {
    console.error('❌ Delete account error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error occurred' 
    });
  }
});

// Admin delete endpoint (for testing)
app.delete('/api/auth/admin/delete-user', async (req, res) => {
  try {
    const { email } = req.body;
    
    console.log('👑 Admin delete request for:', email);
    
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      return res.json({ 
        success: false, 
        message: 'User not found' 
      });
    }
    
    // Delete user
    await User.deleteOne({ _id: user._id });
    
    // Delete related verifications
    await Verification.deleteMany({ email: email.toLowerCase() });
    
    console.log(`✅ Admin deleted account: ${email}`);
    
    res.json({
      success: true,
      message: 'User deleted by admin',
      user: {
        email: user.email,
        name: user.name
      }
    });
    
  } catch (error) {
    console.error('❌ Admin delete error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
});

// ===== START SERVER =====
const PORT = process.env.PORT || 5002;

const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDB();
    
    // Start Express server
    app.listen(PORT, () => {
      console.log('='.repeat(60));
      console.log('🚀 Litlink Backend Server Started!');
      console.log('='.repeat(60));
      console.log(`📍 Server URL: http://localhost:${PORT}`);
      console.log(`🔐 API Base: http://localhost:${PORT}/api`);
      console.log(`💾 Database: MongoDB`);
      console.log(`📧 Email: ${process.env.EMAIL_USER ? '✅ Configured' : '❌ NOT Configured'}`);
      console.log('='.repeat(60));
      console.log('📝 Available Endpoints:');
      console.log('   POST /api/auth/signup');
      console.log('   POST /api/auth/login');
      console.log('   POST /api/auth/forgot-password');
      console.log('   POST /api/auth/verify-email');
      console.log('   POST /api/auth/resend-verification');
      console.log('   POST /api/auth/verify-otp');
      console.log('   POST /api/auth/reset-password');
      console.log('   DELETE /api/auth/delete-account');
      console.log('   DELETE /api/auth/admin/delete-user');
      console.log('   GET  /api/health');
      console.log('   GET  /api/debug/users');
      console.log('='.repeat(60));
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();