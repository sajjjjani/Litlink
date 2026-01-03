// ===== CONFIGURATION =====
const API_BASE_URL = 'http://localhost:5002/api';

// ===== PATH DEBUG =====
console.log('=== PATH DEBUG ===');
console.log('Current full URL:', window.location.href);
console.log('Current path:', window.location.pathname);
console.log('Current folder:', window.location.pathname.split('/').pop());
console.log('Auth.js location: Homepage folder');

// ===== AUTH STATE MANAGEMENT - COMPLETELY FIXED =====
class AuthState {
  static getToken() {
    // Check ALL possible token keys
    return localStorage.getItem('litlink_token') || 
           localStorage.getItem('authToken') || 
           localStorage.getItem('token');
  }

  static getUser() {
    // Check ALL possible user keys
    const userStr = localStorage.getItem('litlink_user') || 
                    localStorage.getItem('user');
    try {
      return userStr ? JSON.parse(userStr) : null;
    } catch (error) {
      console.error('Error parsing user data:', error);
      return null;
    }
  }

  static getUserId() {
    // Check ALL possible userId keys
    const userId = localStorage.getItem('litlink_userId') || 
                   localStorage.getItem('userId');
    
    if (userId) return userId;
    
    // Fallback: Extract from user object
    const user = this.getUser();
    return user?.id || user?._id || null;
  }

  static setAuth(token, user) {
    // Store in NEW format (litlink_*)
    localStorage.setItem('litlink_token', token);
    localStorage.setItem('litlink_user', JSON.stringify(user));
    localStorage.setItem('litlink_userId', user.id || user._id);
    
    // Store in OLD format (backward compatibility)
    localStorage.setItem('authToken', token);
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('userId', user.id || user._id);
    
    console.log('✅ Auth data stored in ALL formats:', {
      token: token.substring(0, 20) + '...',
      user: user.name || user.email,
      userId: user.id || user._id
    });
    
    // Verify storage immediately
    this.verifyStorage();
  }

  static clearAuth() {
    // Clear ALL possible auth keys
    const keys = [
      'litlink_token', 'litlink_user', 'litlink_userId',
      'authToken', 'token', 'user', 'userId'
    ];
    
    keys.forEach(key => {
      localStorage.removeItem(key);
      console.log(`🗑️ Cleared: ${key}`);
    });
    
    console.log('✅ All auth data cleared');
  }

  static isAuthenticated() {
    return !!this.getToken();
  }

  static isAdmin() {
    const user = this.getUser();
    return user?.isAdmin === true;
  }

  static verifyStorage() {
    console.log('🔍 Storage Verification:');
    console.log('- litlink_token:', !!localStorage.getItem('litlink_token'));
    console.log('- litlink_user:', !!localStorage.getItem('litlink_user'));
    console.log('- litlink_userId:', localStorage.getItem('litlink_userId'));
    console.log('- token:', !!localStorage.getItem('token'));
    console.log('- user:', !!localStorage.getItem('user'));
    console.log('- userId:', localStorage.getItem('userId'));
  }
}

// ===== Modal Functions =====
function openModal(modalId) {
    console.log('Opening modal:', modalId);
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
        document.body.classList.add('modal-open');
    }
}

function closeModal(modalId) {
    console.log('Closing modal:', modalId);
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
        document.body.classList.remove('modal-open');
    }
}

function closeAllModals() {
    console.log('Closing all modals');
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.classList.remove('active');
    });
    document.body.classList.remove('modal-open');
}

// ===== Loading States =====
function showLoading(buttonId, text) {
    const button = document.getElementById(buttonId);
    if (button) {
        button.innerHTML = `<span class="loading">${text}...</span>`;
        button.disabled = true;
    }
}

function hideLoading(buttonId, text) {
    const button = document.getElementById(buttonId);
    if (button) {
        button.textContent = text;
        button.disabled = false;
    }
}

// ===== FORM VALIDATION =====
function showError(inputId, message) {
    const errorElement = document.getElementById(inputId + 'Error');
    const inputElement = document.getElementById(inputId);
    
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.style.color = '#ef4444';
    }
    
    if (inputElement) {
        inputElement.classList.add('error');
        inputElement.classList.remove('success');
    }
}

