/**
 * textSize.js - Global utility to manage Text Size accessibility feature.
 * Automatically fetches user preferences and applies font scaling.
 */

const TEXT_SIZES = {
    'small': 0.9,
    'default': 1.0,
    'large': 1.15
};

// Initialize Text Size
async function initializeTextSize() {
    // 1. Try to load from localStorage for immediate effect
    const savedSize = localStorage.getItem('textSizePreference');
    if (savedSize && TEXT_SIZES[savedSize]) {
        applyTextSizeScale(savedSize);
    }

    // 2. Fetch from backend to sync (if user is logged in)
    const token = localStorage.getItem('litlink_token') || localStorage.getItem('token');
    if (token) {
        try {
            const response = await fetch('http://localhost:5002/api/users/preferences', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.success && data.textSizePreference) {
                    const pref = data.textSizePreference;
                    if (pref !== savedSize) {
                        localStorage.setItem('textSizePreference', pref);
                        applyTextSizeScale(pref);
                    }
                }
            }
        } catch (error) {
            console.error('Error fetching text size preference:', error);
        }
    }
}

// Apply the scale to the HTML root element
function applyTextSizeScale(sizeName) {
    const scale = TEXT_SIZES[sizeName] || TEXT_SIZES['default'];
    // Update CSS Variable
    document.documentElement.style.setProperty('--font-scale', scale);
    // Update Root font-size (16px base)
    document.documentElement.style.fontSize = `calc(16px * var(--font-scale))`;
    
    // Update UI if buttons are present
    document.querySelectorAll('.size-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-size') === sizeName) {
            btn.classList.add('active');
        }
    });
}

// Called by UI buttons
async function setTextSize(sizeName) {
    if (!TEXT_SIZES[sizeName]) return;

    // Apply instantly
    applyTextSizeScale(sizeName);
    localStorage.setItem('textSizePreference', sizeName);

    // Save to backend
    const token = localStorage.getItem('litlink_token') || localStorage.getItem('token');
    if (token) {
        try {
            await fetch('http://localhost:5002/api/users/preferences', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ textSizePreference: sizeName })
            });
        } catch (error) {
            console.error('Error updating text size preference:', error);
        }
    }
}

// Run on page load
document.addEventListener('DOMContentLoaded', () => {
    initializeTextSize();
    injectAccessibilityControls();
});

// Inject UI controls automatically if missing
function injectAccessibilityControls() {
    // If controls already exist or it's a minimal page, skip
    if (document.querySelector('.text-size-controls')) return;

    // Find a suitable place to inject (Footer > Container or Body)
    const footer = document.querySelector('footer .container') || document.querySelector('footer') || document.body;
    
    const controls = document.createElement('div');
    controls.className = 'text-size-controls global-accessibility-controls';
    controls.innerHTML = `
        <span style="font-size: 0.8rem; opacity: 0.7; margin-bottom: 4px; display: block; width: 100%; text-align: center;">Text Size</span>
        <div style="display: flex; gap: 8px; justify-content: center;">
            <button class="size-btn" data-size="small" onclick="setTextSize('small')" title="Smaller Text">A-</button>
            <button class="size-btn" data-size="default" onclick="setTextSize('default')" title="Default Text">A</button>
            <button class="size-btn" data-size="large" onclick="setTextSize('large')" title="Larger Text">A+</button>
        </div>
    `;

    // Inject styles if missing
    if (!document.getElementById('global-text-size-styles')) {
        const style = document.createElement('style');
        style.id = 'global-text-size-styles';
        style.textContent = `
            .text-size-controls.global-accessibility-controls {
                padding: 15px;
                margin-top: 20px;
                border-top: 1px solid rgba(245, 230, 211, 0.1);
                display: flex;
                flex-direction: column;
                align-items: center;
                width: 100%;
            }
            .size-btn {
                background: rgba(245, 230, 211, 0.1);
                color: #f5e6d3;
                border: 1px solid rgba(245, 230, 211, 0.2);
                border-radius: 4px;
                padding: 4px 12px;
                cursor: pointer;
                font-weight: bold;
                transition: all 0.2s ease;
            }
            .size-btn:hover {
                background: rgba(245, 230, 211, 0.2);
            }
            .size-btn.active {
                background: #f5e6d3;
                color: #3d2617;
                border-color: #f5e6d3;
            }
        `;
        document.head.appendChild(style);
    }

    footer.appendChild(controls);
    
    // Set active button
    const currentSize = localStorage.getItem('textSizePreference') || 'default';
    const activeBtn = controls.querySelector(`[data-size="${currentSize}"]`);
    if (activeBtn) activeBtn.classList.add('active');
}
