const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();

// Simple file storage
const DATA_FILE = path.join(__dirname, 'data.json');

// Load data from file
function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = fs.readFileSync(DATA_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Error loading data:', error);
    }
    return { users: [], nextId: 1 };
}

// Save data to file
function saveData(data) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error('Error saving data:', error);
        return false;
    }
}

// Initialize data
let { users, nextId } = loadData();

// Middleware to authenticate JWT token
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Access token required'
        });
    }
    
    jwt.verify(token, process.env.JWT_SECRET || 'litlink-secret-2023', (err, user) => {
        if (err) {
            return res.status(403).json({
                success: false,
                message: 'Invalid or expired token'
            });
        }
        req.userId = user.userId;
        next();
    });
}

// ==================== EMAIL CONFIGURATION ====================
console.log('📧 Email Configuration Check:');
console.log('EMAIL_USER:', process.env.EMAIL_USER || 'NOT SET - Using console logs only');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER || 'test@example.com',
        pass: process.env.EMAIL_PASSWORD || 'test',
    },
    tls: {
        rejectUnauthorized: false
    }
});

transporter.verify(function(error, success) {
    if (error) {
        console.log('⚠️ Email service not configured. Verification codes will show in console.');
    } else {
        console.log('✅ EMAIL SERVER IS READY!');
    }
});

// Generate verification code
function generateVerificationCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Generate OTP
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send verification email
async function sendVerificationEmail(email, name, verificationCode) {
    try {
        console.log('\n📧 ================= VERIFICATION INFO =================');
        console.log(`📧 To: ${email}`);
        console.log(`📧 Name: ${name}`);
        console.log(`📧 Verification Code: ${verificationCode}`);
        
        const verificationUrl = `http://127.0.0.1:5500/Homepage/verify-email.html?code=${verificationCode}&email=${encodeURIComponent(email)}`;
        console.log(`🔗 Verification URL: ${verificationUrl}`);
        console.log('📧 =====================================================\n');
        
        if (process.env.EMAIL_USER && process.env.EMAIL_USER !== 'test@example.com') {
            const mailOptions = {
                from: `"Litlink" <${process.env.EMAIL_USER}>`,
                to: email,
                subject: 'Verify Your Email - Litlink',
                text: `Hi ${name},\n\nYour verification code is: ${verificationCode}\n\nOr use this link: ${verificationUrl}\n\nThis link is valid for 24 hours.`,
                html: `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="UTF-8">
                        <style>
                            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
                            .container { background: #f8f5f2; padding: 30px; border-radius: 10px; border: 1px solid #e0d7cc; }
                            .header { color: #3B1D14; text-align: center; margin-bottom: 30px; }
                            .code-box { 
                                background: #F5E6CC; 
                                color: #3B1D14; 
                                padding: 20px; 
                                text-align: center; 
                                font-size: 32px; 
                                font-weight: bold; 
                                letter-spacing: 5px; 
                                margin: 20px 0; 
                                border-radius: 8px;
                                border: 2px dashed #E0B973;
                            }
                            .button { 
                                display: block;
                                width: 200px;
                                margin: 20px auto;
                                background: #E0B973; 
                                color: #3B1D14 !important; 
                                padding: 12px 30px; 
                                text-decoration: none; 
                                border-radius: 5px; 
                                font-weight: bold;
                                text-align: center;
                            }
                            .button:hover { background: #d4ab5f; }
                            .footer { 
                                margin-top: 30px; 
                                padding-top: 20px; 
                                border-top: 1px solid #e0d7cc; 
                                color: #666; 
                                font-size: 12px;
                            }
                            .link-box {
                                background: #f5f5f5; 
                                padding: 10px; 
                                border-radius: 5px; 
                                word-break: break-all;
                                margin: 15px 0;
                                font-size: 14px;
                            }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <div class="header">
                                <h2 style="color: #3B1D14;">📚 Litlink</h2>
                                <h3 style="color: #3B1D14;">Verify Your Email Address</h3>
                            </div>
                            
                            <p>Hi <strong>${name}</strong>,</p>
                            
                            <p>Welcome to Litlink! To complete your registration, please verify your email address by using the code below:</p>
                            
                            <div class="code-box">
                                ${verificationCode}
                            </div>
                            
                            <p style="text-align: center; margin-top: 25px;">
                                <strong>Or click this button:</strong>
                            </p>
                            
                            <a href="${verificationUrl}" class="button">
                                ✅ Verify My Email
                            </a>
                            
                            <p>If the button doesn't work, copy and paste this link into your browser:</p>
                            <div class="link-box">
                                ${verificationUrl}
                            </div>
                            
                            <div class="footer">
                                <p>This verification link will expire in 24 hours.</p>
                                <p>If you didn't create a Litlink account, please ignore this email.</p>
                                <p>Happy reading! 📖</p>
                            </div>
                        </div>
                    </body>
                    </html>
                `
            };
            
            await transporter.sendMail(mailOptions);
            console.log('✅ Email sent successfully!');
        } else {
            console.log('📧 Email not sent (using test configuration). Check console for verification code.');
        }
        
        return { 
            success: true, 
            verificationCode,
            verificationUrl: verificationUrl
        };
        
    } catch (error) {
        console.log('⚠️ Email sending failed, but code generated:', verificationCode);
        console.log('Error details:', error.message);
        return { success: false, verificationCode };
    }
}

