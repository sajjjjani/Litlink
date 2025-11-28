const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const app = express();

// Middleware - Allow ALL origins for now
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());

// In-memory storage
let users = [];
let nextId = 1;

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ userId }, 'litlink-secret-2023', { expiresIn: '7d' });
};

// Routes
app.get('/', (req, res) => {
  res.json({ 
    message: '🎉 Litlink Backend is RUNNING!',
    status: 'OK',
    usersCount: users.length,
    timestamp: new Date().toISOString()
  });
});

// User registration
app.post('/api/auth/signup', (req, res) => {
  try {
    const { name, email, password, username } = req.body;
    
    console.log('✅ SIGNUP RECEIVED:', { name, email, username });
    
    // Check if user exists
    const existingUser = users.find(user => user.email === email || user.username === username);
    
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists'
      });
    }
    
    // Create user
    const user = {
      id: nextId++,
      name,
      email,
      password,
      username: username || email.split('@')[0],
      profilePicture: '📚',
      bio: 'Book lover',
      favoriteGenres: [],
      favoriteAuthors: [],
      favoriteBooks: [],
      readingHabit: '',
      readingGoal: 0,
      preferredFormats: [],
      discussionPreferences: [],
      receiveRecommendations: true,
      createdAt: new Date()
    };
    
    users.push(user);
    
    // Generate token
    const token = generateToken(user.id);
    
    console.log('✅ USER CREATED:', user.id);
    
    res.json({
      success: true,
      message: 'Signup successful!',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        username: user.username,
        profilePicture: user.profilePicture,
        bio: user.bio
      },
      token
    });
    
  } catch (error) {
    console.error('❌ Signup error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Save questionnaire
app.post('/api/auth/questionnaire', (req, res) => {
  try {
    const { userId, questionnaireData } = req.body;
    
    console.log('✅ QUESTIONNAIRE RECEIVED for user:', userId);
    
    const userIndex = users.findIndex(u => u.id.toString() === userId.toString());
    
    if (userIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Update user
    users[userIndex] = {
      ...users[userIndex],
      favoriteGenres: questionnaireData.selectedGenres || [],
      favoriteAuthors: questionnaireData.favoriteAuthors || [],
      favoriteBooks: questionnaireData.favoriteBooks || [],
      readingHabit: questionnaireData.readingHabit || '',
      readingGoal: questionnaireData.readingGoal || 0,
      preferredFormats: questionnaireData.preferredFormats || [],
      discussionPreferences: questionnaireData.discussionPreferences || [],
      receiveRecommendations: questionnaireData.receiveRecommendations !== false
    };
    
    const token = generateToken(users[userIndex].id);
    
    res.json({
      success: true,
      message: 'Questionnaire saved!',
      user: {
        id: users[userIndex].id,
        name: users[userIndex].name,
        email: users[userIndex].email,
        username: users[userIndex].username,
        favoriteGenres: users[userIndex].favoriteGenres,
        favoriteAuthors: users[userIndex].favoriteAuthors,
        favoriteBooks: users[userIndex].favoriteBooks
      },
      token
    });
    
  } catch (error) {
    console.error('❌ Questionnaire error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Login
app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = req.body;
    
    console.log('✅ LOGIN ATTEMPT:', email);
    
    const user = users.find(u => u.email === email && u.password === password);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
    
    const token = generateToken(user.id);
    
    res.json({
      success: true,
      message: 'Login successful!',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        username: user.username,
        profilePicture: user.profilePicture,
        bio: user.bio
      },
      token
    });
    
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Debug endpoint
app.get('/debug/users', (req, res) => {
  res.json({
    success: true,
    users: users.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      username: u.username,
      favoriteGenres: u.favoriteGenres,
      favoriteAuthors: u.favoriteAuthors
    }))
  });
});

const PORT = 5002;
app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log('🚀 LITLINK BACKEND RUNNING!');
  console.log('='.repeat(60));
  console.log(`📍 URL: http://localhost:${PORT}`);
  console.log(`🔐 Signup: POST http://localhost:${PORT}/api/auth/signup`);
  console.log(`📝 Questionnaire: POST http://localhost:${PORT}/api/auth/questionnaire`);
  console.log(`🐛 Debug: http://localhost:${PORT}/debug/users`);
  console.log('='.repeat(60));
  console.log('✅ READY FOR FRONTEND!');
  console.log('='.repeat(60));
});