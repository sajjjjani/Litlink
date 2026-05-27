const VoiceRoom = require('../models/VoiceRoom');
const Notification = require('../models/Notification');
const User = require('../models/User');
const UNS = require('./UserNotificationService');

let intervalId = null;

/**
 * Checks scheduled voice rooms and updates their lifecycle / sends notifications.
 */
const checkScheduledRooms = async () => {
  try {
    const now = new Date();

    // ─────────────────────────────────────────────────────────────────────────
    // 1. Host & Reminder 2-Minute Pre-Start Notification
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
        await UNS.onVoiceRoomAboutToStart(room);
        room.preStartNotified = true;
        await room.save();
        console.log(`[Scheduler] 2-min warning sent for room "${room.name}" (${room._id})`);
      } catch (err) {
        console.error(`[Scheduler] Error notifying for room ${room._id}:`, err.message);
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. Auto-Cancel Logic
    // ─────────────────────────────────────────────────────────────────────────
    // If host has NOT started the room within 5 minutes after scheduled time
    const fiveMinsAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const roomsToCancel = await VoiceRoom.find({
      status: 'scheduled',
      scheduledFor: { $lt: fiveMinsAgo }
    });

    for (const room of roomsToCancel) {
      try {
        room.status = 'cancelled';
        await room.save();

        await UNS.onScheduledRoomCancelled(room);

        console.log(`[Scheduler] Auto-cancelled room "${room.name}" (${room._id})`);
      } catch (err) {
        console.error(`[Scheduler] Error auto-cancelling room ${room._id}:`, err.message);
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