// Send OTP email
async function sendOTPEmail(email, name, otp) {
    try {
        console.log('\n🔐 ================= PASSWORD RESET OTP =================');
        console.log(`🔐 To: ${email}`);
        console.log(`🔐 Name: ${name}`);
        console.log(`🔐 OTP Code: ${otp}`);
        console.log('🔐 =====================================================\n');
        
        if (process.env.EMAIL_USER && process.env.EMAIL_USER !== 'test@example.com') {
            const mailOptions = {
                from: `"Litlink" <${process.env.EMAIL_USER}>`,
                to: email,
                subject: 'Password Reset OTP - Litlink',
                text: `Your OTP is: ${otp}\n\nThis OTP expires in 10 minutes.`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px;">
                        <h2 style="color: #3B1D14;">Password Reset OTP</h2>
                        <p>Hi ${name},</p>
                        <p>Your OTP code is:</p>
                        <h1 style="color: #E0B973; font-size: 32px;">${otp}</h1>
                        <p>Valid for 10 minutes</p>
                    </div>
                `
            };
            
            await transporter.sendMail(mailOptions);
            console.log('✅ OTP email sent!');
        } else {
            console.log('📧 OTP not sent (using test configuration). Check console for OTP.');
        }
        
        return { success: true, otp };
        
    } catch (error) {
        console.log('⚠️ OTP email failed, but OTP generated:', otp);
        return { success: false, otp };
    }
}

// ==================== FIXED CORS CONFIGURATION ====================
const corsOptions = {
    origin: ['http://127.0.0.1:5500', 'http://localhost:5500', 'http://127.0.0.1:5000', 'http://localhost:5000'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
    credentials: true,
    optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Request logging middleware
app.use((req, res, next) => {
    console.log(`\n📨 ${new Date().toISOString()}`);
    console.log(`${req.method} ${req.url}`);
    console.log('Origin:', req.headers.origin);
    console.log('Body:', req.body);
    next();
});

app.use(express.json());

// Generate JWT token
const generateToken = (userId) => {
    return jwt.sign({ userId }, process.env.JWT_SECRET || 'litlink-secret-2023', { expiresIn: '7d' });
};

// ==================== ROUTES ====================

// Test endpoint
app.get('/', (req, res) => {
    res.json({ 
        success: true,
        message: '✅ Litlink Backend is RUNNING!',
        timestamp: new Date(),
        endpoints: {
            signup: 'POST /api/auth/signup',
            verifyEmail: 'POST /api/auth/verify-email',
            login: 'POST /api/auth/login',
            googleLogin: 'POST /api/auth/google-simple',
            questionnaire: 'POST /api/auth/questionnaire',
            forgotPassword: 'POST /api/auth/forgot-password',
            verifyOTP: 'POST /api/auth/verify-otp',
            getUser: 'GET /api/auth/user/:userId',
            updateUser: 'PUT /api/auth/user/:userId',
            deleteUser: 'DELETE /api/auth/user/:userId'
        }
    });
});

// Health check endpoints
app.get('/health', (req, res) => {
    res.json({
        success: true,
        status: 'healthy',
        timestamp: new Date(),
        port: 5002,
        users: users.length
    });
});

app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        status: 'API healthy',
        timestamp: new Date(),
        endpoints: ['/auth/signup', '/auth/login', '/auth/forgot-password', '/auth/verify-otp']
    });
});

// API test endpoint
app.get('/api/test', (req, res) => {
    res.json({
        success: true,
        message: '✅ Backend API is working!',
        timestamp: new Date(),
        usersCount: users.length,
        frontendUrl: req.headers.origin,
        cors: {
            allowedOrigins: ['http://127.0.0.1:5500', 'http://localhost:5500'],
            requestOrigin: req.headers.origin
        }
    });
});

// ==================== SIGNUP ====================
app.post('/api/auth/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        
        console.log('\n📝 ============ SIGNUP REQUEST ============');
        console.log('Name:', name);
        console.log('Email:', email);
        
        const existingUser = users.find(user => user.email === email);
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'User already exists'
            });
        }
        
        const verificationCode = generateVerificationCode();
        const user = {
            id: nextId++,
            name,
            email,
            username: email.split('@')[0],
            password,
            isVerified: false,
            verificationCode,
            verificationExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
            createdAt: new Date(),
            questionnaireCompleted: false,
            googleAuth: false,
            favoriteGenres: [],
            favoriteAuthors: [],
            favoriteBooks: [],
            readingHabit: '',
            readingGoal: 12,
            preferredFormats: [],
            discussionPreferences: [],
            receiveRecommendations: false,
            bio: '',
            location: '',
            pronouns: '',
            profilePicture: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=E0B973&color=3B1D14&size=150`,
            booksRead: [],
            following: [],
            followers: []
        };
        
        users.push(user);
        saveData({ users, nextId });
        
        console.log('✅ User created with ID:', user.id);
        console.log('📧 Verification code:', verificationCode);
        
        const emailResult = await sendVerificationEmail(email, name, verificationCode);
        
        res.json({
            success: true,
            requiresVerification: true,
            message: 'Account created! Check your email for verification code.',
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                username: user.username,
                profilePicture: user.profilePicture,
                isVerified: false,
                questionnaireCompleted: false,
                bio: user.bio,
                location: user.location,
                pronouns: user.pronouns
            },
            verificationCode: verificationCode,
            verificationUrl: emailResult.verificationUrl
        });
        
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during signup'
        });
    }
});

