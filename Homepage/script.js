const API_BASE = 'http://127.0.0.1:5002/api';

console.log('🔗 API_BASE is:', API_BASE);
console.log('🔗 Frontend URL:', window.location.href);

// Questionnaire Data
const genres = [
    'Fantasy', 'Science Fiction', 'Romance', 'Mystery', 'Thriller',
    'Historical Fiction', 'Non-Fiction', 'Biography', 'Young Adult',
    'Classics', 'Horror', 'Comedy', 'Drama', 'Adventure', 'Poetry'
];

// ==================== PASSWORD RESET VARIABLES ====================
let forgotPasswordEmail = '';
let forgotPasswordUserType = null;

// ==================== FIXED REDIRECT FUNCTIONS ====================

// Function to redirect to profile page (FIXED PATH)
function redirectToProfile() {
    console.log('🔄 Redirecting to profile page...');
    console.log('Current URL:', window.location.href);
    
    // Use correct absolute path
    const profilePath = window.location.origin + '/Profile/profile.html';
    console.log('📍 Redirecting to:', profilePath);
    window.location.href = profilePath;
}

// Function to redirect to homepage
function redirectToHome() {
    const homePath = window.location.origin + '/Homepage/index.html';
    console.log('📍 Redirecting to homepage:', homePath);
    window.location.href = homePath;
}

// ==================== PAGE NAVIGATION ====================
function showPage(page) {
    document.querySelectorAll('.page-section').forEach(section => {
        section.classList.remove('active');
    });
    
    document.getElementById(`${page}-page`).classList.add('active');
    window.scrollTo(0, 0);
}

// ==================== FAQ FUNCTIONALITY ====================
document.querySelectorAll('.faq-question').forEach(question => {
    question.addEventListener('click', () => {
        const item = question.parentElement;
        const answer = question.nextElementSibling;
        
        document.querySelectorAll('.faq-item').forEach(faq => {
            if (faq !== item) {
                faq.classList.remove('active');
                faq.querySelector('.faq-answer').classList.remove('active');
            }
        });
        
        item.classList.toggle('active');
        answer.classList.toggle('active');
    });
});

// ==================== QUESTIONNAIRE FUNCTIONS ====================
function initQuestionnaire() {
    const genreGrid = document.getElementById('genreGrid');
    if (!genreGrid) return;
    
    genreGrid.innerHTML = '';
    genres.forEach(genre => {
        const genreOption = document.createElement('div');
        genreOption.className = 'genre-option';
        genreOption.textContent = genre;
        genreOption.onclick = () => genreOption.classList.toggle('selected');
        genreGrid.appendChild(genreOption);
    });
}

function nextStep(step) {
    document.querySelector('.question-step.active').classList.remove('active');
    document.getElementById(`step${step}`).classList.add('active');
    updateProgress(step);
}

function prevStep(step) {
    document.querySelector('.question-step.active').classList.remove('active');
    document.getElementById(`step${step}`).classList.add('active');
    updateProgress(step);
}

function updateProgress(currentStep) {
    const progress = (currentStep / 8) * 100;
    const progressFill = document.getElementById('progressFill');
    if (progressFill) {
        progressFill.style.width = `${progress}%`;
    }
}

function selectReadingHabit(element) {
    const options = document.querySelectorAll('.reading-habit-option');
    options.forEach(option => option.classList.remove('selected'));
    element.classList.add('selected');
}

function toggleSelection(element) {
    element.classList.toggle('selected');
}

// Show questionnaire - ONLY for new users during signup
function showQuestionnaire(userId, isNewGoogleUser = false) {
    console.log('🎯 showQuestionnaire called for NEW user:', { userId, isNewGoogleUser });
    
    const user = localStorage.getItem('user');
    if (!user) {
        console.error('❌ Cannot show questionnaire: User not logged in');
        alert('Please log in first to complete your profile.');
        return;
    }
    
    const modal = document.getElementById('onboardingModal');
    if (!modal) {
        console.error('❌ Questionnaire modal not found');
        return;
    }
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    initQuestionnaire();
    
    modal.dataset.userId = userId;
    modal.dataset.isNewGoogleUser = isNewGoogleUser;
    
    console.log('✅ Questionnaire modal shown for new user ID:', userId);
}

