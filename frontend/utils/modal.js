/**
 * Litlink Custom Modal System
 * Replaces browser alert(), confirm(), and prompt() dialogs
 * Matches Litlink's dark theme
 */

// Modal configuration
const MODAL_THEME = {
    background: '#3d2617',
    border: 'rgba(245, 230, 211, 0.2)',
    textPrimary: '#f5e6d3',
    textSecondary: '#d4b5a0',
    overlay: 'rgba(0, 0, 0, 0.7)',
    success: '#10b981',
    error: '#ef4444',
    warning: '#eab308',
    info: '#3b82f6',
    confirm: '#d97706'
};

// Generate unique modal ID
let modalIdCounter = 0;
function getModalId() {
    return `litlink-modal-${++modalIdCounter}`;
}

/**
 * Show a message modal (replaces alert)
 * @param {string} title - Modal title
 * @param {string} message - Modal message
 * @param {string} type - Modal type: 'info', 'success', 'warning', 'error'
 * @param {Function} callback - Optional callback when modal closes
 */
function showMessageModal(title, message, type = 'info', callback = null) {
    // Remove existing modals
    const existingModal = document.getElementById('litlinkModalOverlay');
    if (existingModal) {
        existingModal.remove();
    }

    const icons = {
        info: '<i class="fas fa-info-circle"></i>',
        success: '<i class="fas fa-check-circle"></i>',
        warning: '<i class="fas fa-exclamation-triangle"></i>',
        error: '<i class="fas fa-times-circle"></i>'
    };

    const colors = {
        info: MODAL_THEME.info,
        success: MODAL_THEME.success,
        warning: MODAL_THEME.warning,
        error: MODAL_THEME.error
    };

    const overlay = document.createElement('div');
    overlay.id = 'litlinkModalOverlay';
    overlay.className = 'litlink-modal-overlay';
    
    overlay.innerHTML = `
        <div class="litlink-modal">
            <div class="litlink-modal-header">
                <div class="litlink-modal-icon" style="background: rgba(${hexToRgb(colors[type])}, 0.2); color: ${colors[type]};">
                    ${icons[type] || icons.info}
                </div>
                <h3 class="litlink-modal-title">${escapeHtml(title)}</h3>
                <button class="litlink-modal-close" onclick="closeLitlinkModal()">&times;</button>
            </div>
            <div class="litlink-modal-body">
                ${escapeHtml(message).replace(/\n/g, '<br>')}
            </div>
            <div class="litlink-modal-actions">
                <button class="litlink-modal-btn litlink-modal-btn-primary" onclick="closeLitlinkModal(true)">OK</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Store callback
    if (callback) {
        overlay.dataset.callback = 'true';
        window.__litlinkModalCallback = callback;
    }
    
    // Animate in
    setTimeout(() => {
        overlay.style.opacity = '1';
        overlay.querySelector('.litlink-modal').style.transform = 'scale(1)';
    }, 10);
    
    // Close on overlay click
    overlay.addEventListener('click', function(e) {
        if (e.target === overlay) {
            closeLitlinkModal();
        }
    });
    
    // Close on Escape key
    const escapeHandler = function(e) {
        if (e.key === 'Escape') {
            closeLitlinkModal();
            document.removeEventListener('keydown', escapeHandler);
        }
    };
    document.addEventListener('keydown', escapeHandler);
    
    // Prevent body scroll
    document.body.style.overflow = 'hidden';
}

/**
 * Show a confirm modal (replaces confirm)
 * @param {string} title - Modal title
 * @param {string} message - Modal message
 * @param {Function} onConfirm - Callback when user confirms
 * @param {Function} onCancel - Optional callback when user cancels
 */
function showConfirmModal(title, message, onConfirm, onCancel = null) {
    // Remove existing modals
    const existingModal = document.getElementById('litlinkModalOverlay');
    if (existingModal) {
        existingModal.remove();
    }

    const overlay = document.createElement('div');
    overlay.id = 'litlinkModalOverlay';
    overlay.className = 'litlink-modal-overlay';
    
    overlay.innerHTML = `
        <div class="litlink-modal">
            <div class="litlink-modal-header">
                <div class="litlink-modal-icon" style="background: rgba(${hexToRgb(MODAL_THEME.confirm)}, 0.2); color: ${MODAL_THEME.confirm};">
                    <i class="fas fa-question-circle"></i>
                </div>
                <h3 class="litlink-modal-title">${escapeHtml(title)}</h3>
                <button class="litlink-modal-close" onclick="closeLitlinkModal(false)">&times;</button>
            </div>
            <div class="litlink-modal-body">
                ${escapeHtml(message).replace(/\n/g, '<br>')}
            </div>
            <div class="litlink-modal-actions">
                <button class="litlink-modal-btn litlink-modal-btn-secondary" onclick="handleLitlinkConfirm(false)">Cancel</button>
                <button class="litlink-modal-btn litlink-modal-btn-primary" onclick="handleLitlinkConfirm(true)">OK</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Store callbacks
    overlay.dataset.onConfirm = 'true';
    window.__litlinkModalOnConfirm = onConfirm;
    window.__litlinkModalOnCancel = onCancel;
    
    // Animate in
    setTimeout(() => {
        overlay.style.opacity = '1';
        overlay.querySelector('.litlink-modal').style.transform = 'scale(1)';
    }, 10);
    
    // Close on overlay click
    overlay.addEventListener('click', function(e) {
        if (e.target === overlay) {
            closeLitlinkModal(false);
        }
    });
    
    // Close on Escape key
    const escapeHandler = function(e) {
        if (e.key === 'Escape') {
            closeLitlinkModal(false);
            document.removeEventListener('keydown', escapeHandler);
        }
    };
    document.addEventListener('keydown', escapeHandler);
    
    // Prevent body scroll
    document.body.style.overflow = 'hidden';
}

