const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true
}));
app.use(express.json());

// Simple signup that definitely works
app.post('/api/auth/signup', (req, res) => {
  console.log('✅ SIGNUP RECEIVED:', req.body);
  res.json({ 
    success: true, 
    message: 'Signup successful!',
    user: {
      id: 'user-' + Date.now(),
      name: req.body.name,
      email: req.body.email,
      username: req.body.username || req.body.email.split('@')[0]
    }
  });
});

// Simple login
app.post('/api/auth/login', (req, res) => {
  console.log('✅ LOGIN RECEIVED:', req.body.email);
  res.json({ 
    success: true, 
    message: 'Login successful!',
    user: {
      id: 'user-123',
      name: 'Test User',
      email: req.body.email,
      username: 'testuser'
    }
  });
});

app.get('/', (req, res) => {
  res.json({ message: 'Server is running!' });
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log('🚀 BACKEND running on http://localhost:3001');
  console.log('✅ Ready for testing!');
  console.log('='.repeat(50));
});
