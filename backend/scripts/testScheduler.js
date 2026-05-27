require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const VoiceRoom = require('../models/VoiceRoom');
const Notification = require('../models/Notification');
const roomScheduler = require('../services/roomScheduler');

async function test() {
  try {
    console.log('1. Connecting to DB...');
    mongoose.set('autoIndex', false);
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/litlink');
    console.log('Database connected.');

    // Clean up any old test data
    await User.deleteMany({ email: /test_scheduler/ });
    await VoiceRoom.deleteMany({ name: 'Test Scheduled Room' });

    console.log('2. Creating test users...');
    const host = await User.create({
      name: 'Host User',
      email: 'test_scheduler_host@test.com',
      password: 'password123',
      isVerified: true
    });

    const reminderUser = await User.create({
      name: 'Reminder User',
      email: 'test_scheduler_rem@test.com',
      password: 'password123',
      isVerified: true
    });

    // Clean notifications for these users
    await Notification.deleteMany({ userId: { $in: [host._id, reminderUser._id] } });

    console.log('3. Creating voice room scheduled for 1m 55s in future (triggers 2-min warning)...');
    const scheduledTime = new Date(Date.now() + 115 * 1000); 
    const room = new VoiceRoom({
      name: 'Test Scheduled Room',
      genre: 'Other',
      hostId: host._id,
      hostName: host.name,
      status: 'scheduled',
      scheduledFor: scheduledTime,
      reminderUsers: [reminderUser._id],
      preStartNotified: false
    });
    await room.save();

    console.log('4. Invoking scheduler tick manually...');
    await roomScheduler.checkScheduledRooms();

    // Verify host notification
    const hostNotifications = await Notification.find({ userId: host._id });
    console.log(`Host Notification Count: ${hostNotifications.length}`);
    if (hostNotifications.length === 1 && hostNotifications[0].type === 'voice_room_prestart') {
      console.log('✅ 2-minute pre-start notification verified!');
    } else {
      throw new Error('❌ 2-minute pre-start notification failed');
    }

    // Verify room preStartNotified state is true
    const updatedRoom = await VoiceRoom.findById(room._id);
    if (updatedRoom.preStartNotified) {
      console.log('✅ room.preStartNotified field set to true!');
    } else {
      throw new Error('❌ room.preStartNotified field remains false');
    }

    console.log('5. Advancing room schedule to past (time to start)...');
    updatedRoom.scheduledFor = new Date(Date.now() - 5 * 1000); // 5 seconds in past
    await updatedRoom.save();

    console.log('6. Invoking scheduler tick again...');
    await roomScheduler.checkScheduledRooms();

    const startedRoom = await VoiceRoom.findById(room._id);
    if (startedRoom.status === 'live') {
      console.log('✅ Room successfully auto-started to "live" status!');
    } else {
      throw new Error(`❌ Room auto-start failed, status is: ${startedRoom.status}`);
    }

    // Verify reminder notification
    const reminderNotifications = await Notification.find({ userId: reminderUser._id });
    console.log(`Reminder Notification Count: ${reminderNotifications.length}`);
    if (reminderNotifications.length === 1 && reminderNotifications[0].type === 'voice_room_reminder') {
      console.log('✅ Start reminder notification verified!');
    } else {
      throw new Error('❌ Start reminder notification failed');
    }

    console.log('7. Advancing room schedule to long past (time to mark missed)...');
    startedRoom.status = 'scheduled';
    startedRoom.scheduledFor = new Date(Date.now() - 20 * 60 * 1000); // 20 mins in past
    await startedRoom.save();

    console.log('8. Invoking scheduler tick again...');
    await roomScheduler.checkScheduledRooms();

    const missedRoom = await VoiceRoom.findById(room._id);
    if (missedRoom.status === 'missed') {
      console.log('✅ Room successfully marked as "missed"!');
    } else {
      throw new Error(`❌ Room cleanup failed, status is: ${missedRoom.status}`);
    }

    console.log('\n🌟 ALL TESTS PASSED SUCCESSFULLY! 🌟');
  } catch (err) {
    console.error('❌ Test Failed:', err);
    process.exit(1);
  } finally {
    // Clean up test data
    try {
      await User.deleteMany({ email: /test_scheduler/ });
      await VoiceRoom.deleteMany({ name: 'Test Scheduled Room' });
    } catch (cleanErr) {
      console.error('Error during cleanup:', cleanErr.message);
    }
    await mongoose.disconnect();
    console.log('Disconnected from DB.');
    process.exit(0);
  }
}

test();
