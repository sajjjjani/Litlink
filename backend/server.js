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

// Import middleware and routes
const authenticate = require('./middleware/auth');
const adminRoutes = require('./routes/admin.routes');

const app = express();

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5500', 'http://127.0.0.1:5500', 'http://localhost:8000', 'http://127.0.0.1:8000', 'http://localhost:5000', 'http://127.0.0.1:5000'],
  credentials: true
}));
app.use(express.json({ limit: '10mb' })); // Increased for profile picture data URLs

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
    
    const userCount = await User.countDocuments();
    console.log(`📊 Total Users in Database: ${userCount}`);
    
    const adminExists = await User.findOne({ email: 'admin@litlink.com' });
    if (!adminExists) {
      console.log('⚠️ Admin user not found. Run: node seed-admin.js');
    } else {
      console.log('✅ Admin user exists');
    }
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

// Debug endpoint
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

// Enhanced Signup with profile fields
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, password, username, phone, location } = req.body;
    
    console.log('📝 Signup request:', { name, email });
    
    if (!name || !email || !password) {
      return res.json({ 
        success: false, 
        message: 'All fields are required' 
      });
    }
    
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      console.log(`❌ User already exists: ${email}`);
      return res.json({ 
        success: false, 
        message: 'Email already registered. Please login or use a different email.' 
      });
    }
    
    // Check if username is taken
    if (username) {
      const existingUsername = await User.findOne({ username: username.toLowerCase() });
      if (existingUsername) {
        return res.json({
          success: false,
          message: 'Username already taken. Please choose another one.'
        });
      }
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationCode = generateCode(6);
    
    const user = new User({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      username: username || email.split('@')[0],
      phone: phone || '',
      location: location || '',
      isVerified: false,
      verificationCode,
      verificationExpiry: new Date(Date.now() + 30 * 60 * 1000),
      // Set default profile fields
      bio: 'Welcome to Litlink! Start your reading journey here.',
      profilePicture: '',
      readingGoal: 12,
      favoriteGenres: [],
      favoriteAuthors: [],
      favoriteBooks: [],
      preferredFormats: ['Paperback', 'E-book'],
      discussionPreferences: ['Online Forums'],
      receiveRecommendations: true
    });
    
    await user.save();
    
    const verification = new Verification({
      email: email.toLowerCase(),
      code: verificationCode,
      type: 'email_verification',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000)
    });
    
    await verification.save();
    
    console.log(`📧 Generated verification code for ${email}: ${verificationCode}`);
    console.log(`👤 New user created: ${email}`, { 
      username: user.username,
      hasProfileFields: true 
    });
    
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
          email: user.email,
          username: user.username
        }
      });
    }
    
    res.json({
      success: true,
      message: 'Account created successfully! Please check your email for verification link.',
      verificationCode: verificationCode,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        username: user.username
      }
    });
    
  } catch (error) {
    console.error('❌ Signup error:', error);
    
    if (error.code === 11000) {
      if (error.keyPattern?.email) {
        return res.json({ 
          success: false, 
          message: 'Email already registered.' 
        });
      } else if (error.keyPattern?.username) {
        return res.json({
          success: false,
          message: 'Username already taken.'
        });
      }
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
    
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      console.log(`❌ User not found: ${email}`);
      return res.json({ 
        success: false, 
        message: 'Invalid email or password' 
      });
    }
    
    const isValidPassword = await bcrypt.compare(password, user.password);
    
    if (!isValidPassword) {
      console.log(`❌ Invalid password for: ${email}`);
      return res.json({ 
        success: false, 
        message: 'Invalid email or password' 
      });
    }
    
    if (user.isBanned) {
      console.log(`⛔ Banned user attempt: ${email}`);
      return res.json({
        success: false,
        message: 'Account has been banned. Contact support for more information.',
        banReason: user.banReason || 'Violation of terms of service'
      });
    }
    
    if (!user.isAdmin && !user.isVerified) {
      console.log(`⚠️ User not verified: ${email}`);
      return res.json({
        success: false,
        requiresVerification: true,
        message: 'Please verify your email first. Check your inbox for the verification link.'
      });
    }
    
    if (user.isAdmin && !user.isVerified) {
      console.log(`🔧 Auto-verifying admin: ${email}`);
      user.isVerified = true;
      await user.save();
    }
    
    const token = jwt.sign(
      { 
        userId: user._id, 
        email: user.email,
        isAdmin: user.isAdmin || false,
        adminLevel: user.adminLevel || 'none'
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    user.lastLogin = new Date();
    await user.save();

    console.log(`✅ Login successful for: ${email} ${user.isAdmin ? '(Admin)' : ''}`);

    // Default redirect for regular users is Profile page
    let redirectPath = '../Profile/profile.html';
    
    if (user.isAdmin) {
      redirectPath = '../Admin%20Dashboard/admin.html';
    }
    
    console.log(`📄 Redirecting ${user.isAdmin ? 'ADMIN' : 'USER'} to: ${redirectPath}`);
    
    // Prepare user response with all profile fields
    const userResponse = {
      id: user._id,
      name: user.name,
      email: user.email,
      username: user.username || user.email?.split('@')[0] || 'user',
      phone: user.phone || '',
      profilePicture: user.profilePicture,
      bio: user.bio,
      location: user.location,
      pronouns: user.pronouns,
      isAdmin: user.isAdmin || false,
      adminLevel: user.adminLevel || 'none',
      adminPermissions: user.adminPermissions || [],
      isVerified: user.isVerified,
      isBanned: user.isBanned,
      
      // Reading preferences
      readingHabit: user.readingHabit || 'Not set',
      readingGoal: user.readingGoal || 12,
      favoriteGenres: user.favoriteGenres || [],
      favoriteAuthors: user.favoriteAuthors || [],
      favoriteBooks: user.favoriteBooks || [],
      preferredFormats: user.preferredFormats || [],
      discussionPreferences: user.discussionPreferences || [],
      receiveRecommendations: user.receiveRecommendations !== undefined ? user.receiveRecommendations : true,
      
      // Stats
      booksRead: user.booksRead || [],
      following: user.following || [],
      followers: user.followers || [],
      
      // Timestamps
      createdAt: user.createdAt,
      lastLogin: user.lastLogin
    };
    
    res.json({
      success: true,
      message: 'Login successful!',
      token,
      user: userResponse,
      redirectTo: redirectPath
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
    
    if (verification.expiresAt < new Date()) {
      await Verification.deleteOne({ _id: verification._id });
      console.log(`❌ Verification code expired for: ${email}`);
      return res.json({ 
        success: false, 
        message: 'Verification code has expired. Please request a new one.' 
      });
    }
    
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      console.log(`❌ User not found: ${email}`);
      return res.json({
        success: false,
        message: 'User not found. Please sign up again.'
      });
    }
    
    user.isVerified = true;
    user.verificationCode = null;
    user.verificationExpiry = null;
    await user.save();
    
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
    
    const verificationCode = generateCode(6);
    
    user.verificationCode = verificationCode;
    user.verificationExpiry = new Date(Date.now() + 30 * 60 * 1000);
    await user.save();
    
    const verification = new Verification({
      email: email.toLowerCase(),
      code: verificationCode,
      type: 'email_verification',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000)
    });
    
    await verification.save();
    
    console.log(`📧 New verification code for ${email}: ${verificationCode}`);
    
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
    
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.json({ 
        success: false, 
        message: 'Email not found. Please check your email address.' 
      });
    }
    
    const otp = generateCode(6);
    
    const verification = new Verification({
      email: email.toLowerCase(),
      code: otp,
      type: 'password_reset',
      expiresAt: new Date(Date.now() + 15 * 60 * 1000)
    });
    
    await verification.save();
    
    console.log(`📧 Generated OTP for ${email}: ${otp}`);
    
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
      otp: otp
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
    
    if (verification.expiresAt < new Date()) {
      await Verification.deleteOne({ _id: verification._id });
      return res.json({ 
        success: false, 
        message: 'OTP has expired' 
      });
    }
    
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
    
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      return res.json({ 
        success: false, 
        message: 'User not found' 
      });
    }
    
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
    
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      return res.json({ 
        success: false, 
        message: 'User not found' 
      });
    }
    
    const isValidPassword = await bcrypt.compare(password, user.password);
    
    if (!isValidPassword) {
      return res.json({ 
        success: false, 
        message: 'Invalid password' 
      });
    }
    
    await User.deleteOne({ _id: user._id });
    await Verification.deleteMany({ email: email.toLowerCase() });
    
    console.log(`✅ Account deleted for: ${user.email}`);
    
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

