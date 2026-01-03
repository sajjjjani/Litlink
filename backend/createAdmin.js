const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const User = require('./models/User');

async function createAdminNow() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/litlink');
    console.log('✅ Connected to MongoDB');
    
    // Delete any existing admin with this email first
    await User.deleteOne({ email: 'admin@litlink.com' });
    console.log('🧹 Cleared any existing admin user');
    
    // Create new admin user
    const plainPassword = 'Admin123!';
    const hashedPassword = await bcrypt.hash(plainPassword, 10);
    
    const adminUser = new User({
      name: 'System Administrator',
      email: 'admin@litlink.com',
      password: hashedPassword,
      isAdmin: true,
      adminLevel: 'super_admin',
      adminPermissions: ['manage_users', 'manage_posts', 'manage_chats', 'view_reports', 'system_settings'],
      isVerified: true,
      profilePicture: '👑',
      bio: 'System Administrator for Litlink Platform',
      location: 'Server Room'
    });
    
    await adminUser.save();
    
    console.log('\n🎉 ADMIN USER CREATED SUCCESSFULLY!');
    console.log('='.repeat(40));
    console.log('📧 EMAIL: admin@litlink.com');
    console.log('🔑 PASSWORD: Admin123!');
    console.log('👤 NAME: System Administrator');
    console.log('👑 ROLE: Super Admin');
    console.log('='.repeat(40));
    
    // Verify it was saved
    const savedAdmin = await User.findOne({ email: 'admin@litlink.com' });
    console.log('\n✅ Verification:');
    console.log(`   Found in DB: ${!!savedAdmin}`);
    console.log(`   Email: ${savedAdmin.email}`);
    console.log(`   isAdmin: ${savedAdmin.isAdmin}`);
    console.log(`   Password hash exists: ${!!savedAdmin.password}`);
    
    await mongoose.disconnect();
    console.log('\n✅ Done! Now try logging in.');
    
  } catch (error) {
    console.error('❌ Error creating admin:', error);
    console.log('\n💡 Try this alternative:');
    console.log('1. Open MongoDB Compass');
    console.log('2. Connect to mongodb://localhost:27017');
    console.log('3. Go to litlink database');
    console.log('4. Find "users" collection');
    console.log('5. Insert document manually:');
    console.log(JSON.stringify({
      name: 'System Administrator',
      email: 'admin@litlink.com',
      password: '$2a$10$YourHashHere', // You'll need to generate this
      isAdmin: true,
      adminLevel: 'super_admin',
      isVerified: true
    }, null, 2));
  }
}

createAdminNow();