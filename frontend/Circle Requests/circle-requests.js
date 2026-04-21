const API_BASE = 'http://localhost:5002/api';
const listEl = document.getElementById('requestsList');
let requests = [];

function getToken() {
  return localStorage.getItem('litlink_token') || localStorage.getItem('token');
}

function showSystemMessage(title, message, type = 'info') {
  if (window.SystemModal) {
    if (type === 'success') return window.SystemModal.success(title, message);
    if (type === 'error') return window.SystemModal.error(title, message);
    return window.SystemModal.info(title, message);
  }
  alert(message);
}

function renderRequests() {
  if (!requests.length) {
    listEl.innerHTML = '<div class="empty">No pending requests for your circles.</div>';
    return;
  }

  listEl.innerHTML = requests.map(req => `
    <div class="card" data-request-id="${req.id}">
      <div>
        <div><strong>${req.sender.name}</strong> wants to join <strong>${req.circleName}</strong></div>
        <div class="meta">@${req.sender.username || 'reader'} • ${new Date(req.createdAt).toLocaleString()}</div>
      </div>
      <div class="actions">
        <button class="btn accept" data-action="accept" data-id="${req.id}">Accept</button>
        <button class="btn reject" data-action="reject" data-id="${req.id}">Reject</button>
      </div>
    </div>
  `).join('');
}

async function loadRequests() {
  const token = getToken();
  if (!token) {
    listEl.innerHTML = '<div class="empty">Please log in to view circle requests.</div>';
    return;
  }

  const response = await fetch(`${API_BASE}/circle-requests`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await response.json();
  if (!data.success) {
    showSystemMessage('Error', data.message || 'Failed to load requests', 'error');
    return;
  }
  requests = data.requests || [];
  renderRequests();
}

async function decideRequest(requestId, action) {
  const token = getToken();
  if (!token) return;

  // Optimistic UI update
  const old = requests.slice();
  requests = requests.filter(r => r.id !== requestId);
  renderRequests();

  try {
    const response = await fetch(`${API_BASE}/circle-requests/${requestId}/${action}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await response.json();
    if (!data.success) {
      requests = old;
      renderRequests();
      showSystemMessage('Action Failed', data.message || `Could not ${action} request`, 'error');
      return;
    }
    showSystemMessage('Success', `Request ${action === 'accept' ? 'accepted' : 'rejected'}.`, 'success');
  } catch (error) {
    requests = old;
    renderRequests();
    showSystemMessage('Network Error', 'Please try again.', 'error');
  }
}

function bindActions() {
  listEl.addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    decideRequest(id, action);
  });
}

function initRealtime() {
  const token = getToken();
  if (!token || typeof NotificationClient === 'undefined') return;

  const client = new NotificationClient({
    serverUrl: 'http://localhost:5002',
    token,
    isAdmin: false,
    showToasts: false
  });

  client.on('circle_request', () => loadRequests());
  client.on('circle_join_request', () => loadRequests());
  client.connect();
}

document.addEventListener('DOMContentLoaded', async () => {
  bindActions();
  await loadRequests();
  initRealtime();
});