function showSuccess(inputId) {
    const errorElement = document.getElementById(inputId + 'Error');
    const inputElement = document.getElementById(inputId);
    
    if (errorElement) {
        errorElement.textContent = '';
    }
    
    if (inputElement) {
        inputElement.classList.remove('error');
        inputElement.classList.add('success');
    }
}

function validatePassword(password) {
    const requirements = {
        length: password.length >= 8,
        uppercase: /[A-Z]/.test(password),
        number: /[0-9]/.test(password),
        special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
    };
    
    Object.keys(requirements).forEach(key => {
        const element = document.getElementById(`req-${key}`);
        if (element) {
            if (requirements[key]) {
                element.classList.remove('req-unmet');
                element.classList.add('req-met');
                const icon = element.querySelector('i');
                if (icon) icon.className = 'fas fa-check';
            } else {
                element.classList.remove('req-met');
                element.classList.add('req-unmet');
                const icon = element.querySelector('i');
                if (icon) icon.className = 'fas fa-times';
            }
        }
    });
    
    return Object.values(requirements).every(Boolean);
}

function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function validateName(name) {
    return name.trim().length >= 2;
}

// ===== REAL-TIME FORM VALIDATION =====
function setupRealTimeFormValidation() {
    // Password confirmation validation
    const signupPassword = document.getElementById('signupPassword');
    const confirmPassword = document.getElementById('confirmPassword');
    
    if (confirmPassword) {
        confirmPassword.addEventListener('input', function() {
            const password = signupPassword?.value || '';
            const confirm = this.value;
            
            if (confirm && password !== confirm) {
                showError('confirmPassword', 'Passwords do not match');
            } else if (confirm && password === confirm) {
                showSuccess('confirmPassword');
            } else {
                const errorElement = document.getElementById('confirmPasswordError');
                if (errorElement) errorElement.textContent = '';
            }
        });
    }
    
    // Email validation
    const emailInputs = ['loginEmail', 'signupEmail', 'forgotEmail'];
    emailInputs.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('blur', function() {
                if (this.value && !validateEmail(this.value)) {
                    showError(id, 'Please enter a valid email address');
                } else if (this.value) {
                    showSuccess(id);
                }
            });
        }
    });
    
    // Name validation
    const nameInput = document.getElementById('signupName');
    if (nameInput) {
        nameInput.addEventListener('blur', function() {
            if (this.value && !validateName(this.value)) {
                showError('signupName', 'Name must be at least 2 characters');
            } else if (this.value) {
                showSuccess('signupName');
            }
        });
    }
    
    // Password validation
    if (signupPassword) {
        signupPassword.addEventListener('blur', function() {
            if (this.value && !validatePassword(this.value)) {
                showError('signupPassword', 'Password does not meet requirements');
            } else if (this.value) {
                showSuccess('signupPassword');
            }
        });
    }
}

// ===== SIGNUP =====
async function handleSignup(formData) {
    try {
        showLoading('signupSubmit', 'Creating account');
        
        console.log('Sending signup request:', { 
            name: formData.name, 
            email: formData.email
        });
        
        // Additional client-side validation
        if (formData.password !== formData.confirmPassword) {
            alert('Passwords do not match');
            hideLoading('signupSubmit', 'Create Account');
            return;
        }
        
        if (!validateName(formData.name)) {
            alert('Name must be at least 2 characters');
            hideLoading('signupSubmit', 'Create Account');
            return;
        }
        
        if (!validateEmail(formData.email)) {
            alert('Please enter a valid email address');
            hideLoading('signupSubmit', 'Create Account');
            return;
        }
        
        if (!validatePassword(formData.password)) {
            alert('Password must be at least 8 characters with uppercase, number, and special character');
            hideLoading('signupSubmit', 'Create Account');
            return;
        }
        
        const response = await fetch(`${API_BASE_URL}/auth/signup`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: formData.name,
                email: formData.email,
                password: formData.password
            })
        });
        
        const data = await response.json();
        console.log('Signup response:', data);
        
        if (data.success) {
            // Store verification data
            sessionStorage.setItem('pendingVerificationEmail', formData.email);
            sessionStorage.setItem('verificationCode', data.verificationCode);
            
            // Show success message
            alert('Account created successfully! Please check your email for verification instructions.');
            
            // Close modal and redirect to verify-email.html
            closeAllModals();
            
            // Wait a moment then redirect (verify-email.html is in same Homepage folder)
            setTimeout(() => {
                window.location.href = `verify-email.html?email=${encodeURIComponent(formData.email)}&code=${data.verificationCode}`;
            }, 1000);
            
        } else {
            alert('Signup failed: ' + data.message);
        }
    } catch (error) {
        console.error('Signup error:', error);
        alert('Unable to connect to the server. Please check your internet connection and try again.');
    } finally {
        hideLoading('signupSubmit', 'Create Account');
    }
}

