const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  reporter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  reportedUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reportedItemType: {
    type: String,
    enum: ['user', 'post', 'chat', 'profile', 'comment', 'voice_room'],
    required: true
  },
  reportedItemId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  reason: {
    type: String,
    required: true
  },
  category: {
    type: String,
    enum: [
      'inappropriate_content',
      'harassment',
      'hate_speech',
      'spam',
      'fake_account',
      'impersonation',
      'privacy_violation',
      'copyright',
      'other'
    ],
    required: true
  },
  description: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['pending', 'reviewing', 'resolved', 'dismissed', 'escalated'],
    default: 'pending'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  resolution: {
    type: String,
    default: ''
  },
  resolutionNotes: {
    type: String,
    default: ''
  },
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  resolvedAt: {
    type: Date,
    default: null
  },
  evidence: [{
    type: {
      type: String,
      enum: ['text', 'image', 'link', 'screenshot']
    },
    content: String
  }],
  reviewedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Import admin notification service
const AdminNotificationService = require('../services/adminNotificationService');

// Post-save hook for new reports
reportSchema.post('save', async function(doc, next) {
  try {
    if (doc.wasNew) {
      console.log(`📋 New report created: ${doc.reason} (${doc.category})`);
      
      // Populate reporter and reportedUser for notification
      const populatedReport = await mongoose.model('Report')
        .findById(doc._id)
        .populate('reporter', 'name email profilePicture')
        .populate('reportedUser', 'name email profilePicture');
      
      // Create database notification
      await AdminNotificationService.notifyNewReport(populatedReport);
      
      // Emit WebSocket event to all connected admins
      try {
        const io = global.io;
        if (io) {
          const notificationData = {
            type: 'admin-notification',
            notificationType: 'admin_new_report',
            title: 'New Report Submitted',
            message: `New ${doc.category} report: ${doc.reason.substring(0, 50)}${doc.reason.length > 50 ? '...' : ''}`,
            timestamp: new Date(),
            priority: doc.priority === 'urgent' ? 'urgent' : 'high',
            metadata: {
              reportId: doc._id.toString(),
              reportCategory: doc.category,
              reportReason: doc.reason,
              reportedItemType: doc.reportedItemType
            }
          };
          
          // Add reporter info if available
          if (populatedReport.reporter) {
            notificationData.metadata.reporterId = populatedReport.reporter._id.toString();
            notificationData.metadata.reporterName = populatedReport.reporter.name;
          }
          
          // Add reported user info if available
          if (populatedReport.reportedUser) {
            notificationData.metadata.reportedUserId = populatedReport.reportedUser._id.toString();
            notificationData.metadata.reportedUserName = populatedReport.reportedUser.name;
          }
          
          io.broadcastToAdmins(notificationData);
          console.log(`📢 WebSocket notification sent for new report: ${doc._id}`);
        } else {
          console.log('⚠️ WebSocket server not available for report notification');
        }
      } catch (socketError) {
        console.error('WebSocket error in report post-save:', socketError);
      }
    }
  } catch (error) {
    console.error('Error in report post-save notification:', error);
  }
  next();
});

// Post-update hook for report resolution
reportSchema.post('findOneAndUpdate', async function(doc, next) {
  try {
    if (doc) {
      const update = this.getUpdate();
      
      if (update.$set) {
        // Check if report was just resolved
        if (update.$set.status === 'resolved' && doc.status !== 'resolved') {
          console.log(`✅ Report resolved: ${doc._id}`);
          
          // Emit WebSocket event
          try {
            const io = global.io;
            if (io) {
              io.broadcastToAdmins({
                type: 'admin-notification',
                notificationType: 'admin_report_resolved',
                title: 'Report Resolved',
                message: `${doc.category} report has been resolved`,
                timestamp: new Date(),
                priority: 'low',
                metadata: {
                  reportId: doc._id.toString(),
                  reportCategory: doc.category,
                  reportReason: doc.reason
                }
              });
              console.log(`📢 WebSocket notification sent for resolved report: ${doc._id}`);
            }
          } catch (socketError) {
            console.error('WebSocket error in report resolution update:', socketError);
          }
        }
        
        // Check if report status changed to reviewing
        if (update.$set.status === 'reviewing' && doc.status !== 'reviewing') {
          console.log(`🔍 Report being reviewed: ${doc._id}`);
          
          // Emit WebSocket event
          try {
            const io = global.io;
            if (io) {
              io.broadcastToAdmins({
                type: 'admin-notification',
                notificationType: 'admin_report_reviewing',
                title: 'Report Under Review',
                message: `${doc.category} report is being reviewed`,
                timestamp: new Date(),
                priority: 'medium',
                metadata: {
                  reportId: doc._id.toString(),
                  reportCategory: doc.category
                }
              });
            }
          } catch (socketError) {
            console.error('WebSocket error in report review update:', socketError);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error in report update notification:', error);
  }
  next();
});

// Add indexes
reportSchema.index({ status: 1 });
reportSchema.index({ reportedUser: 1 });
reportSchema.index({ reporter: 1 });
reportSchema.index({ reportedItemType: 1 });
reportSchema.index({ priority: 1 });
reportSchema.index({ category: 1 });
reportSchema.index({ createdAt: -1 });
reportSchema.index({ updatedAt: -1 });

const Report = mongoose.model('Report', reportSchema);

module.exports = Report;