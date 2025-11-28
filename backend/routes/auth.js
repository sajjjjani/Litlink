const express = require('express');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const router = express.Router();

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

// User registration
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password, username } = req.body;
    
    console.log('Signup attempt:', { name, email, username });
    
    // Check if user already exists
    const existingUser = await User.findOne({ 
      $or: [{ email }, { username }] 
    });
    
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email or username already exists'
      });
    }
    
    // Create new user
    const user = new User({
      name,
      email,
      password, // Note: In production, you should hash this!
      username: username || email.split('@')[0]
    });
    
    await user.save();
    
    // Generate token
    const token = generateToken(user._id);
    
    res.status(201).json({
      success: true,
      message: 'User created successfully!',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        username: user.username,
        profilePicture: user.profilePicture,
        bio: user.bio
      },
      token
    });
    
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during signup'
    });
  }
});

// User login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    console.log('Login attempt:', { email });
    
    // Find user
    const user = await User.findOne({ email });
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }
    
    // Simple password check (in production, use bcrypt)
    if (user.password !== password) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const bcrypt = require('bcryptjs');
    
    // Generate token
    const token = generateToken(user._id);
    
    res.json({
      success: true,
      message: 'Login successful!',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        username: user.username,
        profilePicture: user.profilePicture,
        bio: user.bio,
        location: user.location,
        pronouns: user.pronouns,
        favoriteGenres: user.favoriteGenres,
        favoriteAuthors: user.favoriteAuthors
      },
      token
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login'
    });
  }
});

// Save questionnaire data
router.post('/questionnaire', async (req, res) => {
  try {
    const { userId, questionnaireData } = req.body;
    
    const user = await User.findByIdAndUpdate(
      userId,
      {
        favoriteGenres: questionnaireData.selectedGenres,
        favoriteAuthors: questionnaireData.favoriteAuthors,
        favoriteBooks: questionnaireData.favoriteBooks,
        readingHabit: questionnaireData.readingHabit,
        readingGoal: questionnaireData.readingGoal,
        preferredFormats: questionnaireData.preferredFormats,
        discussionPreferences: questionnaireData.discussionPreferences,
        receiveRecommendations: questionnaireData.receiveRecommendations
      },
      { new: true }
    );
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Questionnaire completed successfully!',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        username: user.username,
        favoriteGenres: user.favoriteGenres,
        favoriteAuthors: user.favoriteAuthors,
        favoriteBooks: user.favoriteBooks
      }
    });
    
  } catch (error) {
    console.error('Questionnaire error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error saving questionnaire'
    });
  }
});

// Verify token endpoint (for frontend to check if user is logged in)
router.post('/verify', async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        username: user.username,
        profilePicture: user.profilePicture,
        bio: user.bio,
        location: user.location,
        pronouns: user.pronouns,
        favoriteGenres: user.favoriteGenres,
        favoriteAuthors: user.favoriteAuthors
      }
    });
    
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }
});

// In auth.js - questionnaire endpoint
res.json({
  success: true,
  message: 'Questionnaire completed successfully!',
  user: {
    id: user._id,
    name: user.name,
    email: user.email,
    username: user.username,
    favoriteGenres: user.favoriteGenres,
    favoriteAuthors: user.favoriteAuthors,
    favoriteBooks: user.favoriteBooks
  },
  token: generateToken(user._id) // Add this line
});

const bcrypt = require('bcryptjs');

// In signup route - replace the user creation part:
const saltRounds = 10;
const hashedPassword = await bcrypt.hash(password, saltRounds);

const user = new User({
  name,
  email,
  password: hashedPassword, // Use hashed password
  username: username || email.split('@')[0]
});

// In login route - replace password check:
const isPasswordValid = await bcrypt.compare(password, user.password);

module.exports = router;