// ==================== VERIFY EMAIL ====================
app.post('/api/auth/verify-email', async (req, res) => {
    try {
        const { email, code } = req.body;
        
        console.log('\n📧 ============ VERIFY EMAIL ============');
        console.log('Email:', email);
        console.log('Code:', code);
        
        const user = users.find(u => u.email === email);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        if (user.isVerified) {
            console.log('✅ Already verified');
            return res.json({
                success: true,
                message: 'Already verified',
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    isVerified: true,
                    questionnaireCompleted: user.questionnaireCompleted,
                    username: user.username,
                    profilePicture: user.profilePicture
                }
            });
        }
        
        if (user.verificationCode !== code) {
            console.log('❌ Invalid code');
            return res.status(400).json({
                success: false,
                message: 'Invalid verification code'
            });
        }
        
        user.isVerified = true;
        user.verificationCode = undefined;
        saveData({ users, nextId });
        
        console.log('✅ Email verified successfully!');
        
        const token = generateToken(user.id);
        
        res.json({
            success: true,
            message: 'Email verified successfully! Please complete your profile.',
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                username: user.username,
                profilePicture: user.profilePicture,
                bio: user.bio,
                location: user.location,
                pronouns: user.pronouns,
                isVerified: true,
                questionnaireCompleted: false,
                favoriteGenres: user.favoriteGenres || [],
                favoriteAuthors: user.favoriteAuthors || [],
                favoriteBooks: user.favoriteBooks || [],
                readingHabit: user.readingHabit || '',
                readingGoal: user.readingGoal || 12,
                preferredFormats: user.preferredFormats || [],
                discussionPreferences: user.discussionPreferences || [],
                receiveRecommendations: user.receiveRecommendations || false,
                booksRead: user.booksRead || [],
                following: user.following || [],
                followers: user.followers || [],
                createdAt: user.createdAt
            },
            needsQuestionnaire: !user.questionnaireCompleted
        });
        
    } catch (error) {
        console.error('Verify email error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during verification'
        });
    }
});

