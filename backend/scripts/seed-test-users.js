const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const path = require('path');

// Load env from parent directory
dotenv.config({ path: path.join(__dirname, '../../.env') });

// Import User model - fix the path
const User = require('../models/User');

const testUsers = [
  {
    name: "Emma Watson",
    email: "emma@litlink.com",
    username: "emma_reads",
    password: "test123",
    bio: "Fantasy and mystery lover. Always looking for book recommendations!",
    location: "New York",
    favoriteGenres: ["Fantasy", "Mystery", "Young Adult"],
    favoriteAuthors: ["J.K. Rowling", "Agatha Christie", "Sarah J. Maas"],
    favoriteBooks: ["Harry Potter", "Murder on the Orient Express", "A Court of Thorns and Roses"],
    readingHabit: "Avid Reader",
    preferredFormats: ["Physical", "E-book"],
    readingGoal: 50,
    profilePicture: "📚",
    isVerified: true
  },
  {
    name: "James Wilson",
    email: "james@litlink.com",
    username: "james_books",
    password: "test123",
    bio: "Sci-fi enthusiast and tech reader",
    location: "San Francisco",
    favoriteGenres: ["Sci-Fi", "Technology", "Thriller"],
    favoriteAuthors: ["Isaac Asimov", "Philip K. Dick", "Andy Weir"],
    favoriteBooks: ["Foundation", "Project Hail Mary", "Dune"],
    readingHabit: "Night Owl",
    preferredFormats: ["E-book", "Audiobook"],
    readingGoal: 30,
    profilePicture: "🤖",
    isVerified: true
  },
  {
    name: "Sophia Chen",
    email: "sophia@litlink.com",
    username: "sophia_lit",
    password: "test123",
    bio: "Classic literature and poetry lover",
    location: "London",
    favoriteGenres: ["Classics", "Poetry", "Historical Fiction"],
    favoriteAuthors: ["Jane Austen", "Charles Dickens", "Emily Dickinson"],
    favoriteBooks: ["Pride and Prejudice", "Great Expectations", "Wuthering Heights"],
    readingHabit: "Casual Reader",
    preferredFormats: ["Physical"],
    readingGoal: 25,
    profilePicture: "📖",
    isVerified: true
  },
  {
    name: "Marcus Thompson",
    email: "marcus@litlink.com",
    username: "marcus_reads",
    password: "test123",
    bio: "Thriller and horror fan",
    location: "Chicago",
    favoriteGenres: ["Thriller", "Horror", "Mystery"],
    favoriteAuthors: ["Stephen King", "Gillian Flynn", "Dean Koontz"],
    favoriteBooks: ["The Shining", "Gone Girl", "The Silent Patient"],
    readingHabit: "Weekend Reader",
    preferredFormats: ["Audiobook", "E-book"],
    readingGoal: 40,
    profilePicture: "🎧",
    isVerified: true
  },
  {
    name: "Olivia Rodriguez",
    email: "olivia@litlink.com",
    username: "olivia_books",
    password: "test123",
    bio: "Romance and contemporary fiction reader",
    location: "Miami",
    favoriteGenres: ["Romance", "Contemporary", "Chick Lit"],
    favoriteAuthors: ["Colleen Hoover", "Taylor Jenkins Reid", "Nicholas Sparks"],
    favoriteBooks: ["It Ends with Us", "The Seven Husbands of Evelyn Hugo", "The Notebook"],
    readingHabit: "Avid Reader",
    preferredFormats: ["Physical", "E-book", "Audiobook"],
    readingGoal: 60,
    profilePicture: "💕",
    isVerified: true
  }
];

const seedTestUsers = async () => {
  try {
    // Connect to MongoDB
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/litlink';
    console.log(`Connecting to MongoDB: ${mongoURI}`);
    
    await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB\n');
    
    let created = 0;
    let existing = 0;
    
    for (const userData of testUsers) {
      const existingUser = await User.findOne({ email: userData.email });
      
      if (!existingUser) {
        const hashedPassword = await bcrypt.hash(userData.password, 10);
        const user = new User({
          ...userData,
          password: hashedPassword
        });
        
        await user.save();
        console.log(`✅ Created test user: ${userData.name} (${userData.email})`);
        created++;
      } else {
        console.log(`⚠️ User already exists: ${userData.name} (${userData.email})`);
        existing++;
      }
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('🎉 Test users seeding completed!');
    console.log(`   Created: ${created} users`);
    console.log(`   Already existed: ${existing} users`);
    console.log('\n🔐 All test users have password: test123');
    console.log('\n📚 Test users available:');
    testUsers.forEach(user => {
      console.log(`   - ${user.email} (${user.favoriteGenres.join('/')})`);
    });
    console.log('='.repeat(50));
    
  } catch (error) {
    console.error('❌ Error seeding test users:', error);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
};

// Run the seed function
seedTestUsers();