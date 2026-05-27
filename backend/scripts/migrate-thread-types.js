const mongoose = require('mongoose');
require('dotenv').config();
const DiscussionThread = require('../models/DiscussionThread');

const migrate = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/litlink', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');

    const result = await DiscussionThread.updateMany(
      { type: 'discussion' },
      { $set: { type: 'book' } }
    );

    console.log(`✅ Migrated ${result.modifiedCount} threads from "discussion" to "book"`);
    
    // Also ensure all threads have isCommunityPick field
    const result2 = await DiscussionThread.updateMany(
      { isCommunityPick: { $exists: false } },
      { $set: { isCommunityPick: false } }
    );
    console.log(`✅ Initialized isCommunityPick for ${result2.modifiedCount} threads`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
};

migrate();