// ==================== SUBMIT QUESTIONNAIRE (FOR NEW USERS ONLY) ====================
async function submitQuestionnaire() {
    const modal = document.getElementById('onboardingModal');
    if (!modal) {
        console.error('❌ Questionnaire modal not found');
        return;
    }
    
    const userId = modal.dataset.userId;
    const isNewGoogleUser = modal.dataset.isNewGoogleUser === 'true';
    
    console.log('📝 Submitting questionnaire for NEW user:', userId, 'isNewGoogleUser:', isNewGoogleUser);
    
    const questionnaireData = {
        selectedGenres: Array.from(document.querySelectorAll('#step1 .genre-option.selected'))
            .map(el => el.textContent),
        favoriteAuthors: [
            document.getElementById('author1')?.value || '',
            document.getElementById('author2')?.value || '',
            document.getElementById('author3')?.value || ''
        ].filter(author => author.trim() !== ''),
        favoriteBooks: [
            document.getElementById('book1')?.value || '',
            document.getElementById('book2')?.value || '',
            document.getElementById('book3')?.value || ''
        ].filter(book => book.trim() !== ''),
        readingHabit: document.querySelector('#step4 .reading-habit-option.selected')?.textContent || '',
        readingGoal: document.getElementById('readingGoal')?.value || 12,
        preferredFormats: Array.from(document.querySelectorAll('#step7 .genre-option.selected'))
            .map(el => el.textContent),
        discussionPreferences: Array.from(document.querySelectorAll('#step5 .genre-option.selected'))
            .map(el => el.textContent),
        receiveRecommendations: document.querySelector('#step8 .genre-option.selected')?.textContent === 
            'Yes, send me recommendations and updates'
    };
    
    if (questionnaireData.selectedGenres.length === 0) {
        alert('Please select at least one genre');
        return;
    }
    
    if (!questionnaireData.readingHabit) {
        alert('Please select your reading habit');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/auth/questionnaire`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                userId: userId,
                questionnaireData: questionnaireData
            }),
            mode: 'cors'
        });

        const data = await response.json();
        
        if (data.success) {
            alert('🎉 Profile completed! Welcome to Litlink!');
            
            localStorage.setItem('user', JSON.stringify(data.user));
            localStorage.setItem('token', data.token);
            
            closeModal();
            
            // FIXED: Use correct absolute path
            setTimeout(() => {
                const profilePath = window.location.origin + '/Profile/profile.html';
                console.log('🚀 Redirecting to:', profilePath);
                window.location.href = profilePath;
            }, 1500);
            
        } else {
            alert('❌ Failed to save questionnaire: ' + data.message);
        }
    } catch (error) {
        console.error('Questionnaire error:', error);
        alert('🌐 Network error. Make sure backend is running on port 5002.');
    }
}

// ==================== UNIFIED FORGOT PASSWORD FLOW ====================

function showForgotPassword() {
    closeModal();
    const modal = document.getElementById('forgotPasswordModal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

async function handleForgotPassword(formData) {
    try {
        console.log('🔐 Sending forgot password request...');
        
        const submitBtn = document.getElementById('forgotPasswordSubmit');
        const originalText = submitBtn.textContent;
        submitBtn.innerHTML = '<span class="loading">Sending OTP...</span>';
        submitBtn.disabled = true;
        
        forgotPasswordEmail = formData.email;
        
        console.log('🌐 Sending to:', `${API_BASE}/auth/forgot-password`);
        console.log('📧 Email:', formData.email);
        
        const response = await fetch(`${API_BASE}/auth/forgot-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Origin': window.location.origin
            },
            body: JSON.stringify(formData),
            mode: 'cors',
            credentials: 'omit'
        });

        console.log('📨 Response status:', response.status);
        
        let data;
        try {
            data = await response.json();
        } catch (parseError) {
            console.error('❌ Failed to parse JSON response:', parseError);
            const text = await response.text();
            console.error('Raw response:', text);
            throw new Error(`Invalid JSON response: ${text.substring(0, 100)}`);
        }
        
        console.log('📨 Response data:', data);
        
        if (!response.ok) {
            throw new Error(data.message || `HTTP ${response.status}`);
        }
        
        if (data.success) {
            closeModal();
            
            if (data.userExists) {
                forgotPasswordUserType = data.isGoogleUser ? 'google' : 'regular';
                
                const otpMessage = data.otp ? 
                    `\n\n📱 For testing, your OTP is: ${data.otp}` : 
                    '\n\n📱 Check your console for the OTP code.';
                
                alert(`✅ OTP sent to ${formData.email}!${otpMessage}`);
                console.log('🔢 OTP for testing:', data.otp || 'Check console above');
                console.log('👤 User type:', forgotPasswordUserType);
                
                setTimeout(() => {
                    showOTPEntryModal(formData.email, data.otp, data.isGoogleUser);
                }, 1000);
            } else {
                alert('📧 If an account exists with this email, OTP has been sent.');
            }
            
        } else {
            alert('❌ ' + (data.message || 'Failed to send OTP'));
        }
    } catch (error) {
        console.error('❌ Forgot password error:', error);
        console.error('Error stack:', error.stack);
        
        if (error.message.includes('Failed to fetch')) {
            alert(`🌐 Network Error: Cannot connect to backend at ${API_BASE}\n\nPlease check:\n1. Is the backend running? (node simple-server.js)\n2. Is port 5002 available?\n3. Check browser console for CORS errors`);
            testBackendConnection();
        } else if (error.message.includes('Invalid JSON')) {
            alert(`📄 Server Error: Invalid response from server\n\n${error.message}\n\nCheck backend logs for errors.`);
        } else {
            alert(`❌ Error: ${error.message}`);
        }
    } finally {
        const submitBtn = document.getElementById('forgotPasswordSubmit');
        if (submitBtn) {
            submitBtn.textContent = 'Send Reset OTP';
            submitBtn.disabled = false;
        }
    }
}

