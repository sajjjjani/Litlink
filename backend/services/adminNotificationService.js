const Notification = require('../models/Notification');
const User = require('../models/User');

class AdminNotificationService {
  
  // Get all admins
  static async getAllAdmins() {
    return await User.find({ isAdmin: true }).select('_id name email');
  }
  
  // Send notification to specific admin
  static async sendToAdmin(adminId, type, title, message, options = {}) {
    try {
      const notification = await Notification.createAdminNotification(
        adminId,
        type,
        title,
        message,
        options
      );
      
      // Return populated notification
      const populated = await Notification.findById(notification._id)
        .populate('userId', 'name email profilePicture')
        .populate('sourceUserId', 'name email profilePicture');

      // Emit real-time event to that admin (if connected)
      try {
        const io = global.io;
        if (io && typeof io.sendToAdmin === 'function') {
          io.sendToAdmin(adminId.toString(), {
            type: 'admin-notification',
            notificationType: type,
            title,
            message,
            timestamp: new Date(),
            priority: options.priority || 'medium',
            metadata: options.metadata || {}
          });
        }
      } catch (socketError) {
        console.error('Error emitting admin websocket notification:', socketError);
      }

      return populated;
        
    } catch (error) {
      console.error('Error sending admin notification:', error);
      throw error;
    }
  }
  
  // Send notification to all admins
  static async sendToAllAdmins(type, title, message, options = {}) {
    try {
      const admins = await this.getAllAdmins();
      const notifications = [];
      
      for (const admin of admins) {
        const notification = await this.sendToAdmin(
          admin._id,
          type,
          title,
          message,
          options
        );
        notifications.push(notification);
      }
      
      return notifications;
    } catch (error) {
      console.error('Error sending notifications to all admins:', error);
      throw error;
    }
  }
  
  // New user signup notification
  static async notifyNewUserSignup(user) {
    return this.sendToAllAdmins(
      'admin_new_user',
      'New User Signup',
      `${user.name} (${user.email}) has joined Litlink`,
      {
        priority: 'medium',
        sourceUserId: user._id,
        relatedEntityId: user._id,
        relatedEntityType: 'User',
        actionUrl: `/admin/users/${user._id}`,
        metadata: {
          userId: user._id.toString(),
          userName: user.name,
          userEmail: user.email,
          profilePicture: user.profilePicture,
          joinedAt: new Date()
        }
      }
    );
  }
  
  // New report submitted notification
  static async notifyNewReport(report) {
    return this.sendToAllAdmins(
      'admin_new_report',
      'New Report Submitted',
      `New ${report.category} report from ${report.reporter?.name || 'Unknown'}`,
      {
        priority: report.priority === 'urgent' ? 'urgent' : 'high',
        sourceUserId: report.reporter?._id,
        relatedEntityId: report._id,
        relatedEntityType: 'Report',
        actionUrl: `/admin/reports/${report._id}`,
        metadata: {
          reportId: report._id.toString(),
          reportReason: report.reason,
          reportCategory: report.category,
          reporterId: report.reporter?._id?.toString(),
          reporterName: report.reporter?.name,
          reportedUserId: report.reportedUser?._id?.toString(),
          reportedUserName: report.reportedUser?.name
        }
      }
    );
  }
  
  // User banned notification
  static async notifyUserBanned(user, bannedBy, reason) {
    return this.sendToAllAdmins(
      'admin_user_banned',
      'User Banned',
      `${user.name} (${user.email}) has been banned`,
      {
        priority: 'high',
        sourceUserId: bannedBy._id,
        relatedEntityId: user._id,
        relatedEntityType: 'User',
        actionUrl: `/admin/users/${user._id}`,
        metadata: {
          userId: user._id.toString(),
          userName: user.name,
          userEmail: user.email,
          banReason: reason,
          bannedById: bannedBy._id.toString(),
          bannedByName: bannedBy.name,
          bannedAt: new Date()
        }
      }
    );
  }
  
  // User suspended notification
  static async notifyUserSuspended(user, suspendedBy, reason, duration) {
    return this.sendToAllAdmins(
      'admin_user_suspended',
      'User Suspended',
      `${user.name} suspended for ${duration} days`,
      {
        priority: 'medium',
        sourceUserId: suspendedBy._id,
        relatedEntityId: user._id,
        relatedEntityType: 'User',
        actionUrl: `/admin/users/${user._id}`,
        metadata: {
          userId: user._id.toString(),
          userName: user.name,
          userEmail: user.email,
          suspensionReason: reason,
          durationDays: duration,
          suspendedById: suspendedBy._id.toString(),
          suspendedByName: suspendedBy.name,
          suspendedAt: new Date()
        }
      }
    );
  }
  
  // Report resolved notification
  static async notifyReportResolved(report, resolvedBy) {
    return this.sendToAllAdmins(
      'admin_report_resolved',
      'Report Resolved',
      `${report.category} report resolved by ${resolvedBy.name}`,
      {
        priority: 'low',
        sourceUserId: resolvedBy._id,
        relatedEntityId: report._id,
        relatedEntityType: 'Report',
        actionUrl: `/admin/reports/${report._id}`,
        metadata: {
          reportId: report._id.toString(),
          reportReason: report.reason,
          resolvedById: resolvedBy._id.toString(),
          resolvedByName: resolvedBy.name,
          resolvedAt: new Date()
        }
      }
    );
  }
  
  // System alert notification
  static async notifySystemAlert(title, message, priority = 'high') {
    return this.sendToAllAdmins(
      'admin_system_alert',
      title,
      message,
      {
        priority,
        actionUrl: '/admin/dashboard',
        metadata: {
          alertType: 'system',
          timestamp: new Date()
        }
      }
    );
  }
}

module.exports = AdminNotificationService;