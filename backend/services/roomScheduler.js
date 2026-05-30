const VoiceRoom = require('../models/VoiceRoom');
const Notification = require('../models/Notification');
const User = require('../models/User');
const UserSettings = require('../models/UserSettings');
const UNS = require('./UserNotificationService');

async function _checkNotifSetting(userId, key) {
  try {
    const settings = await UserSettings.findOne({ userId }).lean();
    return settings?.notifications?.[key] !== false;
  } catch {
    return true;
  }
}

let intervalId = null;

/**
 * Checks scheduled voice rooms and updates their lifecycle / sends notifications.
 */
const checkScheduledRooms = async () => {
  try {
    const now = new Date();

    // ─────────────────────────────────────────────────────────────────────────
    // 1. Host 2-Minute Pre-Start Notification
    // ─────────────────────────────────────────────────────────────────────────
    // Find rooms scheduled to start in <= 2 minutes (and > now) that haven't been notified.
    const twoMinsFromNow = new Date(now.getTime() + 2 * 60 * 1000);
    const roomsToNotify = await VoiceRoom.find({
      status: 'scheduled',
      scheduledFor: { $lte: twoMinsFromNow, $gt: now },
      preStartNotified: { $ne: true }
    });

    for (const room of roomsToNotify) {
      try {
        await Notification.createUserNotification(
          room.hostId,
          'voice_room_prestart',
          'Room Starting Soon 🎙️',
          `Your scheduled voice room "${room.name}" will start in 2 minutes.`,
          {
            priority: 'high',
            actionUrl: `/voice-rooms/${room._id}`,
            relatedEntityId: room._id,
            relatedEntityType: 'VoiceRoom'
          }
        );

        room.preStartNotified = true;
        await room.save();
        console.log(`[Scheduler] 2-min warning sent to host ${room.hostId} for room "${room.name}" (${room._id})`);
      } catch (err) {
        console.error(`[Scheduler] Error notifying host for room ${room._id}:`, err.message);
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. Automatic Room Start
    // ─────────────────────────────────────────────────────────────────────────
    // Find rooms whose start time has arrived (scheduledFor <= now)
    // within a 15-minute window.
    const fifteenMinsAgo = new Date(now.getTime() - 15 * 60 * 1000);
    const roomsToStart = await VoiceRoom.find({
      status: 'scheduled',
      scheduledFor: { $lte: now, $gte: fifteenMinsAgo }
    });

    for (const room of roomsToStart) {
      try {
        // Transition room to live
        room.status = 'live';
        // Reset createdAt to the actual start time so that ending calculations (duration) work correctly
        room.createdAt = new Date();
        await room.save();

        console.log(`[Scheduler] Automatically started room "${room.name}" (${room._id})`);

        // Emit Socket.IO broadcast to notify lobby clients
        if (global.io) {
          global.io.emit('room-created', {
            _id: room._id,
            name: room.name,
            genre: room.genre,
            description: room.description,
            hostId: { _id: room.hostId, name: room.hostName },
            hostName: room.hostName,
            status: room.status,
            participantCount: 0
          });
        }

        // Notify followers of host that they started a room
        try {
          const hostUser = await User.findById(room.hostId);
          if (hostUser) {
            await UNS.onVoiceRoomStarted(hostUser, room);
          }
        } catch (unsErr) {
          console.error(`[Scheduler] Error triggering UNS.onVoiceRoomStarted:`, unsErr.message);
        }

        // Notify users who requested reminders (respect their roomReminders preference)
        if (room.reminderUsers && room.reminderUsers.length > 0) {
          const prefResults = await Promise.allSettled(
            room.reminderUsers.map(id => _checkNotifSetting(id, 'roomReminders'))
          );
          const allowedIds = room.reminderUsers.filter((_, i) => {
            const r = prefResults[i];
            return r.status === 'fulfilled' && r.value !== false;
          });
          for (const userId of allowedIds) {
            try {
              await Notification.createUserNotification(
                userId,
                'voice_room_reminder',
                'Voice Room Started 🎙️',
                `The scheduled voice room "${room.name}" you set a reminder for has started.`,
                {
                  priority: 'medium',
                  actionUrl: `/voice-rooms/${room._id}`,
                  relatedEntityId: room._id,
                  relatedEntityType: 'VoiceRoom'
                }
              );
              console.log(`[Scheduler] Sent start reminder to user ${userId} for room ${room._id}`);
            } catch (notifErr) {
              console.error(`[Scheduler] Error sending reminder notification to user ${userId}:`, notifErr.message);
            }
          }
        }
      } catch (err) {
        console.error(`[Scheduler] Error starting room ${room._id}:`, err.message);
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. Cleanup: Missed Rooms
    // ─────────────────────────────────────────────────────────────────────────
    // Find rooms that passed their start time by more than 15 minutes and were never activated.
    const roomsMissed = await VoiceRoom.find({
      status: 'scheduled',
      scheduledFor: { $lt: fifteenMinsAgo }
    });

    for (const room of roomsMissed) {
      try {
        room.status = 'missed';
        await room.save();
        console.log(`[Scheduler] Marked room "${room.name}" (${room._id}) as missed`);
      } catch (err) {
        console.error(`[Scheduler] Error marking room ${room._id} as missed:`, err.message);
      }
    }

  } catch (err) {
    console.error('[Scheduler] Error in checkScheduledRooms:', err.message);
  }
};

/**
 * Starts the scheduling loop.
 */
const startScheduler = () => {
  if (intervalId) return;
  // Runs every 10 seconds to catch precise 2-min alerts and exactly on-time room starts
  intervalId = setInterval(checkScheduledRooms, 10000);
  console.log('⏰ Room Scheduler service initialized');
};

/**
 * Stops the scheduling loop.
 */
const stopScheduler = () => {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('⏰ Room Scheduler service stopped');
  }
};

module.exports = {
  startScheduler,
  stopScheduler,
  checkScheduledRooms
};