// Show OTP Entry Modal
function showOTPEntryModal(email, prefilledOTP = '', isGoogleUser = false) {
    const existingModal = document.getElementById('otpEntryModal');
    if (existingModal) existingModal.remove();
    
    const modalHTML = `
    <div class="modal-overlay active" id="otpEntryModal">
        <div class="signup-modal">
            <div class="modal-header">
                <h2>Enter OTP</h2>
                <button class="close-btn">&times;</button>
            </div>
            <p style="margin-bottom: 20px;">Enter the 6-digit OTP sent to your email.</p>
            <form id="otpEntryForm">
                <div class="form-group">
                    <input type="email" id="otpEntryEmail" value="${email}" readonly>
                </div>
                <div class="form-group">
                    <input type="text" id="otpEntryCode" placeholder="Enter 6-digit OTP" maxlength="6" value="${prefilledOTP}">
                    <div class="error-message" id="otpEntryError"></div>
                </div>
                <button type="submit" class="signup-btn">Verify OTP</button>
            </form>
            <div class="switch-link">
                Didn't receive OTP? <a onclick="resendOTP()">Resend OTP</a>
            </div>
        </div>
    </div>`;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    document.getElementById('otpEntryForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const email = document.getElementById('otpEntryEmail').value;
        const otp = document.getElementById('otpEntryCode').value;
        
        if (!otp || otp.length !== 6) {
            alert('Please enter a valid 6-digit OTP');
            return;
        }
        
        try {
            const response = await fetch(`${API_BASE}/auth/verify-otp`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ email, otp }),
                mode: 'cors'
            });
            
            const data = await response.json();
            
            if (data.success) {
                document.getElementById('otpEntryModal').remove();
                document.body.style.overflow = 'auto';
                
                alert(`✅ OTP verified! Check your email for verification link.\n\nFor testing, verification code: ${data.verificationCode}`);
                
                if (data.isGoogleUser) {
                    alert('📧 Since you signed up with Google, you\'ll need to set a password for email login.');
                }
                
            } else {
                const errorEl = document.getElementById('otpEntryError');
                if (errorEl) {
                    errorEl.textContent = data.message;
                    errorEl.classList.add('show');
                }
            }
        } catch (error) {
            alert('🌐 Network error');
        }
    });
    
    document.querySelector('#otpEntryModal .close-btn').addEventListener('click', function() {
        document.getElementById('otpEntryModal').remove();
        document.body.style.overflow = 'auto';
    });
    
    document.getElementById('otpEntryModal').addEventListener('click', function(e) {
        if (e.target === this) {
            this.remove();
            document.body.style.overflow = 'auto';
        }
    });
    
    document.body.style.overflow = 'hidden';
}

function resendOTP() {
    if (!forgotPasswordEmail) {
        alert('Please enter your email first');
        return;
    }
    
    const emailInput = document.getElementById('forgotEmail');
    const submitBtn = document.getElementById('forgotPasswordSubmit');
    
    if (emailInput && submitBtn) {
        emailInput.value = forgotPasswordEmail;
        submitBtn.click();
    }
}

// ==================== EMAIL VERIFICATION ====================

function showResendVerification(email = '') {
    closeModal();
    const modal = document.getElementById('resendVerificationModal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        if (email) {
            const emailInput = document.getElementById('verifyEmail');
            if (emailInput) emailInput.value = email;
        }
    }
}

async function handleResendVerification(formData) {
    try {
        const submitBtn = document.getElementById('resendVerificationSubmit');
        if (submitBtn) {
            submitBtn.innerHTML = '<span class="loading">Sending...</span>';
            submitBtn.disabled = true;
        }
        
        const response = await fetch(`${API_BASE}/auth/resend-verification`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(formData),
            mode: 'cors'
        });

        const data = await response.json();
        
        if (data.success) {
            alert(`✅ New verification code sent!\n\nFor testing, code is: ${data.verificationCode}\n\nOr go to: ${data.verificationUrl || 'verify-email.html'}`);
            console.log('🔢 New verification code:', data.verificationCode);
            console.log('🔗 Verification URL:', data.verificationUrl);
            closeModal();
        } else {
            alert('❌ ' + data.message);
        }
    } catch (error) {
        console.error('Resend verification error:', error);
        alert('🌐 Network error.');
    } finally {
        const submitBtn = document.getElementById('resendVerificationSubmit');
        if (submitBtn) {
            submitBtn.textContent = 'Resend Verification Email';
            submitBtn.disabled = false;
        }
    }
}

