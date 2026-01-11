const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();
const User = require('../models/User');
const Verification = require('../models/Verification');
const authenticate = require('../middleware/auth');
const { generateCode } = require('../utils/helpers');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/email');

// Helper: Format user response
function formatUserResponse(user) {
  return {
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
    isVerified: user.isVerified,
    readingHabit: user.readingHabit || 'Not set',
    readingGoal: user.readingGoal || 12,
    favoriteGenres: user.favoriteGenres || [],
    favoriteAuthors: user.favoriteAuthors || [],
    favoriteBooks: user.favoriteBooks || [],
    booksRead: user.booksRead || [],
    preferredFormats: user.preferredFormats || [],
    discussionPreferences: user.discussionPreferences || [],
    receiveRecommendations: user.receiveRecommendations !== undefined ? user.receiveRecommendations : true,
    following: user.following || [],
    followers: user.followers || [],
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLogin: user.lastLogin
  };
}

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password, username, phone, location } = req.body;
    
    if (!name || !email || !password) {
      return res.json({ success: false, message: 'All fields are required' });
    }
    
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.json({ success: false, message: 'Email already registered.' });
    }
    
    if (username) {
      const existingUsername = await User.findOne({ username: username.toLowerCase() });
      if (existingUsername) {
        return res.json({ success: false, message: 'Username already taken.' });
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
      bio: 'Welcome to Litlink! Start your reading journey here.',
      profilePicture: '',
      readingGoal: 12,
      favoriteGenres: [],
      favoriteAuthors: [],
      favoriteBooks: [],
      booksRead: [],
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
    
    const emailSent = await sendVerificationEmail(email, verificationCode, name);
    
    res.json({
      success: true,
      message: emailSent ? 
        'Account created successfully! Please check your email for verification link.' :
        'Account created but verification email failed to send. Please contact support.',
      verificationCode: verificationCode,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        username: user.username
      }
    });
    
  } catch (error) {
    console.error('Signup error:', error);
    if (error.code === 11000) {
      if (error.keyPattern?.email) {
        return res.json({ success: false, message: 'Email already registered.' });
      } else if (error.keyPattern?.username) {
        return res.json({ success: false, message: 'Username already taken.' });
      }
    }
    res.status(500).json({ success: false, message: 'Server error occurred.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user || !await bcrypt.compare(password, user.password)) {
      return res.json({ success: false, message: 'Invalid email or password' });
    }
    
    if (user.isBanned) {
      return res.json({
        success: false,
        message: 'Account has been banned. Contact support for more information.',
        banReason: user.banReason || 'Violation of terms of service'
      });
    }
    
    if (!user.isAdmin && !user.isVerified) {
      return res.json({
        success: false,
        requiresVerification: true,
        message: 'Please verify your email first. Check your inbox for the verification link.'
      });
    }
    
    if (user.isAdmin && !user.isVerified) {
      user.isVerified = true;
      await user.save();
    }
    
    const token = jwt.sign(
      { userId: user._id, email: user.email, isAdmin: user.isAdmin || false, adminLevel: user.adminLevel || 'none' },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    user.lastLogin = new Date();
    await user.save();
    
    const redirectPath = user.isAdmin ? '../Admin%20Dashboard/admin.html' : '../Profile/profile.html';
    
    res.json({
      success: true,
      message: 'Login successful!',
      token,
      user: formatUserResponse(user),
      redirectTo: redirectPath
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Server error occurred.' });
  }
});

// POST /api/auth/verify-email
router.post('/verify-email', async (req, res) => {
  try {
    const { email, code } = req.body;
    const verification = await Verification.findOne({
      email: email.toLowerCase(),
      code: code,
      type: 'email_verification'
    });
    
    if (!verification) {
      return res.json({ success: false, message: 'Invalid verification code' });
    }
    
    if (verification.expiresAt < new Date()) {
      await Verification.deleteOne({ _id: verification._id });
      return res.json({ success: false, message: 'Verification code has expired.' });
    }
    
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.json({ success: false, message: 'User not found.' });
    }
    
    user.isVerified = true;
    user.verificationCode = null;
    user.verificationExpiry = null;
    await user.save();
    
    await Verification.deleteOne({ _id: verification._id });
    
    res.json({
      success: true,
      message: 'Email verified successfully! You can now login.',
      user: { email: user.email, isVerified: true }
    });
    
  } catch (error) {
    console.error('Verify email error:', error);
    res.status(500).json({ success: false, message: 'Server error occurred.' });
  }
});

// POST /api/auth/resend-verification
router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      return res.json({ success: false, message: 'Email not found' });
    }
    
    if (user.isVerified) {
      return res.json({ success: false, message: 'Email is already verified' });
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
    await sendVerificationEmail(email, verificationCode, user.name);
    
    res.json({ success: true, message: 'New verification email sent successfully.', verificationCode });
    
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({ success: false, message: 'Server error occurred.' });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      return res.json({ success: false, message: 'Email not found.' });
    }
    
    const otp = generateCode(6);
    const verification = new Verification({
      email: email.toLowerCase(),
      code: otp,
      type: 'password_reset',
      expiresAt: new Date(Date.now() + 15 * 60 * 1000)
    });
    
    await verification.save();
    const emailSent = await sendPasswordResetEmail(email, otp, user.name);
    
    if (!emailSent) {
      return res.json({ success: false, message: 'Failed to send reset email.' });
    }
    
    res.json({ success: true, message: 'Password reset email sent!', otp });
    
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ success: false, message: 'Server error occurred.' });
  }
});

