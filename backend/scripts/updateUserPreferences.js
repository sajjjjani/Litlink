const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load env from parent directory
dotenv.config({ path: path.join(__dirname, '../../.env') });

const User = require('../models/User');

const updateUserPreferences = async () => {
  try {
    console.log('\n' + '='.repeat(70));
    console.log('🔄 UPDATING USER PREFERENCES');
    console.log('='.repeat(70) + '\n');
    
    // Connect to MongoDB
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/litlink';
    console.log(`Connecting to MongoDB: ${mongoURI}`);
    
    await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB\n');
    
    const users = await User.find({});
    console.log(`📊 Found ${users.length} users\n`);
    
    let updatedCount = 0;
    let skippedCount = 0;
    
    for (const user of users) {
      let needsUpdate = false;
      const updates = {};
      
      if (!user.favoriteGenres || user.favoriteGenres.length === 0) {
        updates.favoriteGenres = ["Fantasy", "Mystery"];
        needsUpdate = true;
      }
      
      if (!user.favoriteAuthors || user.favoriteAuthors.length === 0) {
        updates.favoriteAuthors = ["J.K. Rowling", "Agatha Christie"];
        needsUpdate = true;
      }
      
      if (!user.favoriteBooks || user.favoriteBooks.length === 0) {
        updates.favoriteBooks = ["Harry Potter", "Murder on the Orient Express"];
        needsUpdate = true;
      }
      
      if (!user.readingHabit) {
        updates.readingHabit = "Casual Reader";
        needsUpdate = true;
      }
      
      if (!user.preferredFormats || user.preferredFormats.length === 0) {
        updates.preferredFormats = ["Physical", "E-book"];
        needsUpdate = true;
      }
      
      if (needsUpdate) {
        await User.findByIdAndUpdate(user._id, { $set: updates });
        updatedCount++;
        console.log(`✅ Updated: ${user.name} (${user.email})`);
        console.log(`   Added: Genres, Authors, Books, Reading Habit, Formats`);
      } else {
        skippedCount++;
        console.log(`⏭️  Skipped: ${user.name} (already has preferences)`);
      }
    }
    
    console.log('\n' + '='.repeat(70));
    console.log('🎉 Update completed!');
    console.log(`   Updated: ${updatedCount} users`);
    console.log(`   Skipped: ${skippedCount} users`);
    console.log('='.repeat(70) + '\n');
    
  } catch (error) {
    console.error('❌ Error updating preferences:', error);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB\n');
  }
};

updateUserPreferences();