function switchToLoginFromResend() {
    closeModal();
    const loginModal = document.getElementById('loginModal');
    if (loginModal) loginModal.classList.add('active');
}

// ==================== GOOGLE AUTHENTICATION ====================

async function signInWithGoogle() {
    try {
        const email = prompt('Enter your email (simulating Google login):', 'user@gmail.com');
        const name = prompt('Enter your name:', 'Google User');
        
        if (!email) {
            alert('Email is required');
            return;
        }
        
        const response = await fetch(`${API_BASE}/auth/google-simple`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ email, name }),
            mode: 'cors'
        });

        const data = await response.json();

        if (data.success) {
            if (data.requiresVerification) {
                alert(`📧 Verification code sent!\n\nCode: ${data.verificationCode}\n\nURL: ${data.verificationUrl}\n\nClick the link in your email or use the code above.`);
                
                localStorage.setItem('pendingUser', JSON.stringify(data.user));
                
                setTimeout(() => {
                    showVerificationModal(email, data.verificationCode || '');
                }, 1000);
                
            } else {
                localStorage.setItem('token', data.token);
                localStorage.setItem('user', JSON.stringify(data.user));
                closeModal();
                
                console.log('🔐 Google login successful');
                
                if (data.needsQuestionnaire || !data.user.questionnaireCompleted) {
                    alert('📚 Welcome to Litlink! Let\'s set up your reading profile.');
                    showQuestionnaire(data.user.id, true);
                } else {
                    alert('🎉 Welcome back to Litlink!');
                    
                    setTimeout(() => {
                        const profilePath = window.location.origin + '/Profile/profile.html';
                        window.location.href = profilePath;
                    }, 1500);
                }
            }
        } else {
            if (data.requiresVerification) {
                alert('📧 Please verify your email before logging in.');
                showResendVerification(data.email || email);
            } else {
                alert('Google authentication failed: ' + data.message);
            }
        }
    } catch (error) {
        console.error('Error during Google sign-in:', error);
        alert('Failed to sign in. Make sure backend is running.');
    }
}

// ==================== VERIFICATION CODE MODAL (FOR NEW USERS) ====================
function showVerificationModal(email = '', prefilledCode = '') {
    const existingModal = document.getElementById('verificationModal');
    if (existingModal) existingModal.remove();
    
    const modalHTML = `
    <div class="modal-overlay active" id="verificationModal">
        <div class="signup-modal">
            <div class="modal-header">
                <h2>📧 Verify Your Email</h2>
                <button class="close-btn">&times;</button>
            </div>
            <p style="margin-bottom: 20px;">Enter the 6-digit verification code sent to your email.</p>
            <form id="verificationForm">
                <div class="form-group">
                    <input type="email" id="verificationEmail" value="${email}" placeholder="Your email" ${email ? 'readonly' : ''}>
                </div>
                <div class="form-group">
                    <input type="text" id="verificationCode" placeholder="Enter 6-digit code" maxlength="6" value="${prefilledCode}">
                    <div class="error-message" id="verificationError"></div>
                </div>
                <button type="submit" class="signup-btn">Verify Email</button>
            </form>
            <div class="switch-link">
                Didn't receive code? <a onclick="resendVerificationCode()">Resend Code</a>
                <br>
                <a onclick="switchToLoginFromVerification()">Back to Login</a>
            </div>
        </div>
    </div>`;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    document.getElementById('verificationForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const email = document.getElementById('verificationEmail').value;
        const code = document.getElementById('verificationCode').value;
        
        if (!email || !code) {
            alert('Please enter both email and verification code');
            return;
        }
        
        try {
            const response = await fetch(`${API_BASE}/auth/verify-email`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ email, code }),
                mode: 'cors'
            });
            
            const data = await response.json();
            
            if (data.success) {
                document.getElementById('verificationModal').remove();
                document.body.style.overflow = 'auto';
                
                alert(`✅ Email verified successfully! Now let's set up your reading profile.`);
                
                localStorage.setItem('token', data.token);
                localStorage.setItem('user', JSON.stringify(data.user));
                
                showQuestionnaire(data.user.id);
                
            } else {
                const errorEl = document.getElementById('verificationError');
                if (errorEl) {
                    errorEl.textContent = data.message;
                    errorEl.classList.add('show');
                }
            }
        } catch (error) {
            alert('🌐 Network error');
        }
    });
    
    document.querySelector('#verificationModal .close-btn').addEventListener('click', function() {
        document.getElementById('verificationModal').remove();
        document.body.style.overflow = 'auto';
    });
    
    document.getElementById('verificationModal').addEventListener('click', function(e) {
        if (e.target === this) {
            this.remove();
            document.body.style.overflow = 'auto';
        }
    });
    
    document.body.style.overflow = 'hidden';
}

