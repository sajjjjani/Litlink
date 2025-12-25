// ===== API CONFIGURATION =====
const API_BASE_URL = 'http://localhost:5002/api';

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
            
            // Wait a moment then redirect
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

// ===== LOGIN =====
async function handleLogin(formData) {
    try {
        showLoading('loginSubmit', 'Logging in');
        
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
            // Save user data
            localStorage.setItem('authToken', data.token);
            localStorage.setItem('userData', JSON.stringify(data.user));
            
            // Show success and redirect
            alert('Login successful! Redirecting to your profile...');
            closeAllModals();
            
            // Redirect to profile page
            setTimeout(() => {
                window.location.href = data.redirectTo || 'profile.html';
            }, 1000);
            
        } else if (data.requiresVerification) {
            // User needs to verify email
            alert('Please verify your email first. Check your inbox for the verification link.');
            
            // Store email for verification
            sessionStorage.setItem('pendingVerificationEmail', formData.email);
            
            // Close modal and redirect to verification
            closeAllModals();
            
            // Redirect to verify-email page
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
            
            // Redirect to OTP verification page
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
window.resendVerificationCode = resendVerificationCode;
window.openModal = openModal;
window.closeModal = closeModal;
window.closeAllModals = closeAllModals;
window.validatePassword = validatePassword;
window.validateEmail = validateEmail;
window.validateName = validateName;
window.showError = showError;
window.showSuccess = showSuccess;
window.initializeAuthForms = initializeAuthForms;

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    initializeAuthForms();
    console.log('✅ Auth functions loaded and initialized!');
});