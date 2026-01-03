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
    
    // Add click handler for logout button
    const logoutBtn = document.querySelector('.btn-logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function() {
            // Create confirmation animation
            const confirmBox = document.createElement('div');
            confirmBox.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%) scale(0.8);
                background: rgba(92, 51, 40, 0.95);
                backdrop-filter: blur(10px);
                padding: 30px;
                border-radius: 16px;
                border: 1px solid rgba(232, 212, 201, 0.2);
                z-index: 10000;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
                opacity: 0;
                animation: confirmAppear 0.3s ease-out forwards;
                text-align: center;
            `;
            
            confirmBox.innerHTML = `
                <h3 style="color: #fff; margin-bottom: 10px; font-size: 18px;">Confirm Logout</h3>
                <p style="color: rgba(232, 212, 201, 0.7); margin-bottom: 20px; font-size: 14px;">
                    This will log you out of all other sessions
                </p>
                <div style="display: flex; gap: 12px; justify-content: center;">
                    <button id="confirmLogout" style="
                        padding: 10px 20px;
                        background: rgba(180, 80, 80, 0.3);
                        border: 1px solid rgba(180, 80, 80, 0.5);
                        border-radius: 8px;
                        color: #e89090;
                        cursor: pointer;
                        font-size: 14px;
                        font-weight: 500;
                        transition: all 0.3s ease;
                    ">Confirm</button>
                    <button id="cancelLogout" style="
                        padding: 10px 20px;
                        background: rgba(212, 165, 116, 0.2);
                        border: 1px solid rgba(212, 165, 116, 0.3);
                        border-radius: 8px;
                        color: #d4a574;
                        cursor: pointer;
                        font-size: 14px;
                        font-weight: 500;
                        transition: all 0.3s ease;
                    ">Cancel</button>
                </div>
            `;
            
            const overlay = document.createElement('div');
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                z-index: 9999;
                opacity: 0;
                animation: fadeIn 0.3s ease-out forwards;
            `;
            
            document.body.appendChild(overlay);
            document.body.appendChild(confirmBox);
            
            document.getElementById('cancelLogout').addEventListener('click', () => {
                overlay.remove();
                confirmBox.remove();
            });
            
            document.getElementById('confirmLogout').addEventListener('click', () => {
                confirmBox.innerHTML = '<p style="color: #90c695; font-size: 16px;">✓ Logged out successfully</p>';
                setTimeout(() => {
                    overlay.remove();
                    confirmBox.remove();
                }, 1500);
            });
            
            overlay.addEventListener('click', () => {
                overlay.remove();
                confirmBox.remove();
            });
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
    
    // Console easter egg
    console.log('%cAdmin Panel Loaded', 'color: #d4a574; font-size: 20px; font-weight: bold;');
    console.log('%c🔒 Secure Session Active', 'color: #90c695; font-size: 14px;');
});