function resendVerificationCode() {
    const emailInput = document.getElementById('verificationEmail');
    if (!emailInput || !emailInput.value) {
        alert('Please enter your email first');
        return;
    }
    
    fetch(`${API_BASE}/auth/resend-verification`, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify({ email: emailInput.value }),
        mode: 'cors'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert(`✅ New verification code sent!\n\nCode: ${data.verificationCode}\n\nOr go to: ${data.verificationUrl}`);
            console.log('New verification code:', data.verificationCode);
        } else {
            alert('❌ ' + data.message);
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert('Network error');
    });
}

function switchToLoginFromVerification() {
    const modal = document.getElementById('verificationModal');
    if (modal) modal.remove();
    document.body.style.overflow = 'auto';
    const loginModal = document.getElementById('loginModal');
    if (loginModal) loginModal.classList.add('active');
}

// ==================== API FUNCTIONS ====================

async function handleSignup(formData) {
    try {
        console.log('🚀 Starting signup process...');
        const submitBtn = document.getElementById('signupSubmit');
        if (submitBtn) {
            submitBtn.innerHTML = '<span class="loading">Signing up...</span>';
            submitBtn.disabled = true;
        }
        
        const response = await fetch(`${API_BASE}/auth/signup`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(formData),
            mode: 'cors'
        });

        const data = await response.json();
        console.log('📨 Signup response:', data);
        
        if (data.success) {
            console.log('✅ Signup successful!');
            
            if (data.requiresVerification) {
                localStorage.setItem('pendingUser', JSON.stringify(data.user));
                
                closeModal();
                alert(`📧 Verification code sent!\n\nCode: ${data.verificationCode}\n\nURL: ${data.verificationUrl}\n\nClick the link in your email or use the code above.`);
                
                setTimeout(() => {
                    showVerificationModal(formData.email, data.verificationCode || '');
                }, 1000);
            }
            
        } else {
            alert('❌ Sign up failed: ' + data.message);
        }
    } catch (error) {
        console.error('Signup error:', error);
        alert('🌐 Network error. Make sure backend is running on port 5002.');
    } finally {
        const submitBtn = document.getElementById('signupSubmit');
        if (submitBtn) {
            submitBtn.textContent = 'Sign up';
            submitBtn.disabled = false;
        }
    }
}

// ==================== LOGIN HANDLER (RETURNING USERS ONLY - NO QUESTIONNAIRE) ====================
async function handleLogin(formData) {
    try {
        const submitBtn = document.getElementById('loginSubmit');
        if (submitBtn) {
            submitBtn.innerHTML = '<span class="loading">Logging in...</span>';
            submitBtn.disabled = true;
        }
        
        const response = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(formData),
            mode: 'cors'
        });

        const data = await response.json();
        
        if (data.success) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            
            console.log('🔐 Login successful for returning user');
            
            closeModal();
            
            alert('🎉 Welcome back to Litlink!');
            
            setTimeout(() => {
                const profilePath = window.location.origin + '/Profile/profile.html';
                console.log('🚀 Redirecting to profile:', profilePath);
                window.location.href = profilePath;
            }, 1500);
            
        } else {
            if (data.requiresVerification) {
                alert('📧 Please verify your email before logging in.');
                showResendVerification(formData.email);
            } else {
                alert('❌ Login failed: ' + data.message);
            }
        }
    } catch (error) {
        console.error('Login error:', error);
        alert('🌐 Network error. Make sure backend is running on port 5002.');
    } finally {
        const submitBtn = document.getElementById('loginSubmit');
        if (submitBtn) {
            submitBtn.textContent = 'Login';
            submitBtn.disabled = false;
        }
    }
}

function showLoading(buttonId, text) {
    const button = document.getElementById(buttonId);
    button.innerHTML = `<span class="loading">${text}...</span>`;
    button.disabled = true;
}

function hideLoading(buttonId, text) {
    const button = document.getElementById(buttonId);
    button.textContent = text;
    button.disabled = false;
}

// ==================== SCROLL ANIMATIONS ====================
const sections = document.querySelectorAll('.fade-in-section');
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
    }
  });
}, { threshold: 0.2 });
sections.forEach(section => observer.observe(section));

