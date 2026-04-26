const mongoose = require('mongoose');
const VoiceRoom = require('./backend/models/VoiceRoom');

async function backfill() {
    try {
        // Use a common local mongo URI if env is not loaded
        const uri = 'mongodb://localhost:27017/litlink'; 
        await mongoose.connect(uri);
        console.log('Connected to MongoDB');

        const VoiceRoomModel = mongoose.model('VoiceRoom');

        const rooms = await VoiceRoomModel.find({ 
            status: 'ended', 
            endedAt: { $ne: null }
        });

        console.log(`Found ${rooms.length} rooms in history`);

        let updated = 0;
        for (const room of rooms) {
            if (!room.duration || room.duration === 0) {
                const duration = Math.round((new Date(room.endedAt) - new Date(room.createdAt)) / 60000) || 0;
                await VoiceRoomModel.updateOne({ _id: room._id }, { $set: { duration: duration } });
                updated++;
            }
        }

        console.log(`Updated ${updated} rooms with durations`);
        process.exit(0);
    } catch (err) {
        console.error('Error during backfill:', err.message);
        process.exit(1);
    }
}

backfill();
