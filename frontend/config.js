(function () {
  var localBackendOrigins = [
    'http://localhost:5002',
    'http://127.0.0.1:5002'
  ];

  function trimSlash(value) {
    return String(value || '').replace(/\/$/, '');
  }

  function isLocalPage() {
    return (
      window.location.protocol === 'file:' ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1'
    );
  }

  function getBackendOrigin() {
    if (window.LITLINK_BACKEND_URL) {
      return trimSlash(window.LITLINK_BACKEND_URL);
    }

    return isLocalPage() ? 'http://localhost:5002' : window.location.origin;
  }

  function rewriteLitlinkUrl(value) {
    if (!value) return value;

    var text = String(value);
    var backendOrigin = getBackendOrigin();

    for (var i = 0; i < localBackendOrigins.length; i += 1) {
      if (text.indexOf(localBackendOrigins[i]) === 0) {
        return backendOrigin + text.slice(localBackendOrigins[i].length);
      }
    }

    return value;
  }

  window.LitlinkConfig = {
    get backendOrigin() {
      return getBackendOrigin();
    },
    get apiBaseUrl() {
      return getBackendOrigin() + '/api';
    },
    rewriteUrl: rewriteLitlinkUrl
  };

  window.API_BASE_URL = window.LitlinkConfig.apiBaseUrl;
  window.API_BASE = window.LitlinkConfig.apiBaseUrl;

  if (window.fetch) {
    var originalFetch = window.fetch.bind(window);

    window.fetch = function (input, init) {
      if (typeof input === 'string') {
        return originalFetch(rewriteLitlinkUrl(input), init);
      }

      if (input instanceof URL) {
        return originalFetch(new URL(rewriteLitlinkUrl(input.toString())), init);
      }

      if (input instanceof Request) {
        var rewrittenRequest = new Request(rewriteLitlinkUrl(input.url), input);
        return originalFetch(rewrittenRequest, init);
      }

      return originalFetch(input, init);
    };
  }

  function wrapSocketIo(ioFactory) {
    if (typeof ioFactory !== 'function' || ioFactory.__litlinkWrapped) {
      return ioFactory;
    }

    var wrapped = function (url) {
      if (typeof url === 'string') {
        arguments[0] = rewriteLitlinkUrl(url);
      }

      return ioFactory.apply(this, arguments);
    };

    Object.keys(ioFactory).forEach(function (key) {
      wrapped[key] = ioFactory[key];
    });

    wrapped.__litlinkWrapped = true;
    return wrapped;
  }

  var currentIo = window.io;

  Object.defineProperty(window, 'io', {
    configurable: true,
    get: function () {
      return currentIo;
    },
    set: function (value) {
      currentIo = wrapSocketIo(value);
    }
  });

  if (currentIo) {
    window.io = currentIo;
  }

  // Session-safe auth access helpers (sessionStorage first, guarded local fallback)
  var TOKEN_KEYS = ['litlink_token', 'authToken', 'token'];
  var USER_KEYS = ['litlink_user', 'user'];
  var USER_ID_KEYS = ['litlink_userId', 'userId'];

  function readFirst(storage, keys) {
    for (var i = 0; i < keys.length; i += 1) {
      var value = storage.getItem(keys[i]);
      if (value) return value;
    }
    return null;
  }

  function writeAll(storage, keys, value) {
    if (!value) return;
    for (var i = 0; i < keys.length; i += 1) {
      storage.setItem(keys[i], value);
    }
  }

  function parseJsonSafe(value) {
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch (_) {
      return null;
    }
  }

  function seedSessionFromLocalToken() {
    var sessionToken = readFirst(sessionStorage, TOKEN_KEYS);
    if (sessionToken) return sessionToken;

    var localToken = readFirst(localStorage, TOKEN_KEYS);
    if (localToken) {
      writeAll(sessionStorage, TOKEN_KEYS, localToken);
    }
    return localToken;
  }

  function seedSessionUser(user) {
    if (!user) return;
    var userStr = JSON.stringify(user);
    writeAll(sessionStorage, USER_KEYS, userStr);

    var userId = user._id || user.id || null;
    if (userId) {
      writeAll(sessionStorage, USER_ID_KEYS, String(userId));
    }
  }

  window.LitlinkSessionAuth = {
    getToken: function () {
      try {
        return seedSessionFromLocalToken();
      } catch (_) {
        return null;
      }
    },

    getUser: function () {
      try {
        var sessionUser = parseJsonSafe(readFirst(sessionStorage, USER_KEYS));
        if (sessionUser) return sessionUser;

        var sessionToken = readFirst(sessionStorage, TOKEN_KEYS);
        var localToken = readFirst(localStorage, TOKEN_KEYS);

        // If this tab already has its own session token, do not hydrate user data
        // from a different token in localStorage (prevents cross-account swapping).
        if (sessionToken && localToken && sessionToken !== localToken) {
          return null;
        }

        if (!sessionToken && localToken) {
          writeAll(sessionStorage, TOKEN_KEYS, localToken);
        }

        var localUser = parseJsonSafe(readFirst(localStorage, USER_KEYS));
        if (localUser) {
          seedSessionUser(localUser);
        }
        return localUser;
      } catch (_) {
        return null;
      }
    },

    getUserId: function () {
      try {
        var sessionUserId = readFirst(sessionStorage, USER_ID_KEYS);
        if (sessionUserId) return sessionUserId;

        var user = this.getUser();
        return user ? String(user._id || user.id || '') : '';
      } catch (_) {
        return '';
      }
    },

    getAuthHeaders: function (extraHeaders) {
      var token = this.getToken();
      var headers = {};
      if (token) headers.Authorization = 'Bearer ' + token;
      if (extraHeaders && typeof extraHeaders === 'object') {
        for (var key in extraHeaders) {
          headers[key] = extraHeaders[key];
        }
      }
      return headers;
    }
  };

  // Profile completion gate — blocks users with <30% completion from accessing
  // restricted pages. Redirects to profile page with a warning message.
  window.checkProfileGate = async function checkProfileGate() {
    var token = (window.LitlinkSessionAuth && window.LitlinkSessionAuth.getToken()) || null;
    if (!token) return true;

    // Prevent redirect loops: if we just came from a gate redirect, skip check
    if (sessionStorage.getItem('_gate_redirected') === '1') {
      sessionStorage.removeItem('_gate_redirected');
      return true;
    }

    var currentPath = window.location.pathname;
    var currentFile = currentPath.split('/').pop() || '';

    // Allowed pages — user can always access these even with low completion
    var allowedFiles = ['profile.html', 'settings.html', 'view-profile.html', 'index.html'];
    if (allowedFiles.indexOf(currentFile) !== -1) return true;

    var isHomepage = /Homepage/i.test(currentPath) && !/Dashboard|Chat|Discussion|Voice|Genre|Circle/i.test(currentPath);
    var isAdminPage = /Admin/i.test(currentPath);
    if (isHomepage || isAdminPage) return true;

    try {
      var apiBase = window.API_BASE_URL || 'http://localhost:5002/api';
      var resp = await fetch(apiBase + '/auth/me', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      var data = await resp.json();
      if (data.success && data.user) {
        var completion = data.user.completionPercentage || 0;
        if (completion < 30) {
          if (typeof showMessageModal === 'function') {
            showMessageModal(
              'Profile Incomplete',
              'Please complete at least 30% of your profile before accessing other sections.',
              'warning'
            );
          } else {
            alert('Please complete at least 30% of your profile before accessing other sections.');
          }
          sessionStorage.setItem('_gate_redirected', '1');
          setTimeout(function() {
            window.location.href = '../Profile/profile.html';
          }, 2000);
          return false;
        }
      }
    } catch (e) {
      console.error('Profile gate check error:', e);
    }
    return true;
  };

  // Auto-run gate check on DOMContentLoaded for any page that loads config.js
  document.addEventListener('DOMContentLoaded', function() {
    if (typeof window.checkProfileGate === 'function') {
      window.checkProfileGate();
    }
  });

  // Match percentage + activity helpers shared across dashboard/chat.
  window.LitlinkMatchUtils = {
    normalizePercentage: function (value) {
      var score = Number(value);
      if (!Number.isFinite(score)) score = 0;

      if (score > 0 && score <= 1) return Math.round(score * 100);
      if (score > 1 && score <= 100) return Math.round(score);
      if (score > 100) {
        if (score % 100 === 0 && score <= 10000) return Math.round(score / 100);
        return Math.round(score % 100);
      }

      return Math.max(0, Math.round(score));
    },

    formatPercentage: function (value) {
      return this.normalizePercentage(value) + '%';
    },

    getLatestActivityTimestamp: function (item) {
      if (!item) return 0;
      var raw = item.lastMessageTime || item.updatedAt || item.lastActivity || item.createdAt || 0;
      var time = new Date(raw).getTime();
      return Number.isFinite(time) ? time : 0;
    }
  };
}());
