const Notification = require('../models/Notification');

class AdminNotificationService {
    static async sendToAdmin(userId, type, title, message, options = {}) {
        try {
            const notification = new Notification({
                userId,
                type: `admin_${type}`,
                title,
                message,
                priority: options.priority || 'medium',
                actionUrl: options.actionUrl || null,
                metadata: options.metadata || {},
                sourceUserId: options.sourceUserId || null,
                read: false
            });
            
            await notification.save();
            
            // Emit via WebSocket if available
            const io = global.io;
            if (io && typeof io.sendToUser === 'function') {
                io.sendToUser(userId.toString(), {
                    type: 'admin-notification',
                    notificationType: `admin_${type}`,
                    title,
                    message,
                    timestamp: new Date(),
                    priority: options.priority || 'medium',
                    actionUrl: options.actionUrl,
                    metadata: options.metadata
                });
            }
            
            return notification;
        } catch (error) {
            console.error('Error sending admin notification:', error);
            return null;
        }
    }
    
    static async sendToAllAdmins(type, title, message, options = {}) {
        try {
            const User = require('../models/User');
            const admins = await User.find({ isAdmin: true });
            
            const notifications = [];
            for (const admin of admins) {
                const notification = new Notification({
                    userId: admin._id,
                    type: `admin_${type}`,
                    title,
                    message,
                    priority: options.priority || 'medium',
                    actionUrl: options.actionUrl || null,
                    metadata: options.metadata || {},
                    sourceUserId: options.sourceUserId || null,
                    read: false
                });
                await notification.save();
                notifications.push(notification);
            }
            
            // Emit to all connected admins via WebSocket
            const io = global.io;
            if (io && typeof io.broadcastToAdmins === 'function') {
                io.broadcastToAdmins({
                    type: 'admin-notification',
                    notificationType: `admin_${type}`,
                    title,
                    message,
                    timestamp: new Date(),
                    priority: options.priority || 'medium',
                    actionUrl: options.actionUrl,
                    metadata: options.metadata
                });
            }
            
            return notifications;
        } catch (error) {
            console.error('Error sending to all admins:', error);
            return [];
        }
    }
    
    static async notifyUserBanned(user, admin, reason) {
        return this.sendToAllAdmins(
            'user_banned',
            'User Banned',
            `${user.name} (${user.email}) has been banned by ${admin.name}`,
            {
                priority: 'high',
                sourceUserId: admin._id,
                relatedEntityId: user._id,
                relatedEntityType: 'User',
                actionUrl: `/admin/users/${user._id}`,
                metadata: {
                    userId: user._id.toString(),
                    userName: user.name,
                    userEmail: user.email,
                    bannedById: admin._id.toString(),
                    bannedByName: admin.name,
                    reason: reason,
                    bannedAt: new Date()
                }
            }
        );
    }
    
    static async notifyUserSuspended(user, admin, reason, duration) {
        return this.sendToAllAdmins(
            'user_suspended',
            'User Suspended',
            `${user.name} (${user.email}) has been suspended for ${duration} days by ${admin.name}`,
            {
                priority: 'medium',
                sourceUserId: admin._id,
                relatedEntityId: user._id,
                relatedEntityType: 'User',
                actionUrl: `/admin/users/${user._id}`,
                metadata: {
                    userId: user._id.toString(),
                    userName: user.name,
                    userEmail: user.email,
                    suspendedById: admin._id.toString(),
                    suspendedByName: admin.name,
                    reason: reason,
                    duration: duration,
                    suspendedAt: new Date()
                }
            }
        );
    }
    
    static async notifyReportResolved(report, admin) {
        return this.sendToAllAdmins(
            'report_resolved',
            'Report Resolved',
            `${report.category} report resolved by ${admin.name}`,
            {
                priority: 'medium',
                sourceUserId: admin._id,
                relatedEntityId: report._id,
                relatedEntityType: 'Report',
                actionUrl: `/admin/reports/${report._id}`,
                metadata: {
                    reportId: report._id.toString(),
                    reportReason: report.reason,
                    reportCategory: report.category,
                    resolvedById: admin._id.toString(),
                    resolvedByName: admin.name,
                    resolvedAt: new Date()
                }
            }
        );
    }
    
    static async notifyNewReport(report) {
        return this.sendToAllAdmins(
            'new_report',
            'New Report Submitted',
            `New ${report.category} report from ${report.reporter?.name || 'Anonymous'}`,
            {
                priority: report.priority || 'medium',
                sourceUserId: report.reporter?._id,
                relatedEntityId: report._id,
                relatedEntityType: 'Report',
                actionUrl: `/admin/reports/${report._id}`,
                metadata: {
                    reportId: report._id.toString(),
                    reportReason: report.reason,
                    reportCategory: report.category,
                    reportedUserId: report.reportedUser?._id?.toString(),
                    reportedUserName: report.reportedUser?.name,
                    reportedAt: report.createdAt
                }
            }
        );
    }
    
    static async notifyNewUser(user) {
        return this.sendToAllAdmins(
            'new_user',
            'New User Registered',
            `New user ${user.name} (${user.email}) just joined Litlink`,
            {
                priority: 'low',
                sourceUserId: user._id,
                relatedEntityId: user._id,
                relatedEntityType: 'User',
                actionUrl: `/admin/users/${user._id}`,
                metadata: {
                    userId: user._id.toString(),
                    userName: user.name,
                    userEmail: user.email,
                    joinedAt: user.createdAt
                }
            }
        );
    }
}

module.exports = AdminNotificationService;