// ==================== MODAL FUNCTIONALITY ====================
const signupBtn = document.querySelector('.btn-signin');
const loginBtn = document.querySelector('.btn-login');
const closeBtns = document.querySelectorAll('.close-btn');
const switchToLogin = document.getElementById('switchToLogin');
const switchToSignup = document.getElementById('switchToSignup');
const switchToLoginFromForgot = document.getElementById('switchToLoginFromForgot');

if (signupBtn) {
    signupBtn.addEventListener('click', () => {
        const signupModal = document.getElementById('signupModal');
        if (signupModal) {
            signupModal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    });
}

if (loginBtn) {
    loginBtn.addEventListener('click', () => {
        const loginModal = document.getElementById('loginModal');
        if (loginModal) {
            loginModal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    });
}

if (closeBtns) {
    closeBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal-overlay');
            if (modal) {
                modal.classList.remove('active');
                document.body.style.overflow = 'auto';
            }
        });
    });
}

document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
        e.target.classList.remove('active');
        document.body.style.overflow = 'auto';
    }
});

if (switchToLogin) {
    switchToLogin.addEventListener('click', () => {
        const signupModal = document.getElementById('signupModal');
        const loginModal = document.getElementById('loginModal');
        if (signupModal && loginModal) {
            signupModal.classList.remove('active');
            loginModal.classList.add('active');
        }
    });
}

if (switchToSignup) {
    switchToSignup.addEventListener('click', () => {
        const loginModal = document.getElementById('loginModal');
        const signupModal = document.getElementById('signupModal');
        if (loginModal && signupModal) {
            loginModal.classList.remove('active');
            signupModal.classList.add('active');
        }
    });
}

if (switchToLoginFromForgot) {
    switchToLoginFromForgot.addEventListener('click', () => {
        closeModal();
        const loginModal = document.getElementById('loginModal');
        if (loginModal) loginModal.classList.add('active');
    });
}

function closeModal() {
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.classList.remove('active');
    });
    document.body.style.overflow = 'auto';
}

// ==================== PASSWORD VALIDATION ====================
const passwordInput = document.getElementById('password');
const confirmPasswordInput = document.getElementById('confirmPassword');
const otpNewPasswordInput = document.getElementById('otpNewPassword');
const otpConfirmNewPasswordInput = document.getElementById('otpConfirmNewPassword');
const signupSubmit = document.getElementById('signupSubmit');

function validatePassword(password) {
    const minLength = 8;
    
    if (password.length < minLength) {
        return 'Password must be at least 8 characters long';
    }
    
    return '';
}

if (passwordInput) {
    passwordInput.addEventListener('input', () => {
        const error = validatePassword(passwordInput.value);
        const passwordError = document.getElementById('passwordError');
        if (passwordError) {
            if (error) {
                passwordError.textContent = error;
                passwordError.classList.add('show');
                if (signupSubmit) signupSubmit.disabled = true;
            } else {
                passwordError.classList.remove('show');
                if (confirmPasswordInput && confirmPasswordInput.value && passwordInput.value !== confirmPasswordInput.value) {
                    const confirmPasswordError = document.getElementById('confirmPasswordError');
                    if (confirmPasswordError) {
                        confirmPasswordError.textContent = 'Passwords do not match';
                        confirmPasswordError.classList.add('show');
                    }
                    if (signupSubmit) signupSubmit.disabled = true;
                } else {
                    const confirmPasswordError = document.getElementById('confirmPasswordError');
                    if (confirmPasswordError) confirmPasswordError.classList.remove('show');
                    if (signupSubmit) signupSubmit.disabled = false;
                }
            }
        }
    });
}

if (confirmPasswordInput) {
    confirmPasswordInput.addEventListener('input', () => {
        if (passwordInput && passwordInput.value !== confirmPasswordInput.value) {
            const confirmPasswordError = document.getElementById('confirmPasswordError');
            if (confirmPasswordError) {
                confirmPasswordError.textContent = 'Passwords do not match';
                confirmPasswordError.classList.add('show');
            }
            if (signupSubmit) signupSubmit.disabled = true;
        } else {
            const confirmPasswordError = document.getElementById('confirmPasswordError');
            if (confirmPasswordError) confirmPasswordError.classList.remove('show');
            const error = passwordInput ? validatePassword(passwordInput.value) : '';
            if (signupSubmit) signupSubmit.disabled = !!error;
        }
    });
}

if (otpNewPasswordInput) {
    otpNewPasswordInput.addEventListener('input', () => {
        const error = validatePassword(otpNewPasswordInput.value);
        const otpNewPasswordError = document.getElementById('otpNewPasswordError');
        if (otpNewPasswordError) {
            if (error) {
                otpNewPasswordError.textContent = error;
                otpNewPasswordError.classList.add('show');
            } else {
                otpNewPasswordError.classList.remove('show');
            }
        }
    });
}

