const mongoose = require('mongoose');
const User = require('./backend/models/User');

mongoose.connect('mongodb://localhost:27017/litlink')
  .then(async () => {
    const users = await User.find({ "wantToRead": { $exists: true, $ne: [] } });
    console.log(`Found ${users.length} users with wantToRead.`);
    if (users.length > 0) {
      console.log('Sample wantToRead:', users[0].wantToRead);
    } else {
      console.log('No users have wantToRead data saved.');
    }
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