/**
 * Show a prompt modal (replaces prompt)
 * @param {string} title - Modal title
 * @param {string} message - Modal message
 * @param {string} defaultValue - Default input value
 * @param {Function} onConfirm - Callback with input value when user confirms
 * @param {Function} onCancel - Optional callback when user cancels
 */
function showPromptModal(title, message, defaultValue = '', onConfirm, onCancel = null) {
    // Remove existing modals
    const existingModal = document.getElementById('litlinkModalOverlay');
    if (existingModal) {
        existingModal.remove();
    }

    const overlay = document.createElement('div');
    overlay.id = 'litlinkModalOverlay';
    overlay.className = 'litlink-modal-overlay';
    
    overlay.innerHTML = `
        <div class="litlink-modal" style="max-width: 500px;">
            <div class="litlink-modal-header">
                <div class="litlink-modal-icon" style="background: rgba(${hexToRgb(MODAL_THEME.info)}, 0.2); color: ${MODAL_THEME.info};">
                    <i class="fas fa-edit"></i>
                </div>
                <h3 class="litlink-modal-title">${escapeHtml(title)}</h3>
                <button class="litlink-modal-close" onclick="closeLitlinkModal(false)">&times;</button>
            </div>
            <div class="litlink-modal-body">
                <p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>
                <input type="text" id="litlinkPromptInput" class="litlink-modal-input" value="${escapeHtml(defaultValue)}" placeholder="Enter your response...">
            </div>
            <div class="litlink-modal-actions">
                <button class="litlink-modal-btn litlink-modal-btn-secondary" onclick="handleLitlinkPrompt(false)">Cancel</button>
                <button class="litlink-modal-btn litlink-modal-btn-primary" onclick="handleLitlinkPrompt(true)">OK</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Store callbacks
    overlay.dataset.onConfirm = 'true';
    window.__litlinkModalOnConfirm = onConfirm;
    window.__litlinkModalOnCancel = onCancel;
    
    // Focus input
    setTimeout(() => {
        const input = document.getElementById('litlinkPromptInput');
        if (input) {
            input.focus();
            input.select();
        }
    }, 100);
    
    // Animate in
    setTimeout(() => {
        overlay.style.opacity = '1';
        overlay.querySelector('.litlink-modal').style.transform = 'scale(1)';
    }, 10);
    
    // Close on overlay click
    overlay.addEventListener('click', function(e) {
        if (e.target === overlay) {
            closeLitlinkModal(false);
        }
    });
    
    // Handle Enter key
    const input = overlay.querySelector('#litlinkPromptInput');
    if (input) {
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                handleLitlinkPrompt(true);
            }
        });
    }
    
    // Close on Escape key
    const escapeHandler = function(e) {
        if (e.key === 'Escape') {
            closeLitlinkModal(false);
            document.removeEventListener('keydown', escapeHandler);
        }
    };
    document.addEventListener('keydown', escapeHandler);
    
    // Prevent body scroll
    document.body.style.overflow = 'hidden';
}

/**
 * Handle confirm action
 */
function handleLitlinkConfirm(confirmed) {
    if (confirmed && window.__litlinkModalOnConfirm) {
        window.__litlinkModalOnConfirm();
    } else if (!confirmed && window.__litlinkModalOnCancel) {
        window.__litlinkModalOnCancel();
    }
    closeLitlinkModal(confirmed);
}

/**
 * Handle prompt action
 */
function handleLitlinkPrompt(confirmed) {
    const input = document.getElementById('litlinkPromptInput');
    const value = input ? input.value : '';
    
    if (confirmed && window.__litlinkModalOnConfirm) {
        window.__litlinkModalOnConfirm(value);
    } else if (!confirmed && window.__litlinkModalOnCancel) {
        window.__litlinkModalOnCancel();
    }
    closeLitlinkModal(confirmed);
}

/**
 * Close the modal
 */
function closeLitlinkModal(confirmed = null) {
    const overlay = document.getElementById('litlinkModalOverlay');
    if (overlay) {
        overlay.style.opacity = '0';
        const modal = overlay.querySelector('.litlink-modal');
        if (modal) {
            modal.style.transform = 'scale(0.9)';
        }
        
        setTimeout(() => {
            overlay.remove();
            document.body.style.overflow = '';
            
            // Call callback if exists
            if (overlay.dataset.callback === 'true' && window.__litlinkModalCallback) {
                window.__litlinkModalCallback(confirmed);
            }
            
            // Clean up callbacks
            delete window.__litlinkModalCallback;
            delete window.__litlinkModalOnConfirm;
            delete window.__litlinkModalOnCancel;
        }, 300);
    }
}

/**
 * Utility: Escape HTML
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Utility: Convert hex to RGB
 */
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? 
        `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : 
        '217, 119, 6';
}

