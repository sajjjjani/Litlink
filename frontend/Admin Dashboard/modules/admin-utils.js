// Admin Dashboard – shared utilities (toast, loading, time, ripple)
(function () {
  'use strict';

  function showLoadingState(show) {
    const loader = document.getElementById('dashboard-loader');
    if (!loader && show) {
      const loaderEl = document.createElement('div');
      loaderEl.id = 'dashboard-loader';
      loaderEl.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(26, 15, 10, 0.8); backdrop-filter: blur(5px);
        display: flex; justify-content: center; align-items: center;
        z-index: 9999; font-size: 18px; color: #d4a574;
      `;
      loaderEl.innerHTML = '🔄 Loading dashboard data...';
      document.body.appendChild(loaderEl);
    } else if (loader && !show) {
      loader.remove();
    }
  }

  function showToast(message, type) {
    type = type || 'info';
    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed; bottom: 20px; right: 20px;
      background: ${type === 'warning' ? 'rgba(234, 179, 8, 0.9)' : type === 'error' ? 'rgba(220, 38, 38, 0.9)' : type === 'success' ? 'rgba(22, 163, 74, 0.9)' : 'rgba(44, 24, 16, 0.9)'};
      color: #f5e6d3; padding: 12px 20px; border-radius: 8px;
      border-left: 4px solid ${type === 'warning' ? '#eab308' : type === 'error' ? '#dc2626' : type === 'success' ? '#16a34a' : '#d4a574'};
      z-index: 10000; box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
      animation: slideInRight 0.3s ease-out; font-size: 14px;
    `;
    document.body.appendChild(toast);
    setTimeout(function () {
      toast.style.animation = 'slideOutRight 0.3s ease-out forwards';
      setTimeout(function () { toast.remove(); }, 300);
    }, 3000);
  }

  function getTimeAgo(date) {
    var d = date instanceof Date ? date : new Date(date);
    var now = new Date();
    var diffMs = now - d;
    var diffMins = Math.floor(diffMs / 60000);
    var diffHours = Math.floor(diffMs / 3600000);
    var diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return diffMins + ' ' + (diffMins === 1 ? 'min' : 'mins') + ' ago';
    if (diffHours < 24) return diffHours + ' ' + (diffHours === 1 ? 'hour' : 'hours') + ' ago';
    if (diffDays < 7) return diffDays + ' ' + (diffDays === 1 ? 'day' : 'days') + ' ago';
    return d.toLocaleDateString();
  }

  function createRipple(event) {
    var button = event.currentTarget;
    var ripple = document.createElement('span');
    var rect = button.getBoundingClientRect();
    var size = Math.max(rect.width, rect.height);
    var x = event.clientX - rect.left - size / 2;
    var y = event.clientY - rect.top - size / 2;
    ripple.style.width = ripple.style.height = size + 'px';
    ripple.style.left = x + 'px';
    ripple.style.top = y + 'px';
    ripple.classList.add('ripple');
    ripple.style.animation = 'ripple 0.6s ease-out';
    var existingRipple = button.querySelector('.ripple');
    if (existingRipple) existingRipple.remove();
    button.style.position = 'relative';
    button.style.overflow = 'hidden';
    button.appendChild(ripple);
    setTimeout(function () { ripple.remove(); }, 600);
  }

  window.AdminUtils = window.AdminUtils || {};
  window.AdminUtils.showLoadingState = showLoadingState;
  window.AdminUtils.showToast = showToast;
  window.AdminUtils.getTimeAgo = getTimeAgo;
  window.AdminUtils.createRipple = createRipple;
})();
