class CommunityPulse {
  constructor(containerId) {
    this.containerId = containerId;
    this.container = document.getElementById(containerId);
    this.activities = [];
    this.API_URL = 'http://localhost:5002/api/activity';
  }

  async init() {
    if (!this.container) return;
    await this.fetchActivities();
    this.render();
    
    // Refresh every 30 seconds
    setInterval(() => this.fetchActivities().then(() => this.render()), 30000);
  }

  async fetchActivities() {
    try {
      const token = localStorage.getItem('litlink_token');
      const response = await fetch(this.API_URL, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      const data = await response.json();
      if (data.success) {
        this.activities = data.activities;
      }
    } catch (error) {
      console.error('Error fetching activities:', error);
    }
  }

  render() {
    if (!this.container) return;
    
    if (this.activities.length === 0) {
      this.container.innerHTML = '<div style="color: #a78c6d; padding: 10px;">No recent activity</div>';
      return;
    }

    this.container.innerHTML = this.activities.map(activity => {
      const user = activity.user || {};
      const initial = (user.name || 'U').charAt(0).toUpperCase();
      const timeAgo = this.getTimeAgo(activity.createdAt);
      let icon = '💬';
      
      if (activity.type === 'CIRCLE_CREATED') icon = '🆕';
      if (activity.type === 'CIRCLE_JOINED') icon = '👋';
      if (activity.type === 'DISCUSSION_CREATED') icon = '📝';
      if (activity.type === 'POST_CREATED') icon = '📌';
      if (activity.type === 'COMMENT_ADDED') icon = '💬';

      return `
        <div class="activity-item" style="display: flex; gap: 12px; margin-bottom: 15px; align-items: start;">
          <div class="avatar" style="width: 32px; height: 32px; min-width: 32px; background: #7A4432; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; color: white;">
            ${initial}
          </div>
          <div class="activity-content" style="flex: 1;">
            <div style="font-size: 14px;">
              <strong>${user.name || 'Someone'}</strong> ${activity.message}
            </div>
            <div style="font-size: 12px; color: #a78c6d; margin-top: 4px;">
              ${icon} ${timeAgo}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  getTimeAgo(dateString) {
    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const pulse = new CommunityPulse('feedScroll');
  pulse.init();
});
