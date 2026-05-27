const mongoose = require('mongoose');

const bookReviewSchema = new mongoose.Schema(
  {
    bookId: { type: String, required: true, trim: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    text: { type: String, required: true, trim: true, maxlength: 5000 }
  },
  { timestamps: true }
);

bookReviewSchema.index({ bookId: 1, user: 1 }, { unique: true });
bookReviewSchema.index({ bookId: 1, createdAt: -1 });

module.exports = mongoose.model('BookReview', bookReviewSchema);