if (otpConfirmNewPasswordInput) {
    otpConfirmNewPasswordInput.addEventListener('input', () => {
        if (otpNewPasswordInput && otpNewPasswordInput.value !== otpConfirmNewPasswordInput.value) {
            const otpConfirmNewPasswordError = document.getElementById('otpConfirmNewPasswordError');
            if (otpConfirmNewPasswordError) {
                otpConfirmNewPasswordError.textContent = 'Passwords do not match';
                otpConfirmNewPasswordError.classList.add('show');
            }
        } else {
            const otpConfirmNewPasswordError = document.getElementById('otpConfirmNewPasswordError');
            if (otpConfirmNewPasswordError) otpConfirmNewPasswordError.classList.remove('show');
        }
    });
}

// ==================== SHOW/HIDE PASSWORD FUNCTIONALITY ====================
const togglePassword = document.getElementById('togglePassword');
const toggleConfirmPassword = document.getElementById('toggleConfirmPassword');
const toggleLoginPassword = document.getElementById('toggleLoginPassword');
const toggleOtpNewPassword = document.getElementById('toggleOtpNewPassword');
const toggleOtpConfirmNewPassword = document.getElementById('toggleOtpConfirmNewPassword');

if (togglePassword) {
    togglePassword.addEventListener('click', function() {
        const passwordField = document.getElementById('password');
        if (passwordField) {
            if (passwordField.type === 'password') {
                passwordField.type = 'text';
                this.textContent = 'Hide';
            } else {
                passwordField.type = 'password';
                this.textContent = 'Show';
            }
        }
    });
}

if (toggleConfirmPassword) {
    toggleConfirmPassword.addEventListener('click', function() {
        const passwordField = document.getElementById('confirmPassword');
        if (passwordField) {
            if (passwordField.type === 'password') {
                passwordField.type = 'text';
                this.textContent = 'Hide';
            } else {
                passwordField.type = 'password';
                this.textContent = 'Show';
            }
        }
    });
}

if (toggleLoginPassword) {
    toggleLoginPassword.addEventListener('click', function() {
        const passwordField = document.getElementById('loginPassword');
        if (passwordField) {
            if (passwordField.type === 'password') {
                passwordField.type = 'text';
                this.textContent = 'Hide';
            } else {
                passwordField.type = 'password';
                this.textContent = 'Show';
            }
        }
    });
}

if (toggleOtpNewPassword) {
    toggleOtpNewPassword.addEventListener('click', function() {
        const passwordField = document.getElementById('otpNewPassword');
        if (passwordField) {
            if (passwordField.type === 'password') {
                passwordField.type = 'text';
                this.textContent = 'Hide';
            } else {
                passwordField.type = 'password';
                this.textContent = 'Show';
            }
        }
    });
}

if (toggleOtpConfirmNewPassword) {
    toggleOtpConfirmNewPassword.addEventListener('click', function() {
        const passwordField = document.getElementById('otpConfirmNewPassword');
        if (passwordField) {
            if (passwordField.type === 'password') {
                passwordField.type = 'text';
                this.textContent = 'Hide';
            } else {
                passwordField.type = 'password';
                this.textContent = 'Show';
            }
        }
    });
}

// ==================== FORM SUBMISSIONS ====================
const signupForm = document.getElementById('signupForm');
const loginForm = document.getElementById('loginForm');
const forgotPasswordForm = document.getElementById('forgotPasswordForm');
const resendVerificationForm = document.getElementById('resendVerificationForm');

if (signupForm) {
    signupForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const password = passwordInput ? passwordInput.value : '';
        const confirmPassword = confirmPasswordInput ? confirmPasswordInput.value : '';
        
        const passwordErrorMsg = validatePassword(password);
        if (passwordErrorMsg) {
            const passwordError = document.getElementById('passwordError');
            if (passwordError) {
                passwordError.textContent = passwordErrorMsg;
                passwordError.classList.add('show');
            }
            return;
        }
        
        if (password !== confirmPassword) {
            const confirmPasswordError = document.getElementById('confirmPasswordError');
            if (confirmPasswordError) {
                confirmPasswordError.textContent = 'Passwords do not match';
                confirmPasswordError.classList.add('show');
            }
            return;
        }
        
        const formData = {
            name: document.getElementById('name')?.value || '',
            email: document.getElementById('email')?.value || '',
            password: password,
            username: document.getElementById('email')?.value.split('@')[0] || ''
        };
        
        handleSignup(formData);
    });
}

