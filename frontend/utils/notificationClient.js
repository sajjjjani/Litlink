class NotificationClient {
  /**
   * @param {object}  opts
   * @param {string}  opts.serverUrl   e.g. 'http://localhost:5002'
   * @param {string}  opts.token       JWT from localStorage / cookie
   * @param {boolean} [opts.isAdmin]   set true on admin-facing pages
   * @param {boolean} [opts.showToasts] default true
   */
  constructor({ serverUrl, token, isAdmin = false, showToasts = true }) {
    this.serverUrl  = serverUrl;
    this.token      = token;
    this.isAdmin    = isAdmin;
    this.showToasts = showToasts;

    this.socket     = null;
    this._connected = false;
    this._listeners = {};  // event → [fn, ...]

    this._injectStyles();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  connect() {
    if (this._connected && this.socket) return;

    // Reuse a single socket instance per browser tab to avoid
    // connect/disconnect churn when multiple modules instantiate this client.
    if (typeof window !== 'undefined' && window.__litlinkNotificationSocket) {
      this.socket = window.__litlinkNotificationSocket;
      this._connected = this.socket.connected;
      this._wireSocketEvents();
      return;
    }

    if (typeof io === 'undefined') {
      console.error(
        '[NotificationClient] socket.io-client not found. ' +
        'Add: <script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script>'
      );
      return;
    }

    this.socket = io(this.serverUrl, {
      transports:           ['polling', 'websocket'],
      withCredentials:      true,
      reconnection:         true,
      reconnectionAttempts: 10,
      reconnectionDelay:    2000
    });

    if (typeof window !== 'undefined') {
      window.__litlinkNotificationSocket = this.socket;
    }

    this._wireSocketEvents();
  }

  _wireSocketEvents() {
    if (!this.socket) return;
    if (this.socket.__litlinkNotifHandlersBound) return;
    this.socket.__litlinkNotifHandlersBound = true;

    this.socket.on('connect', () => {
      console.log('[NotificationClient] Connected:', this.socket.id);
      this.socket.emit('authenticate', this.token);
    });

    this.socket.on('authenticated', ({ success, isAdmin: serverIsAdmin, error }) => {
      if (!success) {
        console.error('[NotificationClient] Auth failed:', error);
        return;
      }
      this._connected = true;
      const adminMode = serverIsAdmin || this.isAdmin;
      console.log('[NotificationClient] Authenticated', adminMode ? '(admin)' : '');

      // Immediately populate badges from REST
      this._refreshUserBadge();
      if (adminMode) {
        this._refreshAdminBadge();
        this.socket.emit('get-unread-count');
      } else {
        this.socket.emit('get-user-unread-count');
      }

      this._fire('authenticated', { isAdmin: adminMode });
    });

    // ── Real-time user notification ────────────────────────────────────────
    this.socket.on('notification', (data) => {
      console.log('[NotificationClient] notification:', data.type, data);

      if (this.showToasts) this._showToast(data, false);

      // Refresh the general badge
      this._refreshUserBadge();

      // Fire the generic 'notification' listener
      this._fire('notification', data);

      // Fire a type-specific listener so callers can do:
      //   client.on('follow', handler)
      //   client.on('circle_join_request', handler)  etc.
      if (data.type) this._fire(data.type, data);
    });

    // ── Real-time admin notification ───────────────────────────────────────
    this.socket.on('admin-notification', (data) => {
      console.log('[NotificationClient] admin-notification:', data.type, data);

      if (this.showToasts) this._showToast(data, true);

      this._refreshAdminBadge();
      this._fire('admin-notification', data);
      if (data.type) this._fire(data.type, data);
    });

    // ── Socket-pushed badge counts ─────────────────────────────────────────
    this.socket.on('notification-count',      ({ unreadCount }) => this._setAdminBadge(unreadCount));
    this.socket.on('user-notification-count', ({ unreadCount }) => this._setUserBadge(unreadCount));

    this.socket.on('disconnect', (reason) => {
      console.warn('[NotificationClient] Disconnected:', reason);
      this._connected = false;
    });

    this.socket.on('reconnect_attempt', (attempt) => {
      console.log('[NotificationClient] Reconnect attempt:', attempt);
    });

    this.socket.on('reconnect', (attempt) => {
      console.log('[NotificationClient] Reconnected after attempts:', attempt);
      this.socket.emit('authenticate', this.token);
    });

    this.socket.on('connect_error', (err) => {
      console.error('[NotificationClient] Connection error:', err.message);
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket      = null;
      this._connected  = false;
    }
  }

  /**
   * Subscribe to events.
   *
   * Generic events:   'notification' | 'admin-notification' | 'authenticated'
   * Type-specific:    'follow' | 'thread_liked' | 'thread_commented' |
   *                   'circle_new_thread' | 'circle_join_request' | 'circle_accepted'
   *                   (any value of notification.type is also fired as its own event)
   *
   * Returns `this` for chaining.
   */
  on(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
    return this;
  }

  off(event, fn) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter(f => f !== fn);
    return this;
  }

  // ── REST helpers ───────────────────────────────────────────────────────────

  async _refreshUserBadge() {
    try {
      const res = await fetch(`${this.serverUrl}/api/notifications/unread-count`, {
        headers: { Authorization: `Bearer ${this.token}` }
      });
      if (!res.ok) return;
      const { unreadCount } = await res.json();
      this._setUserBadge(unreadCount);
    } catch { /* network error — silent */ }
  }

  async _refreshAdminBadge() {
    try {
      const res = await fetch(`${this.serverUrl}/api/notifications/unread-count?type=admin`, {
        headers: { Authorization: `Bearer ${this.token}` }
      });
      if (!res.ok) return;
      const { unreadCount, urgentCount } = await res.json();
      this._setAdminBadge(unreadCount, urgentCount);
    } catch { /* silent */ }
  }

  // ── DOM badge writers ──────────────────────────────────────────────────────

  _setUserBadge(count) {
    const display = count > 0 ? (count > 9 ? '9+' : String(count)) : '';

    // Target the Litlink dashboard badge by ID (primary)
    const idBadge = document.getElementById('notificationBadge');
    if (idBadge) {
      idBadge.textContent  = display;
      idBadge.style.display = count > 0 ? 'flex' : 'none';
    }

    // Also support data-attribute badges on other pages
    document.querySelectorAll('[data-notif-badge=""]').forEach(el => {
      el.textContent  = display;
      el.style.display = count > 0 ? '' : 'none';
    });

    this._fire('badge-updated', { count });
  }

  _setAdminBadge(unread, urgent = 0) {
    document.querySelectorAll('[data-admin-notif-badge]').forEach(el => {
      el.textContent  = unread > 0 ? unread : '';
      el.style.display = unread > 0 ? '' : 'none';
    });
    document.querySelectorAll('[data-admin-urgent-badge]').forEach(el => {
      el.textContent  = urgent > 0 ? urgent : '';
      el.style.display = urgent > 0 ? '' : 'none';
    });
    this._fire('admin-badge-updated', { unread, urgent });
  }

  // ── Toast renderer ─────────────────────────────────────────────────────────

  _showToast(data, isAdmin = false) {
    const {
      title    = 'Notification',
      message  = '',
      priority = 'medium',
      actionUrl,
      icon     = '🔔',
      type     = ''
    } = data;

    const container = this._getOrCreateToastContainer();

    const toast = document.createElement('div');
    toast.className = [
      'litlink-toast',
      `litlink-toast--${priority}`,
      isAdmin ? 'litlink-toast--admin' : '',
      type ? `litlink-toast--type-${type.replace(/_/g, '-')}` : ''
    ].filter(Boolean).join(' ');

    toast.innerHTML = `
      <div class="litlink-toast__icon">${this._esc(icon)}</div>
      <div class="litlink-toast__body">
        <p class="litlink-toast__title">${this._esc(title)}</p>
        <p class="litlink-toast__msg">${this._esc(message)}</p>
        ${actionUrl
          ? `<a class="litlink-toast__link" href="${this._esc(actionUrl)}">View →</a>`
          : ''}
      </div>
      <button class="litlink-toast__close" aria-label="Dismiss">✕</button>
    `;

    toast.querySelector('.litlink-toast__close')
      .addEventListener('click', () => this._removeToast(toast));

    if (actionUrl) {
      toast.querySelector('.litlink-toast__link')
        .addEventListener('click', () => this._removeToast(toast));
    }

    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('litlink-toast--visible'));

    // Urgent stays 8 s, everything else 5 s
    setTimeout(() => this._removeToast(toast), priority === 'urgent' ? 8000 : 5000);
  }

  _removeToast(toast) {
    toast.classList.remove('litlink-toast--visible');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }

  _getOrCreateToastContainer() {
    let c = document.getElementById('litlink-toast-container');
    if (!c) {
      c = document.createElement('div');
      c.id = 'litlink-toast-container';
      document.body.appendChild(c);
    }
    return c;
  }

  // ── Internal event bus ─────────────────────────────────────────────────────

  _fire(event, data) {
    (this._listeners[event] || []).forEach(fn => {
      try { fn(data); }
      catch (e) { console.error('[NotificationClient] Listener error:', e); }
    });
  }

  // ── XSS-safe string escaping ───────────────────────────────────────────────

  _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Inject toast CSS once ──────────────────────────────────────────────────

  _injectStyles() {
    if (document.getElementById('litlink-notif-styles')) return;

    const style = document.createElement('style');
    style.id = 'litlink-notif-styles';
    style.textContent = `
      #litlink-toast-container {
        position: fixed;
        top: 1rem;
        right: 1rem;
        z-index: 99999;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        max-width: 360px;
        width: 100%;
        pointer-events: none;
      }

      .litlink-toast {
        display: flex;
        align-items: flex-start;
        gap: 0.75rem;
        background: #1e1e2e;
        color: #e2e8f0;
        border-left: 4px solid #6366f1;
        border-radius: 0.5rem;
        padding: 0.875rem 1rem;
        box-shadow: 0 4px 20px rgba(0,0,0,0.4);
        pointer-events: all;
        opacity: 0;
        transform: translateX(120%);
        transition: opacity 0.3s ease, transform 0.3s ease;
      }
      .litlink-toast--visible { opacity: 1; transform: translateX(0); }

      /* ── Priority colours ── */
      .litlink-toast--low    { border-left-color: #64748b; }
      .litlink-toast--medium { border-left-color: #6366f1; }
      .litlink-toast--high   { border-left-color: #f59e0b; }
      .litlink-toast--urgent {
        border-left-color: #ef4444;
        animation: litlink-pulse 1s ease infinite;
      }

      /* ── Notification-type accent colours ── */
      .litlink-toast--type-follow            { border-left-color: #22d3ee; }
      .litlink-toast--type-thread-liked      { border-left-color: #f43f5e; }
      .litlink-toast--type-thread-commented  { border-left-color: #a78bfa; }
      .litlink-toast--type-circle-new-thread { border-left-color: #34d399; }
      .litlink-toast--type-circle-join-request { border-left-color: #fbbf24; }
      .litlink-toast--type-circle-accepted   { border-left-color: #4ade80; }

      /* ── Admin badge ── */
      .litlink-toast--admin { background: #1a1040; border-left-color: #a855f7; }

      @keyframes litlink-pulse {
        0%, 100% { box-shadow: 0 4px 20px rgba(239,68,68,0.3); }
        50%       { box-shadow: 0 4px 30px rgba(239,68,68,0.6); }
      }

      .litlink-toast__icon { font-size: 1.4rem; flex-shrink: 0; line-height: 1; }
      .litlink-toast__body { flex: 1; min-width: 0; }

      .litlink-toast__title {
        margin: 0 0 0.2rem;
        font-weight: 600;
        font-size: 0.875rem;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .litlink-toast__msg {
        margin: 0;
        font-size: 0.8rem;
        color: #94a3b8;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .litlink-toast__link {
        display: inline-block;
        margin-top: 0.3rem;
        font-size: 0.75rem;
        color: #818cf8;
        text-decoration: none;
      }
      .litlink-toast__link:hover { text-decoration: underline; }

      .litlink-toast__close {
        background: none;
        border: none;
        color: #64748b;
        cursor: pointer;
        font-size: 0.75rem;
        padding: 0;
        line-height: 1;
        flex-shrink: 0;
        transition: color 0.2s;
      }
      .litlink-toast__close:hover { color: #e2e8f0; }
    `;

    document.head.appendChild(style);
  }
}

// ── Module export (CommonJS / ESM / global) ───────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
  module.exports = NotificationClient;
} else if (typeof window !== 'undefined') {
  window.NotificationClient = NotificationClient;
}