// ===== Detect which page we're on =====
const isHomePage = document.getElementById('heroSignupBtn') !== null;
const isExplorePage = document.getElementById('exploreLoginBtn') !== null;
console.log(`📄 Current page: ${isHomePage ? 'Homepage (index.html)' : isExplorePage ? 'Explore Page (explore.html)' : 'Unknown page'}`);

// ===== DOM Elements =====
// Homepage elements
const loginBtn = document.getElementById('loginBtn');
const signupBtn = document.getElementById('signupBtn');
const heroSignupBtn = document.getElementById('heroSignupBtn');
const ctaSignupBtn = document.getElementById('ctaSignupBtn');
const exploreCommunityBtn = document.getElementById('exploreCommunityBtn');

// Explore page elements
const exploreLoginBtn = document.getElementById('exploreLoginBtn');
const exploreSignupBtn = document.getElementById('exploreSignupBtn');
const exploreCtaSignupBtn = document.getElementById('exploreCtaSignupBtn');

// Preview signup buttons on explore page
const previewSignupBtn1 = document.getElementById('previewSignupBtn1');
const previewSignupBtn2 = document.getElementById('previewSignupBtn2');
const previewSignupBtn3 = document.getElementById('previewSignupBtn3');
const previewSignupBtn4 = document.getElementById('previewSignupBtn4');

// Action buttons on explore page
const actionBtn1 = document.getElementById('actionBtn1');
const actionBtn2 = document.getElementById('actionBtn2');
const actionBtn3 = document.getElementById('actionBtn3');
const actionBtn4 = document.getElementById('actionBtn4');

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

// ===== Event Listeners =====
document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ DOM loaded, setting up event listeners...');
    
    // Test backend connection (use API_BASE_URL from auth.js)
    testBackendConnection();
    
    // Setup based on page type
    if (isHomePage) {
        console.log('🏠 Setting up homepage events...');
        setupHomepageEvents();
    } else if (isExplorePage) {
        console.log('🔍 Setting up explore page events...');
        setupExplorePageEvents();
        initExplorePageFeatures(); // Add this line
    }
    
    // Setup common events for both pages
    setupCommonEvents();
    
    console.log('✅ Event listeners setup complete');
});

// ===== Homepage Events =====
function setupHomepageEvents() {
    // Open modal buttons
    if (loginBtn) {
        loginBtn.addEventListener('click', function(e) {
            e.preventDefault();
            console.log('Login button clicked');
            openModal('loginModal');
        });
    }
    
    if (signupBtn) {
        signupBtn.addEventListener('click', function(e) {
            e.preventDefault();
            console.log('Signup button clicked');
            openModal('signupModal');
        });
    }
    
    if (heroSignupBtn) {
        heroSignupBtn.addEventListener('click', function(e) {
            e.preventDefault();
            console.log('Hero signup button clicked');
            openModal('signupModal');
        });
    }
    
    if (ctaSignupBtn) {
        ctaSignupBtn.addEventListener('click', function(e) {
            e.preventDefault();
            console.log('CTA signup button clicked');
            openModal('signupModal');
        });
    }
    
    // Explore Community button - REDIRECT TO EXPLORE.HTML
    if (exploreCommunityBtn) {
        exploreCommunityBtn.addEventListener('click', function(e) {
            e.preventDefault();
            console.log('🌐 Redirecting to explore.html...');
            window.location.href = 'explore.html';
        });
    }
}

// ===== Explore Page Events =====
function setupExplorePageEvents() {
    // Main auth buttons
    if (exploreLoginBtn) {
        exploreLoginBtn.addEventListener('click', function(e) {
            e.preventDefault();
            console.log('Explore login button clicked');
            checkAuthAndOpenModal('loginModal');
        });
    }
    
    if (exploreSignupBtn) {
        exploreSignupBtn.addEventListener('click', function(e) {
            e.preventDefault();
            console.log('Explore signup button clicked');
            checkAuthAndOpenModal('signupModal');
        });
    }
    
    // Preview signup buttons
    [previewSignupBtn1, previewSignupBtn2, previewSignupBtn3, previewSignupBtn4].forEach((btn, index) => {
        if (btn) {
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                console.log(`Preview signup button ${index + 1} clicked`);
                checkAuthAndOpenModal('signupModal');
            });
        }
    });
    
    // Action buttons
    [actionBtn1, actionBtn2, actionBtn3, actionBtn4].forEach((btn, index) => {
        if (btn) {
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                console.log(`Action button ${index + 1} clicked`);
                checkAuthAndOpenModal('signupModal');
            });
        }
    });
    
    // CTA button
    if (exploreCtaSignupBtn) {
        exploreCtaSignupBtn.addEventListener('click', function(e) {
            e.preventDefault();
            console.log('Explore CTA button clicked');
            checkAuthAndOpenModal('signupModal');
        });
    }
}

