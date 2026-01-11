// Smooth scroll animation for view all link
document.addEventListener('DOMContentLoaded', () => {
    
    // Add ripple effect to buttons
    const buttons = document.querySelectorAll('.btn-edit, .btn-settings, .btn-logout');
    
    buttons.forEach(button => {
        button.addEventListener('click', function(e) {
            const ripple = document.createElement('span');
            const rect = this.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            const x = e.clientX - rect.left - size / 2;
            const y = e.clientY - rect.top - size / 2;
            
            ripple.style.width = ripple.style.height = size + 'px';
            ripple.style.left = x + 'px';
            ripple.style.top = y + 'px';
            ripple.classList.add('ripple');
            
            this.appendChild(ripple);
            
            setTimeout(() => {
                ripple.remove();
            }, 600);
        });
    });
    
    // Animate permission items on scroll
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.animationDelay = `${Array.from(entry.target.parentElement.children).indexOf(entry.target) * 0.05}s`;
                entry.target.style.animation = 'slideInRight 0.5s ease-out forwards';
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);
    
    document.querySelectorAll('.permission-item').forEach((item) => {
        observer.observe(item);
    });
    
    const activityObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.animationDelay = `${Array.from(entry.target.parentElement.children).indexOf(entry.target) * 0.1}s`;
                entry.target.style.animation = 'slideInRight 0.5s ease-out forwards';
                activityObserver.unobserve(entry.target);
            }
        });
    }, observerOptions);
    
    document.querySelectorAll('.activity-item').forEach((item) => {
        activityObserver.observe(item);
    });
    
    // Interactive hover effect for info rows
    const infoRows = document.querySelectorAll('.info-row');
    infoRows.forEach(row => {
        row.addEventListener('mouseenter', function() {
            this.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
        });
    });
    
    // Add tooltip for permissions
    const permissionItems = document.querySelectorAll('.permission-item');
    permissionItems.forEach(item => {
        item.addEventListener('mouseenter', function(e) {
            const isActive = this.classList.contains('active');
            const tooltip = document.createElement('div');
            tooltip.className = 'permission-tooltip';
            tooltip.textContent = isActive ? 'Permission Granted' : 'Permission Denied';
            tooltip.style.cssText = `
                position: absolute;
                background: rgba(0, 0, 0, 0.9);
                color: white;
                padding: 6px 12px;
                border-radius: 6px;
                font-size: 12px;
                pointer-events: none;
                z-index: 1000;
                white-space: nowrap;
                opacity: 0;
                animation: fadeInTooltip 0.2s ease-out forwards;
                top: -30px;
                left: 50%;
                transform: translateX(-50%);
            `;
            
            this.style.position = 'relative';
            this.appendChild(tooltip);
        });
        
        item.addEventListener('mouseleave', function() {
            const tooltip = this.querySelector('.permission-tooltip');
            if (tooltip) {
                tooltip.remove();
            }
        });
    });
    
    // Animate avatar on hover
    const avatar = document.querySelector('.avatar');
    if (avatar) {
        avatar.addEventListener('mouseenter', function() {
            this.style.transform = 'scale(1.05) rotate(5deg)';
            this.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
        });
        
        avatar.addEventListener('mouseleave', function() {
            this.style.transform = 'scale(1) rotate(0deg)';
        });
    }
    
    // Add focus animation for buttons
    buttons.forEach(button => {
        button.addEventListener('focus', function() {
            this.style.outline = '2px solid rgba(212, 165, 116, 0.5)';
            this.style.outlineOffset = '2px';
        });
        
        button.addEventListener('blur', function() {
            this.style.outline = 'none';
        });
    });
    
    // Add CSS animations if not already present
    if (!document.querySelector('#custom-animations')) {
        const style = document.createElement('style');
        style.id = 'custom-animations';
        style.textContent = `
            @keyframes slideInRight {
                from {
                    opacity: 0;
                    transform: translateX(30px);
                }
                to {
                    opacity: 1;
                    transform: translateX(0);
                }
            }
            
            @keyframes fadeInTooltip {
                from {
                    opacity: 0;
                    transform: translateX(-50%) translateY(10px);
                }
                to {
                    opacity: 1;
                    transform: translateX(-50%) translateY(0);
                }
            }
            
            @keyframes confirmAppear {
                from {
                    opacity: 0;
                    transform: translate(-50%, -50%) scale(0.8);
                }
                to {
                    opacity: 1;
                    transform: translate(-50%, -50%) scale(1);
                }
            }
            
            @keyframes fadeIn {
                from {
                    opacity: 0;
                }
                to {
                    opacity: 1;
                }
            }
            
            .ripple {
                position: absolute;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.3);
                transform: scale(0);
                animation: ripple-animation 0.6s linear;
            }
            
            @keyframes ripple-animation {
                to {
                    transform: scale(4);
                    opacity: 0;
                }
            }
            
            .permission-tooltip::after {
                content: '';
                position: absolute;
                top: 100%;
                left: 50%;
                margin-left: -5px;
                border-width: 5px;
                border-style: solid;
                border-color: rgba(0, 0, 0, 0.9) transparent transparent transparent;
            }
        `;
        document.head.appendChild(style);
    }
    
    // Console easter egg
    console.log('%cAdmin Panel Loaded', 'color: #d4a574; font-size: 20px; font-weight: bold;');
    console.log('%c🔒 Secure Session Active', 'color: #90c695; font-size: 14px;');
    console.log('%c⚠️ Authorized Access Only', 'color: #ffcc00; font-size: 12px;');
});

// Additional helper function for smooth scrolling (if needed elsewhere)
function smoothScrollTo(target, duration = 800) {
    const targetElement = document.querySelector(target);
    if (!targetElement) return;
    
    const targetPosition = targetElement.getBoundingClientRect().top + window.pageYOffset;
    const startPosition = window.pageYOffset;
    const distance = targetPosition - startPosition;
    let startTime = null;
    
    function animation(currentTime) {
        if (startTime === null) startTime = currentTime;
        const timeElapsed = currentTime - startTime;
        const run = ease(timeElapsed, startPosition, distance, duration);
        window.scrollTo(0, run);
        if (timeElapsed < duration) requestAnimationFrame(animation);
    }
    
    function ease(t, b, c, d) {
        t /= d / 2;
        if (t < 1) return c / 2 * t * t + b;
        t--;
        return -c / 2 * (t * (t - 2) - 1) + b;
    }
    
    requestAnimationFrame(animation);
}

// Handle browser back/forward buttons
window.addEventListener('pageshow', function(event) {
    if (event.persisted) {
        // Page was loaded from cache, reinitialize animations
        document.querySelectorAll('.permission-item, .activity-item').forEach(item => {
            item.style.animation = 'none';
            setTimeout(() => {
                item.style.animation = '';
            }, 10);
        });
    }
});

// Handle page visibility changes (tab switching)
document.addEventListener('visibilitychange', function() {
    if (!document.hidden) {
        // Page became visible again, refresh any time-sensitive data
        console.log('%cPage visible - Session refreshed', 'color: #90c695;');
    }
});