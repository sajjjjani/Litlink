const mongoose = require('mongoose');
const Circle = require('./models/Circle');
const DiscussionThread = require('./models/DiscussionThread');
require('dotenv').config();

// The circle IDs that were previously seeded as demo data
const DEMO_CIRCLE_IDS = [
  'fantasy-readers',
  'mystery-detectives',
  'scifi-enthusiasts',
  'classics-club',
  'romance-readers',
  'poetry-corner',
  'historical-fiction',
  'thriller-addicts'
];

async function cleanupDemoCircles() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/litlink');
    console.log('Connected to MongoDB');

    const demoCircles = await Circle.find({ circleId: { $in: DEMO_CIRCLE_IDS } });

    if (demoCircles.length === 0) {
      console.log('✅ No demo circles found — database is already clean.');
      process.exit(0);
    }

    console.log(`Found ${demoCircles.length} demo circle(s) to remove:`);
    demoCircles.forEach(c => console.log(`   - ${c.circleId} (${c.name})`));

    // Delete threads that belonged to these circles
    const circleObjectIds = demoCircles.map(c => c._id);
    const threadResult = await DiscussionThread.deleteMany({ circleId: { $in: circleObjectIds } });
    console.log(`\nDeleted ${threadResult.deletedCount} thread(s) from demo circles.`);

    // Delete the circles
    const circleResult = await Circle.deleteMany({ circleId: { $in: DEMO_CIRCLE_IDS } });
    console.log(`Deleted ${circleResult.deletedCount} demo circle(s).`);

    console.log('\n✅ Cleanup complete. Circles are now user-created only.');
    process.exit(0);
  } catch (error) {
    console.error('Error during cleanup:', error);
    process.exit(1);
  }
}

cleanupDemoCircles();