// Helper function to check auth and open modal
function checkAuthAndOpenModal(modalId) {
    // Check if user is already logged in
    const authToken = localStorage.getItem('authToken');
    if (authToken) {
        showMessageModal('Already Logged In', 'You are already logged in! Redirecting to profile...', 'info');
        window.location.href = 'profile.html';
        return;
    }
    
    // Open the requested modal
    openModal(modalId);
}

// ===== Common Events (both pages) =====
function setupCommonEvents() {
    console.log('🔄 Setting up common events...');
    
    // Close buttons (handles both .close-btn and .close-modal)
    document.querySelectorAll('.close-btn, .close-modal').forEach(button => {
        button.addEventListener('click', function(e) {
            e.preventDefault();
            console.log('Close button clicked');
            
            // Find the closest modal (works with both .modal-overlay and .modal)
            const modal = this.closest('.modal-overlay') || this.closest('.modal');
            if (modal) {
                console.log('Closing modal:', modal.id);
                closeModal(modal.id);
            }
        });
    });
    
    // Close modal when clicking on overlay
    document.querySelectorAll('.modal-overlay, .modal').forEach(modal => {
        modal.addEventListener('click', function(e) {
            if (e.target === this) {
                console.log('Closing modal on overlay click:', this.id);
                closeModal(this.id);
            }
        });
    });
    
    // Modal switching links
    setupModalSwitching();
    
    // Forgot password links
    document.querySelectorAll('.forgot-password').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            console.log('Forgot password link clicked');
            
            // Find current modal
            const currentModal = this.closest('.modal-overlay') || this.closest('.modal');
            if (currentModal && (currentModal.id === 'loginModal' || currentModal.id === 'loginModal')) {
                closeModal(currentModal.id);
                openModal('forgotPasswordModal');
            }
        });
    });
    
    // Back to login links
    document.querySelectorAll('#backToLoginLink, [href*="back"]').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            console.log('Back to login clicked');
            closeModal('forgotPasswordModal');
            openModal('loginModal');
        });
    });
    
    // Password toggle buttons
    setupPasswordToggles();
    
    // Form submissions are now handled by auth.js
    setupFormSubmissions();
    
    // Real-time password validation
    setupRealTimeValidation();
}

// ===== Modal Switching =====
function setupModalSwitching() {
    // Switch to signup link
    const switchToSignupLinks = document.querySelectorAll('#switchToSignupLink, [data-form="signup"], .switch-form[data-form="signup"]');
    switchToSignupLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            console.log('Switching to signup modal');
            closeModal('loginModal');
            openModal('signupModal');
        });
    });
    
    // Switch to login link
    const switchToLoginLinks = document.querySelectorAll('#switchToLoginLink, [data-form="login"], .switch-form[data-form="login"]');
    switchToLoginLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            console.log('Switching to login modal');
            closeModal('signupModal');
            openModal('loginModal');
        });
    });
}

// ===== Password Toggle Functions =====
function setupPasswordToggles() {
    const toggleButtons = [
        { toggleId: 'toggleLoginPassword', inputId: 'loginPassword' },
        { toggleId: 'toggleSignupPassword', inputId: 'signupPassword' },
        { toggleId: 'toggleConfirmPassword', inputId: 'confirmPassword' }
    ];
    
    toggleButtons.forEach(({ toggleId, inputId }) => {
        const toggleBtn = document.getElementById(toggleId);
        const input = document.getElementById(inputId);
        
        if (toggleBtn && input) {
            toggleBtn.addEventListener('click', function() {
                const type = input.type === 'password' ? 'text' : 'password';
                input.type = type;
                const icon = this.querySelector('i');
                if (icon) {
                    icon.className = type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash';
                }
            });
        }
    });
}