// ===== LOGIN - COMPLETELY FIXED =====
async function handleLogin(formData) {
    try {
        showLoading('loginSubmit', 'Logging in');
        
        console.log('=== LOGIN DEBUG INFO ===');
        console.log('Current location:', window.location.href);
        console.log('Current pathname:', window.location.pathname);
        console.log('Auth.js location: Homepage folder');
        console.log('Trying to login with:', formData.email);
        
        console.log('Sending login request:', { 
            email: formData.email
        });
        
        // Client-side validation
        if (!validateEmail(formData.email)) {
            alert('Please enter a valid email address');
            hideLoading('loginSubmit', 'Login');
            return;
        }
        
        if (!formData.password || formData.password.length < 1) {
            alert('Please enter your password');
            hideLoading('loginSubmit', 'Login');
            return;
        }
        
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(formData)
        });
        
        const data = await response.json();
        console.log('Login response:', data);
        
        if (data.success) {
            // CRITICAL: Save auth data using FIXED method
            AuthState.setAuth(data.token, data.user);
            
            console.log('✅ Auth data saved to localStorage');
            
            // Show success message
            alert('Login successful! Redirecting...');
            closeAllModals();
            
            // FIXED: Reliable redirect logic
            setTimeout(() => {
                console.log('📄 DEBUG Redirect Info:', {
                    serverRedirect: data.redirectTo,
                    userIsAdmin: data.user.isAdmin,
                    userName: data.user.name
                });
                
                // Use server-provided redirect path
                if (data.redirectTo) {
                    console.log('📄 Using server redirect:', data.redirectTo);
                    window.location.href = data.redirectTo;
                }
                // Fallback based on user type
                else if (data.user.isAdmin) {
                    console.log('📄 Admin detected, redirecting to admin dashboard');
                    window.location.href = '../Admin%20Dashboard/admin.html';
                } else {
                    console.log('📄 Regular user, redirecting to profile');
                    window.location.href = '../Profile/profile.html';
                }
            }, 1000);
            
        } else if (data.requiresVerification) {
            // User needs to verify email
            alert('Please verify your email first. Check your inbox for the verification link.');
            
            // Store email for verification
            sessionStorage.setItem('pendingVerificationEmail', formData.email);
            
            // Close modal and redirect to verification
            closeAllModals();
            
            // Redirect to verify-email page (in same Homepage folder)
            setTimeout(() => {
                window.location.href = `verify-email.html?email=${encodeURIComponent(formData.email)}`;
            }, 1000);
            
        } else {
            alert('Login failed: ' + data.message);
        }
    } catch (error) {
        console.error('Login error:', error);
        alert('Unable to connect to the server. Please check your internet connection and try again.');
    } finally {
        hideLoading('loginSubmit', 'Login');
    }
}

// ===== FORGOT PASSWORD =====
async function handleForgotPassword(email) {
    try {
        showLoading('forgotPasswordSubmit', 'Sending');
        
        console.log('Forgot password request:', { email });
        
        if (!validateEmail(email)) {
            alert('Please enter a valid email address');
            hideLoading('forgotPasswordSubmit', 'Send Reset Link');
            return;
        }
        
        const response = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email })
        });
        
        const data = await response.json();
        console.log('Forgot password response:', data);
        
        if (data.success) {
            alert('Password reset email sent successfully! Please check your inbox.');
            
            // Store email for OTP verification
            sessionStorage.setItem('resetEmail', email);
            
            // Close modal and redirect to verify-otp.html
            closeAllModals();
            
            // Redirect to OTP verification page (in same Homepage folder)
            setTimeout(() => {
                window.location.href = `verify-otp.html?email=${encodeURIComponent(email)}`;
            }, 1000);
            
        } else {
            alert('Failed: ' + data.message);
        }
    } catch (error) {
        console.error('Forgot password error:', error);
        alert('Unable to connect to the server. Please check your internet connection and try again.');
    } finally {
        hideLoading('forgotPasswordSubmit', 'Send Reset Link');
    }
}

