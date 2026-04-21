const mongoose = require('mongoose');
require('dotenv').config();
const FilterWord = require('./models/FilterWord');
const User = require('./models/User');

async function seedFilterWords() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/litlink');
    console.log('✅ Connected to MongoDB');
    
    const admin = await User.findOne({ isAdmin: true });
    if (!admin) {
      console.error('❌ No admin user found. Please create an admin first.');
      console.log('Run: node seed-admin.js');
      process.exit(1);
    }
    
    console.log(`📧 Using admin: ${admin.email}`);
    
    const defaultFilterWords = [
      { word: 'fuck', category: 'profanity', severity: 'high' },
      { word: 'shit', category: 'profanity', severity: 'medium' },
      { word: 'bitch', category: 'profanity', severity: 'medium' },
      { word: 'asshole', category: 'profanity', severity: 'high' },
      { word: 'damn', category: 'profanity', severity: 'low' },
      { word: 'cunt', category: 'profanity', severity: 'critical' },
      { word: 'dick', category: 'profanity', severity: 'medium' },
      { word: 'pussy', category: 'profanity', severity: 'high' },
      { word: 'whore', category: 'profanity', severity: 'high' },
      { word: 'slut', category: 'profanity', severity: 'high' },
      
      { word: 'nigger', category: 'hate_speech', severity: 'critical' },
      { word: 'faggot', category: 'hate_speech', severity: 'critical' },
      { word: 'retard', category: 'hate_speech', severity: 'high' },
      { word: 'tranny', category: 'hate_speech', severity: 'critical' },
      
      { word: 'kill yourself', category: 'harassment', severity: 'critical' },
      { word: 'kys', category: 'harassment', severity: 'critical' },
      { word: 'die', category: 'harassment', severity: 'high' },
      
      { word: 'buy followers', category: 'spam', severity: 'low' },
      { word: 'click here', category: 'spam', severity: 'low' },
      { word: 'free money', category: 'spam', severity: 'low' },
    ];
    
    let added = 0;
    let skipped = 0;
    
    for (const wordData of defaultFilterWords) {
      const existing = await FilterWord.findOne({ word: wordData.word });
      if (!existing) {
        const filterWord = new FilterWord({
          ...wordData,
          createdBy: admin._id,
          isActive: true,
          action: 'warn'
        });
        await filterWord.save();
        added++;
        console.log(`✅ Added: ${wordData.word}`);
      } else {
        skipped++;
        console.log(`⏭️ Skipped (exists): ${wordData.word}`);
      }
    }
    
    // Clear the filter word cache
    await FilterWord.clearCache();
    
    console.log('\n🎉 Filter words seeding complete!');
    console.log(`   Added: ${added}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Total filter words: ${await FilterWord.countDocuments()}`);
    
    await mongoose.disconnect();
    console.log('\n✅ Done! Restart your server for changes to take effect.');
    
  } catch (error) {
    console.error('❌ Error seeding filter words:', error);
    process.exit(1);
  }
}

seedFilterWords();