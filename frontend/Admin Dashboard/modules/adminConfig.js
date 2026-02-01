// Shared config for Admin Dashboard scripts (non-module).
// Keep as plain globals so it works with a normal <script> tag.

(function initAdminConfig() {
  window.AdminConfig = window.AdminConfig || {};

  // Admin API base used across the dashboard
  window.AdminConfig.API_BASE = window.AdminConfig.API_BASE || 'http://localhost:5002/api/admin';

  // Root API base (non-admin endpoints like /notifications)
  window.AdminConfig.API_ROOT = window.AdminConfig.API_ROOT || window.AdminConfig.API_BASE.replace(/\/admin\/?$/, '');
})();