// ===== RESEND VERIFICATION =====
async function resendVerificationCode() {
    const email = sessionStorage.getItem('pendingVerificationEmail');
    if (!email) {
        alert('No email found. Please sign up again.');
        return;
    }
    
    try {
        console.log('Resending verification code to:', email);
        
        const response = await fetch(`${API_BASE_URL}/auth/resend-verification`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email })
        });
        
        const data = await response.json();
        console.log('Resend verification response:', data);
        
        if (data.success) {
            alert('New verification email sent successfully!');
            sessionStorage.setItem('verificationCode', data.verificationCode);
        } else {
            alert('Failed to resend code: ' + data.message);
        }
    } catch (error) {
        console.error('Resend verification error:', error);
        alert('Unable to connect to the server. Please check your internet connection and try again.');
    }
}

// ===== LOGOUT =====
function handleLogout() {
    AuthState.clearAuth();
    alert('Logged out successfully');
    
    setTimeout(() => {
        // If we're in homepage already, just reload
        if (window.location.pathname.includes('Homepage')) {
            window.location.href = 'index.html';
        } else {
            // Go back to homepage from any other folder
            window.location.href = '../Homepage/index.html';
        }
    }, 1000);
}

// ===== CHECK AUTH ON PAGE LOAD - FIXED NO REDIRECT LOOP =====
function checkAuthentication() {
    const token = AuthState.getToken();
    const user = AuthState.getUser();
    
    console.log('=== AUTH CHECK (NO AUTO-REDIRECT) ===');
    console.log('Has token:', !!token);
    console.log('User:', user?.name || user?.email || 'None');
    console.log('Current path:', window.location.pathname);
    
    // Get current path
    const currentPath = window.location.pathname;
    
    // PROTECTED PAGES: Only redirect if trying to access these without auth
    const protectedPages = ['profile', 'dashboard', 'settings'];
    const isProtectedPage = protectedPages.some(page => currentPath.includes(page));
    
    // ADMIN PAGES: Redirect if not admin
    const isAdminPage = (currentPath.includes('admin') || currentPath.includes('Admin')) 
        && !currentPath.includes('index.html');
    
    // ===== CRITICAL FIX: NO AUTO-REDIRECT FROM HOMEPAGE =====
    // User can stay on homepage even if logged in
    
    // Redirect ONLY if trying to access protected page without auth
    if (isProtectedPage && !token) {
        console.log('❌ Protected page requires authentication, redirecting...');
        alert('Please login first');
        setTimeout(() => {
            window.location.href = '../Homepage/index.html';
        }, 1500);
        return false;
    }
    
    // Redirect ONLY if trying to access admin page without admin privileges
    if (isAdminPage && (!token || !user?.isAdmin)) {
        console.log('❌ Admin page requires admin authentication, redirecting...');
        alert('Admin access required. Redirecting to homepage...');
        setTimeout(() => {
            window.location.href = '../Homepage/index.html';
        }, 1500);
        return false;
    }
    
    console.log('✅ Auth check passed - User can stay on current page');
    return true;
}

// ===== SAFARI FIXES =====
function fixSafariStorage() {
    if (navigator.userAgent.includes('Safari') && !navigator.userAgent.includes('Chrome')) {
        console.log('🦁 Safari detected, applying fixes...');
        
        // Force localStorage sync
        window.addEventListener('beforeunload', function() {
            localStorage.setItem('__safari_sync', Date.now().toString());
        });
        
        // Check for lost auth on profile pages
        window.addEventListener('load', function() {
            const token = AuthState.getToken();
            if (!token && window.location.pathname.includes('profile')) {
                console.log('⚠️ Safari may have lost auth data');
                // Don't auto-redirect, let the page handle it
            }
        });
    }
}

