const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
const Circle = require('./models/Circle');
require('dotenv').config();

const circles = [
  {
    name: 'Fantasy Readers',
    circleId: 'fantasy-readers',
    description: 'A community for fantasy book lovers to discuss epic tales, magical worlds, and mythical creatures. From Tolkien to Sanderson, join us!',
    icon: '🐉',
    genre: 'Fantasy',
    settings: {
      isPrivate: true,
      requireApproval: true,
      allowMemberPosts: true
    }
  },
  {
    name: 'Mystery Detectives',
    circleId: 'mystery-detectives',
    description: 'Solve mysteries and discuss thrillers with fellow detective fiction enthusiasts. From Sherlock to modern noir.',
    icon: '🔍',
    genre: 'Mystery',
    settings: {
      isPrivate: true,
      requireApproval: true,
      allowMemberPosts: true
    }
  },
  {
    name: 'Sci-Fi Enthusiasts',
    circleId: 'scifi-enthusiasts',
    description: 'Explore the frontiers of science fiction, from classic works to modern masterpieces. Join us for deep discussions on speculative fiction.',
    icon: '🚀',
    genre: 'Sci-Fi',
    settings: {
      isPrivate: true,
      requireApproval: true,
      allowMemberPosts: true
    }
  },
  {
    name: 'Classics Club',
    circleId: 'classics-club',
    description: 'Timeless literature that has shaped our world. Join us to discuss the great works from ancient epics to modern classics.',
    icon: '📜',
    genre: 'Classics',
    settings: {
      isPrivate: true,
      requireApproval: true,
      allowMemberPosts: true
    }
  },
  {
    name: 'Romance Readers',
    circleId: 'romance-readers',
    description: 'For lovers of romance novels - from historical to contemporary, we read it all. Share your favorite love stories with us!',
    icon: '💕',
    genre: 'Romance',
    settings: {
      isPrivate: true,
      requireApproval: true,
      allowMemberPosts: true
    }
  },
  {
    name: 'Poetry Corner',
    circleId: 'poetry-corner',
    description: 'Share and discuss poetry - from classic sonnets to modern spoken word. All poets and poetry lovers welcome!',
    icon: '📝',
    genre: 'Poetry',
    settings: {
      isPrivate: true,
      requireApproval: true,
      allowMemberPosts: true
    }
  },
  {
    name: 'Historical Fiction',
    circleId: 'historical-fiction',
    description: 'Travel through time with historical fiction from all eras and cultures. From ancient civilizations to the 20th century.',
    icon: '🏺',
    genre: 'Historical',
    settings: {
      isPrivate: true,
      requireApproval: true,
      allowMemberPosts: true
    }
  },
  {
    name: 'Thriller Addicts',
    circleId: 'thriller-addicts',
    description: 'For fans of suspense, thrillers, and page-turners that keep you up at night. Join us for heart-pounding discussions!',
    icon: '🔪',
    genre: 'Thriller',
    settings: {
      isPrivate: true,
      requireApproval: true,
      allowMemberPosts: true
    }
  }
];

async function seedCircles() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/litlink');
    console.log('Connected to MongoDB');
    
    await Circle.deleteMany({});
    console.log('Cleared existing circles');
    
    let admin = await User.findOne({ email: 'admin@litlink.com' });
    
    if (!admin) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      admin = await User.create({
        name: 'Admin',
        email: 'admin@litlink.com',
        username: 'admin',
        password: hashedPassword,
        isAdmin: true,
        adminLevel: 'super_admin',
        isVerified: true
      });
      console.log('Created admin user');
    }
    
    for (const circleData of circles) {
      const circle = new Circle({
        ...circleData,
        createdBy: admin._id,
        moderators: [admin._id],
        members: [{
          user: admin._id,
          joinedAt: new Date(),
          role: 'admin'
        }]
      });
      
      await circle.save();
      console.log(`Created circle: ${circle.name}`);
    }
    
    console.log(`\n✅ Successfully created ${circles.length} circles`);
    console.log('\nCircle IDs for reference:');
    circles.forEach(circle => {
      console.log(`   - ${circle.circleId} (${circle.name})`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error seeding circles:', error);
    process.exit(1);
  }
}

seedCircles();