const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load env from parent directory
dotenv.config({ path: path.join(__dirname, '../../.env') });

const User = require('../models/User');
const matchService = require('../services/matchService');

const testMatching = async () => {
  try {
    console.log('\n' + '='.repeat(70));
    console.log('📚 LITLINK MATCHING SYSTEM TEST');
    console.log('='.repeat(70) + '\n');
    
    // Connect to MongoDB
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/litlink';
    console.log(`Connecting to MongoDB: ${mongoURI}`);
    
    await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB\n');
    
    // Get all users
    const users = await User.find({}).select('-password');
    console.log(`📊 Found ${users.length} users in database\n`);
    
    if (users.length < 2) {
      console.log('❌ Need at least 2 users to test matching');
      console.log('💡 Run: npm run seed:users to create test users\n');
      return;
    }
    
    // Filter users with preferences
    const usersWithPrefs = users.filter(u => 
      (u.favoriteGenres && u.favoriteGenres.length > 0) ||
      (u.favoriteBooks && u.favoriteBooks.length > 0)
    );
    
    if (usersWithPrefs.length === 0) {
      console.log('⚠️ No users with preferences found!');
      console.log('💡 Run: npm run update:preferences to add default preferences\n');
      return;
    }
    
    console.log(`📚 Found ${usersWithPrefs.length} users with preferences\n`);
    
    // Test matching for each user with preferences
    for (const user of usersWithPrefs.slice(0, 3)) { // Test first 3 users
      console.log('='.repeat(70));
      console.log(`📖 Testing matches for: ${user.name} (${user.email})`);
      console.log('='.repeat(70));
      console.log('📚 Preferences:');
      console.log(`   Genres: ${user.favoriteGenres?.join(', ') || 'None'}`);
      console.log(`   Authors: ${user.favoriteAuthors?.join(', ') || 'None'}`);
      console.log(`   Books: ${user.favoriteBooks?.join(', ') || 'None'}`);
      console.log(`   Reading Habit: ${user.readingHabit || 'Not set'}`);
      console.log('='.repeat(70));
      
      const topMatches = matchService.getTopMatches(user, users, 5);
      
      if (topMatches.length === 0) {
        console.log('   No matches found\n');
      } else {
        console.log('\n🏆 Top Matches:');
        console.log('-'.repeat(70));
        
        topMatches.forEach((match, index) => {
          console.log(`${index + 1}. ${match.name || match.username}`);
          console.log(`   Match Score: ${match.matchPercentage}% (${match.score} points)`);
          console.log(`   Common Interests:`);
          if (match.details.genreMatch > 0) {
            console.log(`     📚 Genres: ${match.details.genreList.join(', ')} (${match.details.genreMatch} matches)`);
          }
          if (match.details.authorMatch > 0) {
            console.log(`     ✍️ Authors: ${match.details.authorList.join(', ')} (${match.details.authorMatch} matches)`);
          }
          if (match.details.bookMatch > 0) {
            console.log(`     📖 Books: ${match.details.bookList.join(', ')} (${match.details.bookMatch} matches)`);
          }
          console.log('');
        });
      }
    }
    
    // Show summary of all users
    console.log('\n' + '='.repeat(70));
    console.log('📊 USER PREFERENCES SUMMARY');
    console.log('='.repeat(70));
    
    usersWithPrefs.forEach(user => {
      console.log(`\n${user.name}:`);
      console.log(`   Genres: ${user.favoriteGenres?.slice(0, 3).join(', ') || 'None'}`);
      console.log(`   Books: ${user.favoriteBooks?.slice(0, 3).join(', ') || 'None'}`);
    });
    
    console.log('\n' + '='.repeat(70));
    console.log('✨ Test completed!');
    console.log('='.repeat(70) + '\n');
    
  } catch (error) {
    console.error('❌ Error testing matching:', error);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB\n');
  }
};

// Run the test
testMatching();