// ===== DEBUG UTILITIES =====
function debugLocalStorage() {
    console.log('🔍 DEBUG localStorage contents:');
    console.log('=== AUTH KEYS ===');
    console.log('litlink_token:', localStorage.getItem('litlink_token') ? '✓' : '✗');
    console.log('litlink_user:', localStorage.getItem('litlink_user') ? '✓' : '✗');
    console.log('litlink_userId:', localStorage.getItem('litlink_userId') || 'null');
    console.log('token:', localStorage.getItem('token') ? '✓' : '✗');
    console.log('user:', localStorage.getItem('user') ? '✓' : '✗');
    console.log('userId:', localStorage.getItem('userId') || 'null');
    console.log('authToken:', localStorage.getItem('authToken') ? '✓' : '✗');
    
    if (localStorage.getItem('litlink_user')) {
        try {
            const user = JSON.parse(localStorage.getItem('litlink_user'));
            console.log('=== USER DATA ===');
            console.log('Name:', user.name);
            console.log('Email:', user.email);
            console.log('Profile Picture:', user.profilePicture ? '✓' : '✗');
            console.log('Bio:', user.bio ? '✓' : '✗');
            console.log('Favorite Books:', user.favoriteBooks?.length || 0);
        } catch (e) {
            console.log('Error parsing user:', e);
        }
    }
}

// ===== INITIALIZE FORM VALIDATION =====
function initializeAuthForms() {
    // Setup real-time validation
    setupRealTimeFormValidation();
    
    // Login form submission
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const email = document.getElementById('loginEmail')?.value.trim();
            const password = document.getElementById('loginPassword')?.value;
            
            if (!email || !password) {
                alert('Please fill in all fields');
                return;
            }
            
            await handleLogin({ email, password });
        });
    }
    
    // Signup form submission
    const signupForm = document.getElementById('signupForm');
    if (signupForm) {
        signupForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const name = document.getElementById('signupName')?.value.trim();
            const email = document.getElementById('signupEmail')?.value.trim();
            const password = document.getElementById('signupPassword')?.value;
            const confirmPassword = document.getElementById('confirmPassword')?.value;
            
            // Basic validation
            if (!name || !email || !password || !confirmPassword) {
                alert('Please fill in all fields');
                return;
            }
            
            if (password !== confirmPassword) {
                alert('Passwords do not match');
                return;
            }
            
            await handleSignup({ name, email, password, confirmPassword });
        });
    }
    
    // Forgot password form submission
    const forgotPasswordForm = document.getElementById('forgotPasswordForm');
    if (forgotPasswordForm) {
        forgotPasswordForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const email = document.getElementById('forgotEmail')?.value.trim();
            
            if (!email) {
                alert('Please enter your email');
                return;
            }
            
            await handleForgotPassword(email);
        });
    }
}

// ===== EXPORT FUNCTIONS =====
window.handleSignup = handleSignup;
window.handleLogin = handleLogin;
window.handleForgotPassword = handleForgotPassword;
window.handleLogout = handleLogout;
window.resendVerificationCode = resendVerificationCode;
window.AuthState = AuthState;
window.openModal = openModal;
window.closeModal = closeModal;
window.closeAllModals = closeAllModals;
window.validatePassword = validatePassword;
window.validateEmail = validateEmail;
window.validateName = validateName;
window.showError = showError;
window.showSuccess = showSuccess;
window.initializeAuthForms = initializeAuthForms;
window.checkAuthentication = checkAuthentication;
window.debugLocalStorage = debugLocalStorage;

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Initializing auth system...');
    initializeAuthForms();
    fixSafariStorage();
    checkAuthentication();
    
    // Add debug button for testing
    const debugBtn = document.createElement('button');
    debugBtn.textContent = '🔍 Debug Storage';
    debugBtn.style.position = 'fixed';
    debugBtn.style.bottom = '10px';
    debugBtn.style.right = '10px';
    debugBtn.style.zIndex = '9999';
    debugBtn.style.padding = '5px 10px';
    debugBtn.style.background = '#333';
    debugBtn.style.color = 'white';
    debugBtn.style.border = 'none';
    debugBtn.style.borderRadius = '5px';
    debugBtn.style.fontSize = '12px';
    debugBtn.style.cursor = 'pointer';
    debugBtn.onclick = debugLocalStorage;
    document.body.appendChild(debugBtn);
    
    console.log('✅ Auth functions loaded and initialized!');
});