const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  verificationCode: {
    type: String,
    default: null
  },
  verificationExpiry: {
    type: Date,
    default: null
  },
  resetToken: {
    type: String,
    default: null
  },
  resetTokenExpiry: {
    type: Date,
    default: null
  },
  profilePicture: {
    type: String,
    default: '📚'
  },
  bio: {
    type: String,
    default: 'Book lover and avid reader'
  },
  location: {
    type: String,
    default: ''
  },
  pronouns: {
    type: String,
    default: ''
  },
  // Questionnaire fields
  favoriteGenres: [String],
  favoriteAuthors: [String],
  favoriteBooks: [String],
  readingHabit: String,
  readingGoal: Number,
  preferredFormats: [String],
  discussionPreferences: [String],
  receiveRecommendations: {
    type: Boolean,
    default: true
  },
  // Bookshelf
  booksRead: [{
    bookId: String,
    title: String,
    author: String,
    readAt: Date
  }],
  currentlyReading: [{
    bookId: String,
    title: String,
    author: String
  }],
  wantToRead: [{
    bookId: String,
    title: String,
    author: String
  }],
  followers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  following: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }]
}, {
  timestamps: true
});

// Add index for faster queries
userSchema.index({ email: 1 });
userSchema.index({ isVerified: 1 });

module.exports = mongoose.model('User', userSchema);