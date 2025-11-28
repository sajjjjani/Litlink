// API Configuration
const API_BASE = 'http://localhost:5002/api';

// Authentication functions
async function handleSignup(formData) {
    try {
        showLoading('signupSubmit', 'Signing up...');
        const response = await fetch(`${API_BASE}/auth/signup`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(formData)
        });

        const data = await response.json();
        
        if (data.success) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            closeModal();
            setTimeout(() => {
                showQuestionnaire(data.user.id);
            }, 500);
        } else {
            alert('❌ Sign up failed: ' + data.message);
        }
    } catch (error) {
        console.error('Signup error:', error);
        alert('🌐 Network error. Make sure backend is running on port 5002.');
    } finally {
        hideLoading('signupSubmit', 'Sign up');
    }
}

async function handleLogin(formData) {
    try {
        showLoading('loginSubmit', 'Logging in...');
        const response = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(formData)
        });

        const data = await response.json();
        
        if (data.success) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            alert('🎉 Login successful!');
            closeModal();
            setTimeout(() => {
                window.location.href = 'profile.html';
            }, 1000);
        } else {
            alert('❌ Login failed: ' + data.message);
        }
    } catch (error) {
        console.error('Login error:', error);
        alert('🌐 Network error. Make sure backend is running on port 5002.');
    } finally {
        hideLoading('loginSubmit', 'Login');
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

function logout() {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    window.location.href = 'index.html';
}

function checkAuth() {
    const user = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    
    if (!user || !token) {
        window.location.href = 'index.html';
        return null;
    }
    
    return JSON.parse(user);
}

// Modal functions
function closeModal() {
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.classList.remove('active');
    });
    document.body.style.overflow = 'auto';
}

// Initialize modal functionality
function initModals() {
    const closeBtns = document.querySelectorAll('.close-btn');
    
    closeBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal-overlay');
            modal.classList.remove('active');
            document.body.style.overflow = 'auto';
        });
    });

    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-overlay')) {
            e.target.classList.remove('active');
            document.body.style.overflow = 'auto';
        }
    });
}

// Mobile menu
function initMobileMenu() {
    const menuToggle = document.querySelector('.menu-toggle');
    const navLinks = document.querySelector('.nav-links');

    if (menuToggle && navLinks) {
        menuToggle.addEventListener('click', () => {
            navLinks.classList.toggle('active');
        });
    }
}