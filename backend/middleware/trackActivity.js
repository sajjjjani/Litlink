// middleware/trackActivity.js
const UserActivity = require('../models/UserActivity');

// Track user login activity
const trackLogin = async (req, res, next) => {
  const originalJson = res.json;
  
  res.json = function(data) {
    if (data && data.success && data.token && req.userId) {
      // Track login asynchronously
      trackUserActivity(req.userId, 'login').catch(console.error);
    }
    return originalJson.call(this, data);
  };
  
  next();
};

// Track user message activity
const trackMessage = async (userId) => {
  await trackUserActivity(userId, 'message');
};

// Track discussion creation
const trackDiscussion = async (userId) => {
  await trackUserActivity(userId, 'discussion_created');
};

// Track discussion reply
const trackReply = async (userId) => {
  await trackUserActivity(userId, 'discussion_reply');
};

// Track voice room join
const trackVoiceJoin = async (userId, duration = 0) => {
  await trackUserActivity(userId, 'voice_join', { duration });
};

// Track match
const trackMatch = async (userId) => {
  await trackUserActivity(userId, 'match');
};

// Track book added
const trackBookAdded = async (userId) => {
  await trackUserActivity(userId, 'book_added');
};

// Generic activity tracking function
async function trackUserActivity(userId, activityType, metadata = {}) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let activity = await UserActivity.findOne({
      userId: userId,
      date: today
    });
    
    if (!activity) {
      activity = new UserActivity({
        userId: userId,
        date: today
      });
    }
    
    // Increment appropriate counter
    switch(activityType) {
      case 'login':
        activity.loginCount += 1;
        break;
      case 'message':
        activity.messagesSent += 1;
        break;
      case 'discussion_created':
        activity.discussionsCreated += 1;
        break;
      case 'discussion_reply':
        activity.discussionReplies += 1;
        break;
      case 'voice_join':
        activity.voiceRoomJoined += 1;
        if (metadata.duration) {
          activity.voiceRoomDuration += metadata.duration;
        }
        break;
      case 'match':
        activity.matchesMade += 1;
        break;
      case 'book_added':
        activity.booksAdded += 1;
        break;
    }
    
    await activity.save();
  } catch (error) {
    console.error('Error tracking user activity:', error);
  }
}

module.exports = {
  trackLogin,
  trackMessage,
  trackDiscussion,
  trackReply,
  trackVoiceJoin,
  trackMatch,
  trackBookAdded,
  trackUserActivity
};