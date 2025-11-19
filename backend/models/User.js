const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  username: {
    type: String,
    required: true,
    unique: true
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
  favoriteGenres: [String],
  favoriteAuthors: [String],
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

module.exports = mongoose.model('User', userSchema);