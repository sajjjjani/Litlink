const mongoose = require('mongoose');

const voiceRoomSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  genre: {
    type: String,
    required: true,
    enum: [
      // Fiction
      'Fantasy', 'High Fantasy', 'Dark Fantasy', 'Urban Fantasy',
      'Science Fiction', 'Dystopian', 'Cyberpunk', 'Space Opera',
      'Mystery', 'Thriller', 'Psychological Thriller', 'Crime Fiction', 'Cozy Mystery',
      'Horror', 'Gothic Fiction', 'Supernatural Fiction',
      'Romance', 'Historical Romance', 'Contemporary Romance', 'Paranormal Romance',
      'Literary Fiction', 'Magical Realism', 'Historical Fiction',
      'Adventure', 'Action & Adventure', 'Humor & Satire',
      'Short Stories', 'Anthologies',
      // Classic Literature
      'Classic Literature', 'Ancient Literature', 'Victorian Literature',
      'Modernist Literature', 'World Literature', 'Mythology & Folklore',
      // Poetry & Drama
      'Poetry', 'Spoken Word', 'Drama & Plays', 'Screenwriting',
      // Non-Fiction
      'Non-Fiction', 'Memoir & Autobiography', 'Biography', 'True Crime',
      'History', 'Philosophy', 'Psychology', 'Self-Help & Personal Growth',
      'Business & Leadership', 'Economics', 'Science & Nature', 'Technology',
      'Politics & Society', 'Travel Writing', 'Food & Cooking', 'Art & Design',
      'Music & Culture', 'Sports & Recreation', 'Spirituality & Religion',
      'Health & Wellness', 'Environment & Nature', 'Education',
      'Journalism & Essays',
      // Young Adult & Children
      'Young Adult (YA)', 'YA Fantasy', 'YA Romance', 'YA Thriller',
      'Middle Grade', "Children's Books", 'Picture Books',
      // Manga & Comics
      'Manga', 'Graphic Novels', 'Comics', 'Webtoons',
      // Other / catch-all
      'Book Club Picks', 'Award Winners', 'Debut Authors', 'Indie & Self-Published',
      'Translated Literature', 'LGBTQ+ Literature', 'South Asian Literature',
      'African Literature', 'Latin American Literature', 'East Asian Literature',
      'General Discussion',
      'Sci-Fi', // legacy alias kept for backward compatibility
      'Other'
    ]
  },
  description: {
    type: String,
    default: ''
  },
  hostId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  hostName: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['live', 'scheduled', 'ended', 'completed', 'missed'],
    default: 'live'
  },
  scheduledFor: {
    type: Date,
    default: null
  },
  reminderUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  preStartNotified: {
    type: Boolean,
    default: false
  },
  participantCount: {
    type: Number,
    default: 1
  },
  maxParticipants: {
    type: Number,
    default: 50
  },
  isPrivate: {
    type: Boolean,
    default: false
  },
  allowedUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  endedAt: {
    type: Date,
    default: null
  },
  duration: {
    type: Number,
    default: 0
  }
});

// Index for efficient queries
voiceRoomSchema.index({ status: 1, createdAt: -1 });
voiceRoomSchema.index({ hostId: 1 });
voiceRoomSchema.index({ genre: 1 });

voiceRoomSchema.pre('save', function (next) {
  const allowed = voiceRoomSchema.path('genre').enumValues;
  if (this.genre && !allowed.includes(this.genre)) {
    this.genre = 'Other';
  }
  next();
});

module.exports = mongoose.model('VoiceRoom', voiceRoomSchema);