// ===== Form Submission Functions =====
function setupFormSubmissions() {
    // Login form (both pages) - Now handled by auth.js
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            console.log('🔑 Login form submitted');
            
            const email = document.getElementById('loginEmail')?.value.trim();
            const password = document.getElementById('loginPassword')?.value;
            
            if (!email || !password) {
                showMessageModal('Validation Error', 'Please fill in all fields', 'warning');
                return;
            }
            
            // Call auth.js function
            if (typeof handleLogin === 'function') {
                await handleLogin({ email, password });
            } else {
                console.error('handleLogin function not found');
                showMessageModal('Error', 'Authentication functions not loaded. Please refresh the page.', 'error');
            }
        });
    }
    
    // Signup form (both pages) - Now handled by auth.js
    const signupForm = document.getElementById('signupForm');
    if (signupForm) {
        signupForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            console.log('📝 Signup form submitted');
            
            const name = document.getElementById('signupName')?.value.trim();
            const email = document.getElementById('signupEmail')?.value.trim();
            const password = document.getElementById('signupPassword')?.value;
            const confirmPassword = document.getElementById('confirmPassword')?.value;
            
            // Check for terms checkbox on explore page
            const termsCheckbox = document.getElementById('terms');
            if (termsCheckbox && !termsCheckbox.checked) {
                showMessageModal('Terms Required', 'Please agree to the Terms of Service and Privacy Policy', 'warning');
                return;
            }
            
            // Basic validation
            if (!name || !email || !password || !confirmPassword) {
                showMessageModal('Validation Error', 'Please fill in all fields', 'warning');
                return;
            }
            
            if (password !== confirmPassword) {
                showMessageModal('Validation Error', 'Passwords do not match', 'error');
                return;
            }
            
            // Call auth.js function
            if (typeof handleSignup === 'function') {
                await handleSignup({ name, email, password, confirmPassword });
            } else {
                console.error('handleSignup function not found');
                showMessageModal('Error', 'Authentication functions not loaded. Please refresh the page.', 'error');
            }
        });
    }
    
    // Forgot password form - Now handled by auth.js
    const forgotPasswordForm = document.getElementById('forgotPasswordForm');
    if (forgotPasswordForm) {
        forgotPasswordForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            console.log('🔐 Forgot password form submitted');
            
            const email = document.getElementById('forgotEmail')?.value.trim();
            
            if (!email) {
                showMessageModal('Validation Error', 'Please enter your email', 'warning');
                return;
            }
            
            // Call auth.js function
            if (typeof handleForgotPassword === 'function') {
                await handleForgotPassword(email);
            } else {
                showMessageModal('Error', 'Authentication functions not loaded. Please refresh the page.', 'error');
            }
        });
    }
}

// ===== Real-time Validation =====
function setupRealTimeValidation() {
    const signupPassword = document.getElementById('signupPassword');
    if (signupPassword) {
        signupPassword.addEventListener('input', function() {
            validatePassword(this.value);
        });
    }
    
    // Password confirmation validation
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
}

// ===== Backend Test =====
async function testBackendConnection() {
    try {
        console.log('🔄 Testing backend connection...');
        // Use API_BASE_URL from auth.js (already loaded)
        const response = await fetch(`${window.API_BASE_URL || 'http://localhost:5002/api'}/health`);
        const data = await response.json();
        console.log('✅ Backend connection successful:', data);
        
    } catch (error) {
        console.warn('⚠️ Backend connection failed:', error.message);
    }
}

// ===== Debug function to check if elements exist =====
function debugElements() {
    console.log('=== DEBUG ELEMENTS ===');
    console.log('isHomePage:', isHomePage);
    console.log('isExplorePage:', isExplorePage);
    console.log('exploreLoginBtn exists:', !!exploreLoginBtn);
    console.log('exploreSignupBtn exists:', !!exploreSignupBtn);
    console.log('previewSignupBtn1 exists:', !!previewSignupBtn1);
    console.log('=== END DEBUG ===');
}

// Call debug to see what's happening
setTimeout(debugElements, 1000);