// Admin delete endpoint
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
    
    await User.deleteOne({ _id: user._id });
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

// ===== USER PROFILE ROUTES =====

// Get user profile - Enhanced version
app.get('/api/auth/user/:userId', authenticate, async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (userId !== req.userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to access this profile'
      });
    }
    
    const user = await User.findById(userId)
      .select('-password -verificationCode -resetToken');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    console.log(`✅ Profile fetched for: ${user.email}`);
    
    // Prepare complete user response
    const userResponse = {
      id: user._id,
      name: user.name,
      username: user.username || user.email?.split('@')[0] || 'user',
      email: user.email,
      phone: user.phone || '',
      profilePicture: user.profilePicture,
      bio: user.bio,
      location: user.location,
      pronouns: user.pronouns,
      isAdmin: user.isAdmin || false,
      adminLevel: user.adminLevel || 'none',
      adminPermissions: user.adminPermissions || [],
      
      // Reading preferences
      readingHabit: user.readingHabit || 'Not set',
      readingGoal: user.readingGoal || 12,
      favoriteGenres: user.favoriteGenres || [],
      favoriteAuthors: user.favoriteAuthors || [],
      favoriteBooks: user.favoriteBooks || [],
      preferredFormats: user.preferredFormats || [],
      discussionPreferences: user.discussionPreferences || [],
      receiveRecommendations: user.receiveRecommendations !== undefined ? user.receiveRecommendations : true,
      
      // Stats
      booksRead: user.booksRead || [],
      following: user.following || [],
      followers: user.followers || [],
      
      // Timestamps
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      lastLogin: user.lastLogin
    };
    
    res.json({
      success: true,
      user: userResponse
    });
    
  } catch (error) {
    console.error('❌ Get user profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Update user profile - Enhanced version
app.put('/api/auth/user/:userId', authenticate, async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (userId !== req.userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to update this profile'
      });
    }
    
    const {
      name,
      username,
      bio,
      location,
      pronouns,
      profilePicture,
      readingGoal,
      readingHabit,
      preferredFormats,
      discussionPreferences,
      receiveRecommendations,
      favoriteGenres,
      favoriteAuthors,
      favoriteBooks,
      phone
    } = req.body;
    
    const updateData = {};
    
    // Basic info
    if (name !== undefined) updateData.name = name;
    if (username !== undefined) updateData.username = username;
    if (bio !== undefined) updateData.bio = bio;
    if (location !== undefined) updateData.location = location;
    if (pronouns !== undefined) updateData.pronouns = pronouns;
    if (profilePicture !== undefined) updateData.profilePicture = profilePicture;
    if (phone !== undefined) updateData.phone = phone;
    
    // Reading stats
    if (readingGoal !== undefined) updateData.readingGoal = parseInt(readingGoal) || 12;
    if (readingHabit !== undefined) updateData.readingHabit = readingHabit;
    
    // Preferences
    if (preferredFormats !== undefined) updateData.preferredFormats = preferredFormats;
    if (discussionPreferences !== undefined) updateData.discussionPreferences = discussionPreferences;
    if (receiveRecommendations !== undefined) updateData.receiveRecommendations = receiveRecommendations;
    
    // Favorites
    if (favoriteGenres !== undefined) updateData.favoriteGenres = favoriteGenres;
    if (favoriteAuthors !== undefined) updateData.favoriteAuthors = favoriteAuthors;
    if (favoriteBooks !== undefined) updateData.favoriteBooks = favoriteBooks;
    
    const user = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true, runValidators: true }
    ).select('-password -verificationCode -resetToken');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    console.log(`✅ Profile updated for: ${user.email}`, { 
      updatedFields: Object.keys(updateData),
      hasPicture: !!updateData.profilePicture 
    });
    
    // Prepare complete user response
    const userResponse = {
      id: user._id,
      name: user.name,
      username: user.username || user.email?.split('@')[0] || 'user',
      email: user.email,
      phone: user.phone || '',
      profilePicture: user.profilePicture,
      bio: user.bio,
      location: user.location,
      pronouns: user.pronouns,
      isAdmin: user.isAdmin || false,
      adminLevel: user.adminLevel || 'none',
      adminPermissions: user.adminPermissions || [],
      
      // Reading preferences
      readingHabit: user.readingHabit || 'Not set',
      readingGoal: user.readingGoal || 12,
      favoriteGenres: user.favoriteGenres || [],
      favoriteAuthors: user.favoriteAuthors || [],
      favoriteBooks: user.favoriteBooks || [],
      preferredFormats: user.preferredFormats || [],
      discussionPreferences: user.discussionPreferences || [],
      receiveRecommendations: user.receiveRecommendations !== undefined ? user.receiveRecommendations : true,
      
      // Stats
      booksRead: user.booksRead || [],
      following: user.following || [],
      followers: user.followers || [],
      
      // Timestamps
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      lastLogin: user.lastLogin
    };
    
    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: userResponse
    });
    
  } catch (error) {
    console.error('❌ Update profile error:', error);
    
    // Handle duplicate username
    if (error.code === 11000 && error.keyPattern?.username) {
      return res.status(400).json({
        success: false,
        message: 'Username already taken'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Delete user account
app.delete('/api/auth/user/:userId', authenticate, async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (userId !== req.userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to delete this account'
      });
    }
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    await User.deleteOne({ _id: userId });
    await Verification.deleteMany({ email: user.email.toLowerCase() });
    
    console.log(`✅ Account deleted for: ${user.email}`);
    
    res.json({
      success: true,
      message: 'Account deleted successfully'
    });
    
  } catch (error) {
    console.error('❌ Delete account error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// ===== DASHBOARD API ENDPOINT =====

app.get('/api/dashboard/:userId', authenticate, async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (userId !== req.userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access'
      });
    }
    
    const user = await User.findById(userId)
      .select('-password -verificationCode -resetToken');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    console.log(`📊 Loading dashboard for: ${user.email}`);
    
    const dashboardData = {
      user: {
        name: user.name,
        email: user.email,
        username: user.username || user.email?.split('@')[0] || 'user',
        profilePicture: user.profilePicture || `https://i.pravatar.cc/80?img=1`,
        favoriteGenres: user.favoriteGenres || ['Magical Realism'],
        bio: user.bio,
        location: user.location,
        readingGoal: user.readingGoal || 12
      },
      
      stats: {
        totalMatches: 4,
        activeChats: 3,
        joinedBoards: 2,
        booksRead: user.booksRead?.length || 0
      },
      
      topMatches: [
        {
          id: 'match1',
          name: 'Elena R.',
          profileImage: 'https://i.pravatar.cc/150?img=5',
          tags: ['Fantasy', 'Sci-Fi'],
          sharedBooks: 32,
          isConnected: false
        },
        {
          id: 'match2',
          name: 'Marcus Chen',
          profileImage: 'https://i.pravatar.cc/150?img=12',
          tags: ['Mystery', 'Thriller'],
          sharedBooks: 28,
          isConnected: false
        },
        {
          id: 'match3',
          name: 'Sarah J.',
          profileImage: 'https://i.pravatar.cc/150?img=9',
          tags: ['Romance', 'YA'],
          sharedBooks: 25,
          isConnected: false
        },
        {
          id: 'match4',
          name: 'David K.',
          profileImage: 'https://i.pravatar.cc/150?img=14',
          tags: ['History', 'Biographies'],
          sharedBooks: 21,
          isConnected: false
        }
      ],
      
      trendingBoards: [
        {
          id: 'board1',
          name: 'Fantasy Worlds',
          icon: '✨',
          color: 'purple',
          activeUsers: 15000,
          isJoined: false
        },
        {
          id: 'board2',
          name: 'Modern Romance',
          icon: '💕',
          color: 'pink',
          activeUsers: 9000,
          isJoined: false
        },
        {
          id: 'board3',
          name: 'Mystery & Thriller',
          icon: '🔍',
          color: 'blue',
          activeUsers: 21000,
          isJoined: false
        },
        {
          id: 'board4',
          name: 'Literary Fiction',
          icon: '✒️',
          color: 'brown',
          activeUsers: 6000,
          isJoined: false
        },
        {
          id: 'board5',
          name: 'Young Adult',
          icon: '🌹',
          color: 'teal',
          activeUsers: 12000,
          isJoined: false
        },
        {
          id: 'board6',
          name: 'Sci-Fi Classics',
          icon: '🚀',
          color: 'indigo',
          activeUsers: 8000,
          isJoined: false
        }
      ],
      
      activeChats: [
        {
          id: 'chat1',
          name: 'The Midnight Library Club',
          avatar: 'https://i.pravatar.cc/60?img=20',
          lastMessage: 'Has anyone finished chapter 5 yet? That twist!',
          timestamp: '2m ago',
          unreadCount: 3
        },
        {
          id: 'chat2',
          name: 'James Wilson',
          avatar: 'https://i.pravatar.cc/60?img=33',
          lastMessage: "I think you'd love 'Project Hail Mary'!",
          timestamp: '1h ago',
          unreadCount: 0
        },
        {
          id: 'chat3',
          name: 'Sci-Fi Enthusiasts',
          avatar: 'https://i.pravatar.cc/60?img=47',
          lastMessage: 'Meeting is scheduled for Friday at 8pm 📚',
          timestamp: 'yesterday',
          unreadCount: 0
        }
      ],
      
      voiceRooms: [
        {
          id: 'room1',
          name: 'Romance Readers Hangout',
          participants: 12,
          host: {
            name: 'Bella S.',
            image: 'https://i.pravatar.cc/40?img=25'
          },
          tags: ['💕 Hot', 'Discussion']
        },
        {
          id: 'room2',
          name: 'Mystery Ch. 4 Deep Dive',
          participants: 8,
          host: {
            name: 'The Book Detectives',
            image: 'https://i.pravatar.cc/40?img=32'
          },
          tags: ['🔍 Mystery', 'Deep']
        },
        {
          id: 'room3',
          name: 'Writing Sprint: 25min',
          participants: 15,
          host: {
            name: 'Author Circle',
            image: 'https://i.pravatar.cc/40?img=41'
          },
          tags: ['Creative', 'Write']
        }
      ],
      
      recentActivity: [
        {
          id: 'activity1',
          icon: '📚',
          description: 'Sarah posted in Fantasy Board',
          timestamp: '3h ago'
        },
        {
          id: 'activity2',
          icon: '📖',
          description: 'New Voice Room "Sci-Fi Talk"',
          timestamp: '5h ago'
        },
        {
          id: 'activity3',
          icon: '🔗',
          description: '3 readers matched with you',
          timestamp: '8h ago'
        }
      ],
      
      suggestedUsers: [
        {
          id: 'user1',
          name: 'Alex M.',
          profilePicture: 'https://i.pravatar.cc/50?img=16',
          tags: ['Fantasy'],
          isFavorited: false
        },
        {
          id: 'user2',
          name: 'Jordan T.',
          profilePicture: 'https://i.pravatar.cc/50?img=28',
          tags: ['Sci-Fi'],
          isFavorited: false
        },
        {
          id: 'user3',
          name: 'Casey L.',
          profilePicture: 'https://i.pravatar.cc/50?img=35',
          tags: ['Mystery'],
          isFavorited: false
        }
      ]
    };
    
    console.log(`✅ Dashboard data sent for: ${user.email}`);
    
    res.json({
      success: true,
      dashboard: dashboardData
    });
    
  } catch (error) {
    console.error('❌ Dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error loading dashboard'
    });
  }
});

