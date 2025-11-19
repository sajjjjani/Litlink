const express = require('express');
const router = express.Router();

// Mock signup for development
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password, username } = req.body;
    
    console.log('Signup attempt:', { name, email, username });
    
    // Mock successful response without database
    res.status(201).json({
      success: true,
      message: 'User created successfully!',
      user: {
        id: 'mock-user-id-' + Date.now(),
        name: name,
        email: email,
        username: username || email.split('@')[0],
        profilePicture: '📚',
        bio: 'Book lover and avid reader',
        location: '',
        pronouns: ''
      }
    });
    
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during signup'
    });
  }
});

// Mock login for development
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    console.log('Login attempt:', { email });
    
    // Mock successful login
    res.json({
      success: true,
      message: 'Login successful!',
      user: {
        id: 'mock-user-id-123',
        name: 'Test User',
        email: email,
        username: email.split('@')[0],
        profilePicture: '📚',
        bio: 'Book lover and avid reader',
        location: 'New York, USA',
        pronouns: 'They/Them'
      }
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login'
    });
  }
});

module.exports = router;