// ===== Export functions to window object =====
window.openModal = openModal;
window.closeModal = closeModal;
window.closeAllModals = closeAllModals;
window.validatePassword = validatePassword;
window.validateEmail = validateEmail;
window.validateName = validateName;
window.showError = showError;
window.showSuccess = showSuccess;
window.showLoading = showLoading;
window.hideLoading = hideLoading;

// ===== Explore Page Genre Scrolling =====
function initGenreScrolling() {
    console.log('🎬 Initializing genre scrolling...');
    
    const genresScroll = document.getElementById('genresScroll');
    const scrollLeftBtn = document.querySelector('.scroll-left');
    const scrollRightBtn = document.querySelector('.scroll-right');
    const genreCards = document.querySelectorAll('.genre-card');
    const scrollDots = document.getElementById('scrollDots');
    
    if (!genresScroll) return;
    
    // Calculate scroll amount
    const scrollAmount = 176 * 3; // 3 cards
    
    // Scroll buttons
    if (scrollLeftBtn && scrollRightBtn) {
        scrollLeftBtn.addEventListener('click', () => {
            genresScroll.scrollBy({
                left: -scrollAmount,
                behavior: 'smooth'
            });
            updateScrollDots();
        });
        
        scrollRightBtn.addEventListener('click', () => {
            genresScroll.scrollBy({
                left: scrollAmount,
                behavior: 'smooth'
            });
            updateScrollDots();
        });
    }
    
    // Update active dot based on scroll position
    function updateScrollDots() {
        if (!scrollDots) return;
        
        const scrollLeft = genresScroll.scrollLeft;
        const cardWidth = genreCards[0]?.offsetWidth + 16 || 176;
        const activeIndex = Math.round(scrollLeft / cardWidth);
        
        document.querySelectorAll('.scroll-dot').forEach((dot, index) => {
            dot.classList.toggle('active', index === activeIndex);
        });
    }
    
    // Initialize dots
    if (scrollDots) {
        genreCards.forEach((_, index) => {
            const dot = document.createElement('div');
            dot.className = `scroll-dot ${index === 0 ? 'active' : ''}`;
            dot.dataset.index = index;
            dot.addEventListener('click', () => {
                const targetScroll = index * (genreCards[0]?.offsetWidth + 16 || 176);
                genresScroll.scrollTo({
                    left: targetScroll,
                    behavior: 'smooth'
                });
            });
            scrollDots.appendChild(dot);
        });
    }
    
    // Scroll event listener
    genresScroll.addEventListener('scroll', updateScrollDots);
    
    // Add genre click handlers
    genreCards.forEach(card => {
        card.addEventListener('click', function() {
            console.log('🎭 Genre card clicked');
            openModal('signupModal');
            
            // Add visual feedback
            this.classList.add('clicked');
            setTimeout(() => {
                this.classList.remove('clicked');
            }, 300);
        });
    });
}

// ===== Scroll Animations =====
function initScrollAnimations() {
    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.1
    };
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('in-view');
            }
        });
    }, observerOptions);
    
    // Observe all sections and cards
    document.querySelectorAll('section, .preview-content, .action-card').forEach(el => {
        observer.observe(el);
    });
}

// ===== Page Load Animation =====
function initPageAnimations() {
    // Add loading class to body
    document.body.classList.add('page-loaded');
    
    // Add staggered animation to sections
    const sections = document.querySelectorAll('section');
    sections.forEach((section, index) => {
        section.style.animationDelay = `${index * 0.2}s`;
    });
}

// ===== Initialize Explore Page Features =====
function initExplorePageFeatures() {
    if (!isExplorePage) return;
    
    console.log('🎨 Initializing explore page features...');
    
    initGenreScrolling();
    initScrollAnimations();
    initPageAnimations();
    
    // Add genre selection feedback
    document.querySelectorAll('.genre-card').forEach(card => {
        card.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Remove active class from all cards
            document.querySelectorAll('.genre-card').forEach(c => {
                c.classList.remove('active');
            });
            
            // Add active class to clicked card
            this.classList.add('active');
            
            // Show signup modal
            openModal('signupModal');
        });
    });
}

console.log(`✅ Script.js loaded successfully`);