// ===== USER CONNECTIONS ENDPOINTS =====

app.post('/api/connections/connect/:targetUserId', authenticate, async (req, res) => {
  try {
    const { targetUserId } = req.params;
    const userId = req.userId;
    
    if (userId === targetUserId) {
      return res.json({
        success: false,
        message: 'Cannot connect with yourself'
      });
    }
    
    console.log(`🔗 User ${userId} connected with ${targetUserId}`);
    
    res.json({
      success: true,
      message: 'Connected successfully'
    });
    
  } catch (error) {
    console.error('❌ Connect error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.post('/api/boards/join/:boardId', authenticate, async (req, res) => {
  try {
    const { boardId } = req.params;
    const userId = req.userId;
    
    console.log(`📌 User ${userId} joined board ${boardId}`);
    
    res.json({
      success: true,
      message: 'Joined board successfully'
    });
    
  } catch (error) {
    console.error('❌ Join board error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.post('/api/voice-rooms/join/:roomId', authenticate, async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.userId;
    
    console.log(`🎙️ User ${userId} joined voice room ${roomId}`);
    
    res.json({
      success: true,
      message: 'Joined voice room successfully'
    });
    
  } catch (error) {
    console.error('❌ Join voice room error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// ===== ADMIN API ENDPOINTS =====

app.get('/api/admin/dashboard/stats', authenticate, async (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }
    
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({
      lastLogin: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    });
    const newUsersToday = await User.countDocuments({
      createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
    });
    const newUsersWeek = await User.countDocuments({
      createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    });
    const bannedUsers = await User.countDocuments({ isBanned: true });
    const totalAdmins = await User.countDocuments({ isAdmin: true });
    
    res.json({
      success: true,
      stats: {
        totalUsers,
        activeUsers,
        newUsersToday,
        newUsersWeek,
        bannedUsers,
        totalAdmins,
        newReports: 12,
        pendingReports: 5,
        resolvedReports: 128,
        joinedToday: newUsersToday,
        joinedWeek: newUsersWeek,
        liveRooms: 24,
        activeMatches: 156
      }
    });
    
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.get('/api/admin/me', authenticate, async (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }
    
    res.json({
      success: true,
      user: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        isAdmin: req.user.isAdmin,
        adminLevel: req.user.adminLevel,
        adminPermissions: req.user.adminPermissions,
        lastLogin: req.user.lastLogin,
        profilePicture: req.user.profilePicture,
        createdAt: req.user.createdAt
      }
    });
    
  } catch (error) {
    console.error('Error fetching admin profile:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.get('/api/admin/users', authenticate, async (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }
    
    const users = await User.find({})
      .select('-password -verificationCode -resetToken')
      .sort({ createdAt: -1 })
      .limit(50);
    
    res.json({
      success: true,
      users: users
    });
    
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.get('/api/admin/activity', authenticate, async (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }
    
    const mockActivity = [
      {
        id: 1,
        type: 'user_suspended',
        description: 'User @jasonhill_69 suspended',
        adminName: req.user.name,
        timestamp: new Date(Date.now() - 18 * 60 * 1000)
      },
      {
        id: 2,
        type: 'post_removed',
        description: 'Post removed - Violation of ToS',
        adminName: req.user.name,
        timestamp: new Date(Date.now() - 41 * 60 * 1000)
      },
      {
        id: 3,
        type: 'chat_filter',
        description: 'Added 3 new keywords to chat filter',
        adminName: req.user.name,
        timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000)
      }
    ];
    
    res.json({
      success: true,
      activity: mockActivity
    });
    
  } catch (error) {
    console.error('Error fetching activity:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// ===== ADMIN ROUTES =====
app.use('/api/admin', authenticate, adminRoutes);

// ===== START SERVER =====
const PORT = process.env.PORT || 5002;

const startServer = async () => {
  try {
    await connectDB();
    
    app.listen(PORT, () => {
      console.log('='.repeat(60));
      console.log('🚀 Litlink Backend Server Started!');
      console.log('='.repeat(60));
      console.log(`🌐 Server URL: http://localhost:${PORT}`);
      console.log(`🔌 API Base: http://localhost:${PORT}/api`);
      console.log(`⚡ Admin API: http://localhost:${PORT}/api/admin`);
      console.log(`💾 Database: MongoDB`);
      console.log(`📧 Email: ${process.env.EMAIL_USER ? '✅ Configured' : '❌ NOT Configured'}`);
      console.log('='.repeat(60));
      console.log('📍 Available Endpoints:');
      console.log('   POST /api/auth/signup');
      console.log('   POST /api/auth/login');
      console.log('   POST /api/auth/forgot-password');
      console.log('   POST /api/auth/verify-email');
      console.log('   POST /api/auth/resend-verification');
      console.log('   POST /api/auth/verify-otp');
      console.log('   POST /api/auth/reset-password');
      console.log('   DELETE /api/auth/delete-account');
      console.log('   DELETE /api/auth/admin/delete-user');
      console.log('   GET  /api/auth/user/:userId (Protected)');
      console.log('   PUT  /api/auth/user/:userId (Protected)');
      console.log('   DELETE /api/auth/user/:userId (Protected)');
      console.log('   GET  /api/dashboard/:userId (Protected) ✨ NEW');
      console.log('   POST /api/connections/connect/:targetUserId (Protected) ✨ NEW');
      console.log('   POST /api/boards/join/:boardId (Protected) ✨ NEW');
      console.log('   POST /api/voice-rooms/join/:roomId (Protected) ✨ NEW');
      console.log('   GET  /api/health');
      console.log('   GET  /api/debug/users');
      console.log('\n   👑 ADMIN ENDPOINTS:');
      console.log('   GET  /api/admin/dashboard/stats');
      console.log('   GET  /api/admin/me');
      console.log('   GET  /api/admin/users');
      console.log('   GET  /api/admin/activity');
      console.log('='.repeat(60));
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

module.exports = app;