// ==================== RESEND VERIFICATION ====================
app.post('/api/auth/resend-verification', async (req, res) => {
    try {
        const { email } = req.body;
        
        console.log('\n📧 ============ RESEND VERIFICATION ============');
        
        const user = users.find(u => u.email === email);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        if (user.isVerified) {
            return res.json({
                success: true,
                message: 'Email already verified'
            });
        }
        
        const verificationCode = generateVerificationCode();
        user.verificationCode = verificationCode;
        user.verificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
        
        saveData({ users, nextId });
        
        console.log('📧 New verification code:', verificationCode);
        
        const emailResult = await sendVerificationEmail(email, user.name, verificationCode);
        
        res.json({
            success: true,
            message: 'New verification code sent',
            verificationCode: verificationCode,
            verificationUrl: emailResult.verificationUrl
        });
        
    } catch (error) {
        console.error('Resend verification error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// ==================== LOGIN ====================
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        console.log('\n🔐 ============ LOGIN ATTEMPT ============');
        console.log('Email:', email);
        
        const user = users.find(u => u.email === email && u.password === password);
        
        if (!user) {
            console.log('❌ Invalid credentials');
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }
        
        if (!user.isVerified) {
            console.log('⚠️ User not verified');
            return res.status(403).json({
                success: false,
                requiresVerification: true,
                message: 'Please verify your email first',
                email: user.email
            });
        }
        
        console.log('✅ Login successful');
        console.log('📊 Questionnaire completed:', user.questionnaireCompleted);
        
        const token = generateToken(user.id);
        
        res.json({
            success: true,
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                username: user.username,
                profilePicture: user.profilePicture,
                bio: user.bio || '',
                location: user.location || '',
                pronouns: user.pronouns || '',
                isVerified: true,
                questionnaireCompleted: user.questionnaireCompleted,
                favoriteGenres: user.favoriteGenres || [],
                favoriteAuthors: user.favoriteAuthors || [],
                favoriteBooks: user.favoriteBooks || [],
                readingHabit: user.readingHabit || '',
                readingGoal: user.readingGoal || 12,
                preferredFormats: user.preferredFormats || [],
                discussionPreferences: user.discussionPreferences || [],
                receiveRecommendations: user.receiveRecommendations || false,
                googleAuth: user.googleAuth || false,
                booksRead: user.booksRead || [],
                following: user.following || [],
                followers: user.followers || [],
                createdAt: user.createdAt
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

// ==================== GOOGLE SIMPLE AUTH ====================
app.post('/api/auth/google-simple', async (req, res) => {
    try {
        const { email, name } = req.body;
        
        console.log('\n🔐 ============ GOOGLE SIGNUP/LOGIN ============');
        console.log('Email:', email);
        console.log('Name:', name);
        
        let user = users.find(u => u.email === email);
        
        if (!user) {
            console.log('👤 New Google user - creating account');
            
            const verificationCode = generateVerificationCode();
            user = {
                id: nextId++,
                name,
                email,
                username: email.split('@')[0],
                password: 'google-auth-' + Date.now(),
                isVerified: false,
                verificationCode,
                verificationExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
                googleAuth: true,
                createdAt: new Date(),
                questionnaireCompleted: false,
                favoriteGenres: [],
                favoriteAuthors: [],
                favoriteBooks: [],
                readingHabit: '',
                readingGoal: 12,
                preferredFormats: [],
                discussionPreferences: [],
                receiveRecommendations: false,
                bio: '',
                location: '',
                pronouns: '',
                profilePicture: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=E0B973&color=3B1D14&size=150`,
                booksRead: [],
                following: [],
                followers: []
            };
            
            users.push(user);
            saveData({ users, nextId });
            
            console.log('✅ New Google user created with ID:', user.id);
            console.log('📧 Verification code:', verificationCode);
            
            const emailResult = await sendVerificationEmail(email, name, verificationCode);
            
            res.json({
                success: true,
                message: 'Account created! Check email for verification.',
                requiresVerification: true,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    username: user.username,
                    profilePicture: user.profilePicture,
                    isVerified: false,
                    questionnaireCompleted: false
                },
                verificationCode: verificationCode,
                verificationUrl: emailResult.verificationUrl
            });
            
        } else {
            console.log('👤 Existing user found');
            
            if (!user.isVerified) {
                console.log('⚠️ User not verified');
                res.json({
                    success: false,
                    requiresVerification: true,
                    message: 'Please verify your email first',
                    email: user.email
                });
                return;
            }
            
            console.log('✅ User verified, questionnaire completed:', user.questionnaireCompleted);
            
            const token = generateToken(user.id);
            
            res.json({
                success: true,
                message: 'Login successful',
                token,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    username: user.username,
                    profilePicture: user.profilePicture,
                    bio: user.bio || '',
                    location: user.location || '',
                    pronouns: user.pronouns || '',
                    isVerified: true,
                    questionnaireCompleted: user.questionnaireCompleted,
                    favoriteGenres: user.favoriteGenres || [],
                    favoriteAuthors: user.favoriteAuthors || [],
                    favoriteBooks: user.favoriteBooks || [],
                    readingHabit: user.readingHabit || '',
                    readingGoal: user.readingGoal || 12,
                    preferredFormats: user.preferredFormats || [],
                    discussionPreferences: user.discussionPreferences || [],
                    receiveRecommendations: user.receiveRecommendations || false,
                    googleAuth: true,
                    booksRead: user.booksRead || [],
                    following: user.following || [],
                    followers: user.followers || [],
                    createdAt: user.createdAt
                },
                needsQuestionnaire: !user.questionnaireCompleted
            });
        }
        
    } catch (error) {
        console.error('Google auth error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during Google authentication'
        });
    }
});

// ==================== QUESTIONNAIRE ====================
app.post('/api/auth/questionnaire', async (req, res) => {
    try {
        const { userId, questionnaireData } = req.body;
        
        console.log('\n📝 ============ QUESTIONNAIRE ============');
        console.log('User ID:', userId);
        console.log('Data:', JSON.stringify(questionnaireData, null, 2));
        
        const user = users.find(u => u.id == userId);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        user.favoriteGenres = questionnaireData.selectedGenres || [];
        user.favoriteAuthors = questionnaireData.favoriteAuthors || [];
        user.favoriteBooks = questionnaireData.favoriteBooks || [];
        user.readingHabit = questionnaireData.readingHabit || '';
        user.readingGoal = questionnaireData.readingGoal || 12;
        user.preferredFormats = questionnaireData.preferredFormats || [];
        user.discussionPreferences = questionnaireData.discussionPreferences || [];
        user.receiveRecommendations = questionnaireData.receiveRecommendations || false;
        user.questionnaireCompleted = true;
        
        saveData({ users, nextId });
        
        console.log('✅ Questionnaire saved for user:', user.email);
        
        const token = generateToken(user.id);
        
        res.json({
            success: true,
            message: 'Profile completed successfully!',
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                username: user.username,
                profilePicture: user.profilePicture,
                bio: user.bio || '',
                location: user.location || '',
                pronouns: user.pronouns || '',
                isVerified: true,
                questionnaireCompleted: true,
                favoriteGenres: user.favoriteGenres,
                favoriteAuthors: user.favoriteAuthors,
                favoriteBooks: user.favoriteBooks,
                readingHabit: user.readingHabit,
                readingGoal: user.readingGoal,
                preferredFormats: user.preferredFormats,
                discussionPreferences: user.discussionPreferences,
                receiveRecommendations: user.receiveRecommendations,
                googleAuth: user.googleAuth || false,
                booksRead: user.booksRead || [],
                following: user.following || [],
                followers: user.followers || [],
                createdAt: user.createdAt
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

// ==================== DELETE USER ACCOUNT ====================
app.delete('/api/auth/user/:userId', authenticateToken, async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        
        console.log('\n🗑️ ============ DELETE USER REQUEST ============');
        console.log('User ID to delete:', userId);
        console.log('Total users before:', users.length);
        
        const userIndex = users.findIndex(u => u.id === userId);
        
        if (userIndex === -1) {
            console.log('❌ User not found');
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        const deletedUser = users[userIndex];
        
        users.splice(userIndex, 1);
        saveData({ users, nextId });
        
        console.log('✅ User deleted:', deletedUser.email);
        console.log('Total users after:', users.length);
        
        res.json({
            success: true,
            message: `User account deleted successfully`,
            deletedUser: {
                id: deletedUser.id,
                name: deletedUser.name,
                email: deletedUser.email
            },
            remainingUsers: users.length
        });
        
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error deleting user'
        });
    }
});

// ==================== FORGOT PASSWORD ====================
app.post('/api/auth/forgot-password', async (req, res) => {
    try {
        console.log('\n🔐 ============ FORGOT PASSWORD REQUEST ============');
        console.log('📨 Request body:', req.body);
        
        const { email } = req.body;
        
        if (!email) {
            console.log('❌ No email provided');
            return res.status(400).json({
                success: false,
                message: 'Email is required'
            });
        }
        
        console.log('📧 Email:', email);
        
        const user = users.find(u => u.email === email);
        
        if (!user) {
            console.log('📭 User not found with email:', email);
            return res.json({
                success: true,
                message: 'If an account exists with this email, OTP will be sent',
                userExists: false,
                otp: null
            });
        }
        
        console.log('👤 User found:', user.name, 'ID:', user.id);
        
        const otp = generateOTP();
        const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
        
        user.resetOTP = otp;
        user.resetOTPExpiry = otpExpiry;
        saveData({ users, nextId });
        
        console.log('🔢 OTP generated:', otp);
        console.log('👤 User is Google user:', user.googleAuth || false);
        
        const emailResult = await sendOTPEmail(email, user.name, otp);
        
        console.log('✅ OTP sent successfully');
        
        res.json({
            success: true,
            message: 'OTP sent to your email',
            otp: otp,
            userExists: true,
            isGoogleUser: user.googleAuth || false,
            userName: user.name,
            emailSent: emailResult.success
        });
        
    } catch (error) {
        console.error('❌ Forgot password error:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({
            success: false,
            message: 'Server error: ' + error.message
        });
    }
});

// ==================== VERIFY OTP ====================
app.post('/api/auth/verify-otp', async (req, res) => {
    try {
        const { email, otp } = req.body;
        
        console.log('\n🔢 ============ VERIFY OTP ============');
        console.log('Email:', email);
        console.log('OTP provided:', otp);
        
        const user = users.find(u => 
            u.email === email && 
            u.resetOTP === otp && 
            u.resetOTPExpiry && 
            new Date(u.resetOTPExpiry) > new Date()
        );
        
        if (!user) {
            console.log('❌ Invalid or expired OTP');
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired OTP'
            });
        }
        
        console.log('✅ OTP verified');
        console.log('👤 User is Google user:', user.googleAuth || false);
        
        const verificationCode = generateVerificationCode();
        user.resetVerificationCode = verificationCode;
        user.resetVerificationExpiry = new Date(Date.now() + 15 * 60 * 1000);
        
        user.resetOTP = undefined;
        user.resetOTPExpiry = undefined;
        saveData({ users, nextId });
        
        const resetUrl = `http://127.0.0.1:5500/Homepage/reset-password.html?code=${verificationCode}&email=${encodeURIComponent(email)}`;
        
        res.json({
            success: true,
            message: 'OTP verified successfully. You can now reset your password.',
            verificationCode: verificationCode,
            resetUrl: resetUrl,
            isGoogleUser: user.googleAuth || false
        });
        
    } catch (error) {
        console.error('Verify OTP error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during OTP verification'
        });
    }
});

// ==================== GET USER PROFILE ====================
app.get('/api/auth/user/:userId', async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        const user = users.find(u => u.id === userId);
        
        if (!user) {
            return res.status(404).json({
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
                bio: user.bio || '',
                location: user.location || '',
                pronouns: user.pronouns || '',
                profilePicture: user.profilePicture || 'https://ui-avatars.com/api/?name=User&background=E0B973&color=3B1D14&size=150',
                favoriteGenres: user.favoriteGenres || [],
                favoriteAuthors: user.favoriteAuthors || [],
                favoriteBooks: user.favoriteBooks || [],
                readingHabit: user.readingHabit || '',
                readingGoal: user.readingGoal || 12,
                preferredFormats: user.preferredFormats || [],
                discussionPreferences: user.discussionPreferences || [],
                receiveRecommendations: user.receiveRecommendations || false,
                questionnaireCompleted: user.questionnaireCompleted || false,
                googleAuth: user.googleAuth || false,
                createdAt: user.createdAt,
                booksRead: user.booksRead || [],
                following: user.following || [],
                followers: user.followers || [],
                isVerified: user.isVerified || false
            }
        });
        
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// ==================== UPDATE USER PROFILE ====================
app.put('/api/auth/user/:userId', authenticateToken, async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        const user = users.find(u => u.id === userId);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        console.log('\n🔄 ============ UPDATE USER PROFILE ============');
        console.log('User ID:', userId);
        console.log('Update data:', req.body);
        
        const { name, username, bio, location, pronouns, profilePicture, readingGoal } = req.body;
        
        if (name !== undefined) user.name = name;
        if (username !== undefined) user.username = username;
        if (bio !== undefined) user.bio = bio;
        if (location !== undefined) user.location = location;
        if (pronouns !== undefined) user.pronouns = pronouns;
        if (profilePicture !== undefined) user.profilePicture = profilePicture;
        if (readingGoal !== undefined) user.readingGoal = parseInt(readingGoal) || 12;
        
        saveData({ users, nextId });
        
        console.log('✅ Profile updated successfully');
        
        res.json({
            success: true,
            message: 'Profile updated successfully',
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                username: user.username,
                bio: user.bio || '',
                location: user.location || '',
                pronouns: user.pronouns || '',
                profilePicture: user.profilePicture || 'https://ui-avatars.com/api/?name=User&background=E0B973&color=3B1D14&size=150',
                favoriteGenres: user.favoriteGenres || [],
                favoriteAuthors: user.favoriteAuthors || [],
                favoriteBooks: user.favoriteBooks || [],
                readingHabit: user.readingHabit || '',
                readingGoal: user.readingGoal || 12,
                preferredFormats: user.preferredFormats || [],
                discussionPreferences: user.discussionPreferences || [],
                receiveRecommendations: user.receiveRecommendations || false,
                questionnaireCompleted: user.questionnaireCompleted || false,
                googleAuth: user.googleAuth || false,
                createdAt: user.createdAt,
                booksRead: user.booksRead || [],
                following: user.following || [],
                followers: user.followers || [],
                isVerified: user.isVerified || false
            }
        });
        
    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error updating profile'
        });
    }
});

// ==================== DEBUG ENDPOINTS ====================

// Clear all users
app.delete('/debug/clear-users', (req, res) => {
    console.log('\n🗑️ ============ CLEAR ALL USERS ============');
    
    users = [];
    nextId = 1;
    saveData({ users, nextId });
    
    console.log('✅ All users cleared');
    
    res.json({ 
        success: true, 
        message: 'All users cleared',
        users: users,
        nextId: nextId
    });
});

// Get all users
app.get('/debug/users', (req, res) => {
    console.log('\n👥 ============ GET ALL USERS ============');
    
    res.json({
        success: true,
        users: users.map(u => ({
            id: u.id,
            name: u.name,
            email: u.email,
            username: u.username,
            isVerified: u.isVerified,
            googleAuth: u.googleAuth || false,
            questionnaireCompleted: u.questionnaireCompleted || false,
            favoriteGenres: u.favoriteGenres || [],
            favoriteAuthors: u.favoriteAuthors || [],
            favoriteBooks: u.favoriteBooks || [],
            readingHabit: u.readingHabit || '',
            profilePicture: u.profilePicture || '',
            bio: u.bio || '',
            location: u.location || '',
            pronouns: u.pronouns || '',
            createdAt: u.createdAt,
            resetOTP: u.resetOTP,
            resetOTPExpiry: u.resetOTPExpiry
        })),
        total: users.length
    });
});

// Test forgot password directly
app.post('/debug/test-forgot', (req, res) => {
    const { email } = req.body;
    console.log('\n🔧 ============ TEST FORGOT PASSWORD ============');
    console.log('Email:', email);
    
    const user = users.find(u => u.email === email);
    
    if (user) {
        const otp = generateOTP();
        console.log('🔢 Generated OTP:', otp);
        res.json({
            success: true,
            message: 'Test OTP generated',
            otp: otp,
            userExists: true,
            user: {
                name: user.name,
                email: user.email,
                username: user.username
            }
        });
    } else {
        res.json({
            success: true,
            message: 'User not found',
            userExists: false
        });
    }
});

const PORT = 5002;
app.listen(PORT, () => {
    console.log('='.repeat(70));
    console.log('🚀 LITLINK BACKEND STARTED');
    console.log('='.repeat(70));
    console.log(`📍 Server URL: http://localhost:${PORT}`);
    console.log(`📍 Also: http://127.0.0.1:${PORT}`);
    console.log('='.repeat(70));
    console.log('🌐 CORS ALLOWED ORIGINS:');
    console.log('   - http://127.0.0.1:5500');
    console.log('   - http://localhost:5500');
    console.log('   - http://127.0.0.1:5000');
    console.log('   - http://localhost:5000');
    console.log('='.repeat(70));
    console.log('📧 EMAIL STATUS:');
    console.log(`   ${process.env.EMAIL_USER && process.env.EMAIL_USER !== 'test@example.com' ? '✅ Configured' : '⚠️ Using console logs only'}`);
    console.log('='.repeat(70));
    console.log('✅ TEST ENDPOINTS:');
    console.log(`   1. Health: http://localhost:${PORT}/api/health`);
    console.log(`   2. API Test: http://localhost:${PORT}/api/test`);
    console.log(`   3. All Users: http://localhost:${PORT}/debug/users`);
    console.log(`   4. Clear Users: curl -X DELETE http://localhost:${PORT}/debug/clear-users`);
    console.log('='.repeat(70));
    console.log(`📊 Total Users: ${users.length}`);
    console.log('='.repeat(70));
});