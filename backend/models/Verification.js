const mongoose = require('mongoose');

const verificationSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  code: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['email_verification', 'password_reset'],
    required: true
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expires: 0 } // Auto-delete after expiration
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Compound index for faster lookups
verificationSchema.index({ email: 1, type: 1 });

module.exports = mongoose.model('Verification', verificationSchema);