// POST /api/auth/verify-otp
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    const verification = await Verification.findOne({
      email: email.toLowerCase(),
      code: otp,
      type: 'password_reset'
    });
    
    if (!verification) {
      return res.json({ success: false, message: 'Invalid OTP' });
    }
    
    if (verification.expiresAt < new Date()) {
      await Verification.deleteOne({ _id: verification._id });
      return res.json({ success: false, message: 'OTP has expired' });
    }
    
    await Verification.deleteOne({ _id: verification._id });
    res.json({ success: true, message: 'OTP verified successfully' });
    
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  try {
    const { email, newPassword } = req.body;
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      return res.json({ success: false, message: 'User not found' });
    }
    
    user.password = await bcrypt.hash(newPassword, 10);
    user.resetToken = null;
    user.resetTokenExpiry = null;
    await user.save();
    
    res.json({ success: true, message: 'Password reset successfully!' });
    
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/auth/user/:userId
router.get('/user/:userId', authenticate, async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (userId !== req.userId.toString()) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }
    
    const user = await User.findById(userId).select('-password -verificationCode -resetToken');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    res.json({ success: true, user: formatUserResponse(user) });
    
  } catch (error) {
    console.error('Get user profile error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PUT /api/auth/user/:userId
router.put('/user/:userId', authenticate, async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (userId !== req.userId.toString()) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }
    
    const updateData = {};
    const fields = ['name', 'username', 'bio', 'location', 'pronouns', 'profilePicture', 'phone',
                    'readingGoal', 'readingHabit', 'preferredFormats', 'discussionPreferences',
                    'receiveRecommendations', 'favoriteGenres', 'favoriteAuthors', 'favoriteBooks'];
    
    fields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = field === 'readingGoal' ? parseInt(req.body[field]) || 12 : req.body[field];
      }
    });
    
    const user = await User.findByIdAndUpdate(userId, updateData, { new: true, runValidators: true })
      .select('-password -verificationCode -resetToken');
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    res.json({ success: true, message: 'Profile updated successfully', user: formatUserResponse(user) });
    
  } catch (error) {
    console.error('Update profile error:', error);
    if (error.code === 11000 && error.keyPattern?.username) {
      return res.status(400).json({ success: false, message: 'Username already taken' });
    }
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// DELETE /api/auth/user/:userId
router.delete('/user/:userId', authenticate, async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (userId !== req.userId.toString()) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    await User.deleteOne({ _id: userId });
    await Verification.deleteMany({ email: user.email.toLowerCase() });
    
    res.json({ success: true, message: 'Account deleted successfully' });
    
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;

