const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const app = express();

// Enhanced CORS configuration
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'http://localhost:3000', 
      'http://127.0.0.1:3000', 
      'http://localhost:5500', 
      'http://127.0.0.1:5500',
      'http://localhost:8080',
      'http://127.0.0.1:8080',
      'http://localhost:5000',
      'http://127.0.0.1:5000'
    ];
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(null, true); // Allow all origins for development
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Handle preflight requests
app.options('*', cors());

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
    timestamp: new Date().toISOString(),
    features: {
      googleAuth: true,
      regularAuth: true,
      questionnaire: true
    }
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    cors: 'Enabled',
    endpoints: [
      '/api/auth/signup',
      '/api/auth/login', 
      '/api/auth/google-simple',
      '/api/auth/questionnaire'
    ]
  });
});

// ==================== GOOGLE AUTHENTICATION ====================

// Simple Google Sign-In (No Google API needed)
app.post('/api/auth/google-simple', async (req, res) => {
  try {
    const { email, name } = req.body;
    
    console.log('🔐 GOOGLE SIGN-IN ATTEMPT:', { email, name });
    
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    // Find existing user by email
    let user = users.find(u => u.email === email);
    
    if (user) {
      console.log('✅ EXISTING USER LOGIN:', user.id);
    } else {
      // Create new user
      user = {
        id: nextId++,
        name: name || 'Google User',
        email: email,
        username: email.split('@')[0] + '_' + Math.random().toString(36).substring(2, 5),
        password: null,
        profilePicture: '📚',
        bio: 'Book lover and avid reader',
        favoriteGenres: [],
        favoriteAuthors: [],
        favoriteBooks: [],
        readingHabit: '',
        readingGoal: 0,
        preferredFormats: [],
        discussionPreferences: [],
        receiveRecommendations: true,
        isGoogleUser: true,
        createdAt: new Date()
      };
      
      users.push(user);
      console.log('✅ NEW GOOGLE USER CREATED:', user.id);
    }

    // Generate JWT token
    const jwtToken = generateToken(user.id);

    res.json({
      success: true,
      message: 'Google login successful!',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        username: user.username,
        profilePicture: user.profilePicture,
        bio: user.bio,
        isGoogleUser: true
      },
      token: jwtToken
    });

  } catch (error) {
    console.error('❌ Google auth error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
});

// ==================== EXISTING AUTH ENDPOINTS ====================

// User registration
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, password, username } = req.body;
    
    console.log('✅ SIGNUP RECEIVED:', { name, email, username });
    
    // Check if user exists
    const existingUser = users.find(user => user.email === email || user.username === username);
    
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email or username already exists'
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
      isGoogleUser: false,
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
      message: 'Server error during signup'
    });
  }
});

// User login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    console.log('✅ LOGIN ATTEMPT:', email);
    
    // Find user
    const user = await users.find(u => u.email === email && u.password === password);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }
    
    // Generate token
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
        bio: user.bio,
        location: user.location,
        pronouns: user.pronouns,
        favoriteGenres: user.favoriteGenres,
        favoriteAuthors: user.favoriteAuthors
      },
      token
    });
    
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login'
    });
  }
});

// Save questionnaire data
app.post('/api/auth/questionnaire', async (req, res) => {
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
      message: 'Questionnaire completed successfully!',
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
      message: 'Server error saving questionnaire'
    });
  }
});

// Verify token endpoint
app.post('/api/auth/verify', async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }
    
    const decoded = jwt.verify(token, 'litlink-secret-2023');
    const user = users.find(u => u.id.toString() === decoded.userId.toString());
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.json({
      success: true,
      user: {
        id: user.id,
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
    console.error('❌ Token verification error:', error);
    res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }
});

// Debug endpoint - view all users
app.get('/debug/users', (req, res) => {
  res.json({
    success: true,
    users: users.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      username: u.username,
      isGoogleUser: u.isGoogleUser,
      favoriteGenres: u.favoriteGenres,
      favoriteAuthors: u.favoriteAuthors,
      favoriteBooks: u.favoriteBooks
    }))
  });
});

// Clear all users (for testing)
app.delete('/debug/clear-users', (req, res) => {
  users = [];
  nextId = 1;
  res.json({
    success: true,
    message: 'All users cleared'
  });
});

const PORT = 5002;
app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log('🚀 LITLINK BACKEND RUNNING!');
  console.log('='.repeat(60));
  console.log(`📍 URL: http://localhost:${PORT}`);
  console.log(`❤️  Health: http://localhost:${PORT}/health`);
  console.log(`🔐 Regular Signup: POST http://localhost:${PORT}/api/auth/signup`);
  console.log(`🔐 Regular Login: POST http://localhost:${PORT}/api/auth/login`);
  console.log(`🔐 Google Simple: POST http://localhost:${PORT}/api/auth/google-simple`);
  console.log(`📝 Questionnaire: POST http://localhost:${PORT}/api/auth/questionnaire`);
  console.log(`🔑 Verify Token: POST http://localhost:${PORT}/api/auth/verify`);
  console.log(`🐛 Debug Users: http://localhost:${PORT}/debug/users`);
  console.log('='.repeat(60));
  console.log('✅ CORS ENABLED FOR ALL DEVELOPMENT ORIGINS');
  console.log('='.repeat(60));
});