/**
 * Initialize modal styles if not already added
 */
function initModalStyles() {
    if (document.getElementById('litlinkModalStyles')) {
        return; // Styles already added
    }

    const style = document.createElement('style');
    style.id = 'litlinkModalStyles';
    style.textContent = `
        /* Litlink Modal Styles */
        .litlink-modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: ${MODAL_THEME.overlay};
            backdrop-filter: blur(5px);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0;
            transition: opacity 0.3s ease;
        }

        .litlink-modal {
            background: ${MODAL_THEME.background};
            border: 2px solid ${MODAL_THEME.border};
            border-radius: 20px;
            padding: 30px;
            max-width: 500px;
            width: 90%;
            max-height: 90vh;
            overflow-y: auto;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
            transform: scale(0.9);
            transition: transform 0.3s ease;
            position: relative;
        }

        .litlink-modal-header {
            display: flex;
            align-items: center;
            gap: 15px;
            margin-bottom: 20px;
        }

        .litlink-modal-icon {
            font-size: 2rem;
            width: 50px;
            height: 50px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }

        .litlink-modal-title {
            color: ${MODAL_THEME.textPrimary};
            font-size: 1.5rem;
            font-weight: 600;
            margin: 0;
            flex: 1;
        }

        .litlink-modal-close {
            background: none;
            border: none;
            color: ${MODAL_THEME.textSecondary};
            font-size: 1.5rem;
            cursor: pointer;
            padding: 0;
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 8px;
            transition: all 0.2s;
        }

        .litlink-modal-close:hover {
            background: rgba(245, 230, 211, 0.1);
            color: ${MODAL_THEME.textPrimary};
        }

        .litlink-modal-body {
            color: ${MODAL_THEME.textSecondary};
            font-size: 1rem;
            line-height: 1.6;
            margin-bottom: 25px;
        }

        .litlink-modal-input {
            width: 100%;
            padding: 12px 16px;
            background: rgba(245, 230, 211, 0.1);
            border: 2px solid rgba(245, 230, 211, 0.2);
            border-radius: 10px;
            color: ${MODAL_THEME.textPrimary};
            font-size: 1rem;
            margin-top: 15px;
            transition: all 0.3s;
        }

        .litlink-modal-input:focus {
            outline: none;
            border-color: rgba(245, 230, 211, 0.5);
            background: rgba(245, 230, 211, 0.05);
        }

        .litlink-modal-actions {
            display: flex;
            gap: 12px;
            justify-content: flex-end;
        }

        .litlink-modal-btn {
            padding: 12px 24px;
            border: 2px solid;
            border-radius: 10px;
            font-size: 1rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.3s;
            min-width: 100px;
        }

        .litlink-modal-btn-primary {
            background: rgba(245, 230, 211, 0.1);
            border-color: rgba(245, 230, 211, 0.3);
            color: ${MODAL_THEME.textPrimary};
        }

        .litlink-modal-btn-primary:hover {
            background: rgba(245, 230, 211, 0.2);
            border-color: rgba(245, 230, 211, 0.5);
        }

        .litlink-modal-btn-secondary {
            background: transparent;
            border-color: rgba(212, 181, 160, 0.3);
            color: ${MODAL_THEME.textSecondary};
        }

        .litlink-modal-btn-secondary:hover {
            background: rgba(212, 181, 160, 0.1);
            border-color: rgba(212, 181, 160, 0.5);
        }

        /* Animations */
        @keyframes litlinkModalFadeIn {
            from {
                opacity: 0;
                transform: scale(0.9);
            }
            to {
                opacity: 1;
                transform: scale(1);
            }
        }
    `;
    
    document.head.appendChild(style);
}

// Initialize styles when script loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initModalStyles);
} else {
    initModalStyles();
}

// Make functions globally available
window.showMessageModal = showMessageModal;
window.showConfirmModal = showConfirmModal;
window.showPromptModal = showPromptModal;
window.closeLitlinkModal = closeLitlinkModal;
window.handleLitlinkConfirm = handleLitlinkConfirm;
window.handleLitlinkPrompt = handleLitlinkPrompt;