if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = {
            email: document.getElementById('loginEmail')?.value || '',
            password: document.getElementById('loginPassword')?.value || ''
        };
        
        handleLogin(formData);
    });
}

if (forgotPasswordForm) {
    forgotPasswordForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = {
            email: document.getElementById('forgotEmail')?.value || ''
        };
        handleForgotPassword(formData);
    });
}

if (resendVerificationForm) {
    resendVerificationForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = {
            email: document.getElementById('resendEmail')?.value || ''
        };
        handleResendVerification(formData);
    });
}

// ==================== AUTO-SHOW QUESTIONNAIRE AFTER VERIFICATION ====================
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Litlink frontend loaded');
    console.log('🌐 Frontend URL:', window.location.href);
    console.log('🔗 API Base:', API_BASE);
    
    const user = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    const showQuestionnaireFlag = localStorage.getItem('showQuestionnaire');
    const questionnaireUserId = localStorage.getItem('questionnaireUserId');
    
    if (showQuestionnaireFlag === 'true' && questionnaireUserId) {
        console.log('🎯 Auto-showing questionnaire after email verification');
        
        localStorage.removeItem('showQuestionnaire');
        localStorage.removeItem('questionnaireUserId');
        
        setTimeout(() => {
            showQuestionnaire(questionnaireUserId);
        }, 500);
    }
    
    if (user && token) {
        const userData = JSON.parse(user);
        updateWelcomeMessage(userData);
        
        console.log('👤 User logged in on page load:');
        console.log('- Name:', userData.name);
        console.log('- Questionnaire completed:', userData.questionnaireCompleted);
        
        if (!userData.questionnaireCompleted) {
            console.log('⚠️ User logged in but questionnaire not completed - showing questionnaire');
            setTimeout(() => {
                showQuestionnaire(userData.id);
            }, 1000);
        }
    }
    
    testBackendConnection();
    
    if (document.getElementById('genreGrid')) {
        initQuestionnaire();
    }
});

// Test backend connection function
async function testBackendConnection() {
    console.log('🔍 Testing backend connection...');
    
    const testUrls = [
        `${API_BASE}/test`,
        'http://127.0.0.1:5002/api/test'
    ];
    
    for (const url of testUrls) {
        try {
            console.log(`Trying: ${url}`);
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                },
                mode: 'cors'
            });
            if (response.ok) {
                const data = await response.json();
                console.log(`✅ Backend connection successful at: ${url}`);
                console.log('Response:', data);
                return true;
            } else {
                console.log(`❌ Failed to connect to: ${url}`, response.status);
            }
        } catch (error) {
            console.log(`❌ Network error for: ${url}`, error.message);
        }
    }
    
    console.error('❌ All backend connection attempts failed');
    console.log('⚠️ Make sure backend is running: node simple-server.js');
    return false;
}

// ==================== UPDATE WELCOME MESSAGE ====================
function updateWelcomeMessage(user) {
    const heroButtons = document.querySelector('.hero-buttons');
    if (heroButtons && user) {
        heroButtons.innerHTML = `
            <button class="btn-signin" onclick="redirectToProfile()">
                Welcome back, ${user.name}!
            </button>
            <button class="btn-login" onclick="logout()">Logout</button>
        `;
    }
}

function logout() {
    if (confirm('Are you sure you want to log out?')) {
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        localStorage.removeItem('pendingUser');
        window.location.reload();
    }
}

// ==================== MOBILE MENU ====================
const menuToggle = document.querySelector('.menu-toggle');
const navLinks = document.querySelector('.nav-links');
if (menuToggle && navLinks) {
    menuToggle.addEventListener('click', () => {
        navLinks.style.display = navLinks.style.display === 'flex' ? 'none' : 'flex';
    });
}

// ==================== NAVIGATION LINKS ====================
document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const page = link.getAttribute('data-page');
        if (page) {
            showPage(page);
        }
        if (window.innerWidth <= 768 && navLinks) {
            navLinks.style.display = 'none';
        }
    });
});

// Connection test function (for debugging)
async function testConnection() {
    console.log('🔧 Testing backend connection...');
    
    try {
        const response = await fetch(`${API_BASE}/test`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            mode: 'cors'
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log('✅ Backend connection successful!', data);
            alert(`✅ Backend connected!\n\nServer: ${data.frontendUrl}\nStatus: ${data.message}`);
        } else {
            console.log('❌ Backend responded with error:', response.status);
            alert(`❌ Backend error: HTTP ${response.status}`);
        }
    } catch (error) {
        console.error('❌ Backend connection failed:', error);
        alert(`❌ Cannot connect to backend at ${API_BASE}\n\nError: ${error.message}\n\nMake sure:\n1. Backend is running (node simple-server.js)\n2. Port 5002 is not blocked\n3. CORS is properly configured`);
    }
}