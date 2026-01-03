const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const User = require('./models/User');

async function seedAdmin() {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to database');
    
    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: 'admin@litlink.com' });
    
    if (existingAdmin) {
      console.log('⚠️ Admin user already exists');
      console.log('📧 Email:', existingAdmin.email);
      console.log('👤 Name:', existingAdmin.name);
      console.log('🔑 Password: (Already set)');
      console.log('👑 Admin Level:', existingAdmin.adminLevel);
      await mongoose.disconnect();
      return;
    }
    
    // Create admin user
    const hashedPassword = await bcrypt.hash('Admin123!', 10);
    
    const adminUser = new User({
      name: 'System Administrator',
      email: 'admin@litlink.com',
      password: hashedPassword,
      isAdmin: true,
      adminLevel: 'super_admin',
      adminPermissions: [
        'manage_users',
        'manage_posts', 
        'manage_chats',
        'view_reports',
        'system_settings'
      ],
      isVerified: true, // Skip verification for admin
      profilePicture: '👑',
      bio: 'System Administrator for Litlink Platform',
      location: 'Server Room',
      pronouns: 'Admin/Admin'
    });
    
    await adminUser.save();
    
    console.log('✅ Admin user created successfully!');
    console.log('📧 Email: admin@litlink.com');
    console.log('🔑 Password: Admin123!');
    console.log('👤 Name: System Administrator');
    console.log('👑 Level: Super Admin');
    
    await mongoose.disconnect();
    console.log('✅ Database connection closed');
    
  } catch (error) {
    console.error('❌ Error seeding admin:', error);
    process.exit(1);
  }
}

seedAdmin();