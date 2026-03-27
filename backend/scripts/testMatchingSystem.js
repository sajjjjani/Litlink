const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

// Import models and services
const User = require('../models/User');
const matchService = require('../services/matchService');

const testMatchingSystem = async () => {
  try {
    console.log('\n' + '='.repeat(70));
    console.log('🧪 TESTING MATCHING SYSTEM');
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
    console.log(`📊 Found ${users.length} users\n`);
    
    if (users.length < 2) {
      console.log('❌ Need at least 2 users to test matching');
      console.log('💡 Run: npm run seed:users to create test users\n');
      return;
    }
    
    // Show all users
    console.log('📋 All Users:');
    console.log('-'.repeat(70));
    users.forEach((user, index) => {
      console.log(`${index + 1}. ${user.name} (${user.email})`);
      console.log(`   Genres: ${user.favoriteGenres?.join(', ') || 'None'}`);
      console.log(`   Books: ${user.favoriteBooks?.slice(0, 2).join(', ') || 'None'}`);
      console.log(`   Reading: ${user.readingHabit || 'Not set'}`);
      console.log('');
    });
    
    // Test each user's matches
    for (const user of users) {
      console.log('='.repeat(70));
      console.log(`📖 Testing matches for: ${user.name} (${user.email})`);
      console.log('='.repeat(70));
      
      console.log('📚 Your Preferences:');
      console.log(`   Genres: ${user.favoriteGenres?.join(', ') || 'None'}`);
      console.log(`   Authors: ${user.favoriteAuthors?.join(', ') || 'None'}`);
      console.log(`   Books: ${user.favoriteBooks?.join(', ') || 'None'}`);
      console.log(`   Reading Habit: ${user.readingHabit || 'Not set'}`);
      console.log(`   Reading Goal: ${user.readingGoal || 'Not set'}`);
      console.log('');
      
      // Get top 5 matches
      const topMatches = matchService.getTopMatches(user, users, 5);
      
      if (topMatches.length === 0) {
        console.log('   ❌ No matches found\n');
      } else {
        console.log('🏆 Top Matches:');
        console.log('-'.repeat(70));
        
        topMatches.forEach((match, index) => {
          console.log(`${index + 1}. ${match.name}`);
          console.log(`   Match Score: ${match.matchPercentage}% (${match.score} points out of ${match.maxPossibleScore || 'N/A'})`);
          console.log(`   Location: ${match.location || 'Not specified'}`);
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
          if (match.details.readingHabitMatch) {
            console.log(`     ⏰ Same reading habit: ${user.readingHabit}`);
          }
          if (match.details.formatMatch > 0) {
            console.log(`     📱 Formats: ${match.details.formatMatch} matching formats`);
          }
          console.log('');
        });
      }
      
      // Get match statistics
      const stats = matchService.getMatchStats(user, users);
      console.log('📊 Your Match Statistics:');
      console.log(`   Total Matches: ${stats.totalMatches}`);
      console.log(`   Average Compatibility: ${stats.averageCompatibility}%`);
      if (stats.topGenre) console.log(`   Most Common Genre: ${stats.topGenre}`);
      if (stats.topAuthor) console.log(`   Most Common Author: ${stats.topAuthor}`);
      if (stats.topBook) console.log(`   Most Common Book: ${stats.topBook}`);
      console.log(`   Match Distribution:`);
      console.log(`     🔥 Excellent (70%+): ${stats.matchDistribution.excellent}`);
      console.log(`     📚 Good (50-69%): ${stats.matchDistribution.good}`);
      console.log(`     🤝 Moderate (30-49%): ${stats.matchDistribution.moderate}`);
      console.log(`     🌱 Low (<30%): ${stats.matchDistribution.low}`);
      console.log('');
    }
    
    // Get suggestions for each user
    console.log('='.repeat(70));
    console.log('💡 MATCH SUGGESTIONS');
    console.log('='.repeat(70) + '\n');
    
    for (const user of users) {
      const suggestions = matchService.getMatchSuggestions(user, users, 3);
      
      if (suggestions.length > 0) {
        console.log(`📌 For ${user.name}:`);
        suggestions.forEach((suggestion, idx) => {
          console.log(`   ${idx + 1}. ${suggestion.name} (${suggestion.matchPercentage}% match)`);
          if (suggestion.details.bookMatch > 0) {
            console.log(`      Shared book: ${suggestion.details.bookList[0]}`);
          } else if (suggestion.details.authorMatch > 0) {
            console.log(`      Shared author: ${suggestion.details.authorList[0]}`);
          } else if (suggestion.details.genreMatch > 0) {
            console.log(`      Shared genre: ${suggestion.details.genreList[0]}`);
          }
        });
        console.log('');
      }
    }
    
    console.log('='.repeat(70));
    console.log('✨ Matching system test completed!');
    console.log('='.repeat(70) + '\n');
    
  } catch (error) {
    console.error('❌ Error testing matching system:', error);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB\n');
  }
};

// Run the test
testMatchingSystem();