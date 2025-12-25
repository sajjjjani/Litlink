// Litlink - Book Community Dashboard - Interactive Features

document.addEventListener('DOMContentLoaded', function() {
    
    // Initialize all interactive features
    initConnectButtons();
    initJoinBoardButtons();
    initChatItems();
    initActionCards();
    initVoiceRooms();
    initSuggestedReaders();
    initViewAllButtons();
    initNotifications();
    
    // Connect Button Functionality
    function initConnectButtons() {
        const connectButtons = document.querySelectorAll('.connect-btn');
        
        connectButtons.forEach(button => {
            button.addEventListener('click', function(e) {
                e.preventDefault();
                const matchCard = this.closest('.match-card');
                const readerName = matchCard.querySelector('h3').textContent;
                
                // Change button state
                if (this.textContent.includes('Connect')) {
                    this.textContent = '✓ Connected';
                    this.style.background = 'linear-gradient(135deg, #059669 0%, #047857 100%)';
                    showNotification(`Connected with ${readerName}!`, 'success');
                } else {
                    this.textContent = '🔗 Connect';
                    this.style.background = 'linear-gradient(135deg, #5c3a28 0%, #3d2417 100%)';
                    showNotification(`Disconnected from ${readerName}`, 'info');
                }
                
                // Add animation
                matchCard.style.transform = 'scale(0.95)';
                setTimeout(() => {
                    matchCard.style.transform = 'scale(1)';
                }, 150);
            });
        });
    }
    
    // Join Board Button Functionality
    function initJoinBoardButtons() {
        const joinButtons = document.querySelectorAll('.join-btn');
        
        joinButtons.forEach(button => {
            button.addEventListener('click', function(e) {
                e.preventDefault();
                const boardCard = this.closest('.board-card');
                const boardName = boardCard.querySelector('h3').textContent;
                
                if (this.textContent.includes('Join')) {
                    this.textContent = '✓ Joined →';
                    this.style.background = '#5c3a28';
                    this.style.color = '#f5f0e8';
                    this.style.borderColor = '#5c3a28';
                    showNotification(`Joined ${boardName}!`, 'success');
                } else {
                    this.textContent = 'Join Board →';
                    this.style.background = 'transparent';
                    this.style.color = '#5c3a28';
                    this.style.borderColor = '#8b6f47';
                    showNotification(`Left ${boardName}`, 'info');
                }
                
                // Animation
                boardCard.style.transform = 'scale(0.98)';
                setTimeout(() => {
                    boardCard.style.transform = 'scale(1)';
                }, 100);
            });
        });
    }
    
    // Chat Item Click Functionality
    function initChatItems() {
        const chatItems = document.querySelectorAll('.chat-item');
        
        chatItems.forEach(item => {
            item.addEventListener('click', function() {
                const chatName = this.querySelector('h4').textContent;
                showNotification(`Opening chat with ${chatName}...`, 'info');
                
                // Add active state
                chatItems.forEach(chat => chat.style.background = '#fff');
                this.style.background = '#f0e6d6';
                
                // Simulate opening chat
                setTimeout(() => {
                    this.style.background = '#fff';
                }, 2000);
            });
        });
    }
    
    // Action Cards Functionality
    function initActionCards() {
        const actionCards = document.querySelectorAll('.action-card');
        
        const actions = {
            'Start Discussion': () => {
                showNotification('Opening discussion composer...', 'info');
            },
            'Browse Books': () => {
                showNotification('Loading book library...', 'info');
            },
            'Join Room': () => {
                showNotification('Finding available rooms...', 'info');
            },
            'Edit Profile': () => {
                showNotification('Opening profile editor...', 'info');
            }
        };
        
        actionCards.forEach(card => {
            card.addEventListener('click', function() {
                const actionText = this.querySelector('span:last-child').textContent;
                if (actions[actionText]) {
                    actions[actionText]();
                }
                
                // Click animation
                this.style.transform = 'scale(0.95)';
                setTimeout(() => {
                    this.style.transform = 'scale(1)';
                }, 150);
            });
        });
    }
    
    // Voice Room Join Functionality
    function initVoiceRooms() {
        const joinRoomButtons = document.querySelectorAll('.join-room-btn');
        
        joinRoomButtons.forEach(button => {
            button.addEventListener('click', function(e) {
                e.preventDefault();
                const room = this.closest('.voice-room');
                const roomName = room.querySelector('h3').textContent;
                
                if (this.textContent === 'Join') {
                    this.textContent = '🎙️ Joined';
                    this.style.background = 'linear-gradient(135deg, #059669 0%, #047857 100%)';
                    showNotification(`Joined voice room: ${roomName}`, 'success');
                    
                    // Update participant count
                    const countElement = room.querySelector('.participant-count');
                    const currentCount = parseInt(countElement.textContent.match(/\d+/)[0]);
                    countElement.textContent = `👥 ${currentCount + 1}`;
                } else {
                    this.textContent = 'Join';
                    this.style.background = 'linear-gradient(135deg, #5c3a28 0%, #3d2417 100%)';
                    showNotification(`Left voice room: ${roomName}`, 'info');
                    
                    // Update participant count
                    const countElement = room.querySelector('.participant-count');
                    const currentCount = parseInt(countElement.textContent.match(/\d+/)[0]);
                    countElement.textContent = `👥 ${currentCount - 1}`;
                }
            });
        });
    }
    
    // Suggested Readers Star Functionality
    function initSuggestedReaders() {
        const starButtons = document.querySelectorAll('.star-btn');
        
        starButtons.forEach(button => {
            button.addEventListener('click', function(e) {
                e.stopPropagation();
                const readerName = this.closest('.suggested-item').querySelector('h4').textContent;
                
                if (this.textContent === '⭐') {
                    this.textContent = '✓';
                    this.style.color = '#059669';
                    showNotification(`Added ${readerName} to favorites!`, 'success');
                } else {
                    this.textContent = '⭐';
                    this.style.color = 'inherit';
                    showNotification(`Removed ${readerName} from favorites`, 'info');
                }
            });
        });
    }
    
    // View All Buttons
    function initViewAllButtons() {
        const viewAllLinks = document.querySelectorAll('.view-all');
        viewAllLinks.forEach(link => {
            link.addEventListener('click', function(e) {
                e.preventDefault();
                showNotification('Loading more content...', 'info');
            });
        });
        
        const viewMessagesBtn = document.querySelector('.view-messages-btn');
        if (viewMessagesBtn) {
            viewMessagesBtn.addEventListener('click', function() {
                showNotification('Opening all messages...', 'info');
            });
        }
        
        const viewMoreBtn = document.querySelector('.view-more');
        if (viewMoreBtn) {
            viewMoreBtn.addEventListener('click', function() {
                showNotification('Loading all voice rooms...', 'info');
            });
        }
    }
    
    // Explore Community Button
    const exploreBtn = document.querySelector('.explore-btn');
    if (exploreBtn) {
        exploreBtn.addEventListener('click', function() {
            showNotification('Exploring community features...', 'info');
        });
    }
    
    // More Button (three dots)
    const moreBtn = document.querySelector('.more-btn');
    if (moreBtn) {
        moreBtn.addEventListener('click', function() {
            showNotification('Opening chat options...', 'info');
        });
    }
    
    // Notification System
    function initNotifications() {
        // Create notification container
        const notificationContainer = document.createElement('div');
        notificationContainer.id = 'notification-container';
        notificationContainer.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 1000;
            display: flex;
            flex-direction: column;
            gap: 10px;
            max-width: 350px;
        `;
        document.body.appendChild(notificationContainer);
    }
    
    function showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = 'notification';
        
        const icons = {
            success: '✓',
            info: 'ℹ️',
            warning: '⚠️',
            error: '✕'
        };
        
        const colors = {
            success: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
            info: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
            warning: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
            error: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)'
        };
        
        notification.style.cssText = `
            background: ${colors[type]};
            color: white;
            padding: 16px 20px;
            border-radius: 12px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            display: flex;
            align-items: center;
            gap: 12px;
            animation: slideIn 0.3s ease-out;
            font-size: 14px;
            font-weight: 500;
        `;
        
        notification.innerHTML = `
            <span style="font-size: 20px;">${icons[type]}</span>
            <span>${message}</span>
        `;
        
        const container = document.getElementById('notification-container');
        container.appendChild(notification);
        
        // Auto remove after 3 seconds
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-out';
            setTimeout(() => {
                notification.remove();
            }, 300);
        }, 3000);
    }
    
    // Add animation styles
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from {
                transform: translateX(400px);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
        
        @keyframes slideOut {
            from {
                transform: translateX(0);
                opacity: 1;
            }
            to {
                transform: translateX(400px);
                opacity: 0;
            }
        }
        
        .notification:hover {
            transform: scale(1.02);
            cursor: pointer;
        }
    `;
    document.head.appendChild(style);
    
    // Simulate live updates
    simulateLiveUpdates();
    
    function simulateLiveUpdates() {
        // Simulate new messages
        setInterval(() => {
            const random = Math.random();
            if (random > 0.7) {
                const messages = [
                    'New message in The Midnight Library Club',
                    'James Wilson sent you a book recommendation',
                    'Sarah J. accepted your connection request'
                ];
                const randomMessage = messages[Math.floor(Math.random() * messages.length)];
                showNotification(randomMessage, 'info');
            }
        }, 30000); // Every 30 seconds
        
        // Update active user counts randomly
        setInterval(() => {
            const boardCards = document.querySelectorAll('.board-active');
            boardCards.forEach(card => {
                const currentText = card.textContent;
                const match = currentText.match(/(\d+)k/);
                if (match) {
                    const num = parseInt(match[1]);
                    const change = Math.random() > 0.5 ? 1 : -1;
                    const newNum = Math.max(1, num + change);
                    card.textContent = `🟢 ${newNum}k active`;
                }
            });
        }, 60000); // Every minute
    }
    
    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
    
    // Add hover effects for profile images
    const profileImages = document.querySelectorAll('.match-avatar, .chat-avatar, .profile-img');
    profileImages.forEach(img => {
        img.addEventListener('mouseenter', function() {
            this.style.transform = 'scale(1.1) rotate(5deg)';
            this.style.transition = 'transform 0.3s ease';
        });
        
        img.addEventListener('mouseleave', function() {
            this.style.transform = 'scale(1) rotate(0deg)';
        });
    });
    
    console.log('📚 Litlink Book Community Dashboard loaded successfully!');
});