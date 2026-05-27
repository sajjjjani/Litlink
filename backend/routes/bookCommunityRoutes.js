const express = require('express');
const mongoose = require('mongoose');
const authenticate = require('../middleware/auth');

const BookDiscussionThread = require('../models/BookDiscussionThread');
const BookReview = require('../models/BookReview');

const router = express.Router();

function normalizeBookId(value) {
  const bookId = String(value || '').trim();
  return bookId;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidObjectId(value) {
  return mongoose.isValidObjectId(value);
}

// =========================
// BOOK-SPECIFIC DISCUSSIONS
// =========================

// GET /api/books/:bookId/discussions
router.get('/:bookId/discussions', authenticate, async (req, res) => {
  try {
    const bookId = normalizeBookId(req.params.bookId);
    if (!bookId) {
      return res.status(400).json({ success: false, message: 'Book ID is required' });
    }

    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);

    const discussions = await BookDiscussionThread.find({ bookId, isDeleted: false })
      .sort({ lastActivity: -1, createdAt: -1 })
      .limit(limit)
      .select('bookId title content author replies replyCount lastActivity createdAt updatedAt')
      .populate('author', 'name username profilePicture')
      .lean();

    res.json({ success: true, discussions });
  } catch (error) {
    console.error('Error fetching book discussions:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch discussions' });
  }
});

// POST /api/books/:bookId/discussions
router.post('/:bookId/discussions', authenticate, async (req, res) => {
  try {
    const bookId = normalizeBookId(req.params.bookId);
    if (!bookId) {
      return res.status(400).json({ success: false, message: 'Book ID is required' });
    }

    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';

    if (!content) {
      return res.status(400).json({ success: false, message: 'Discussion message is required' });
    }

    const discussion = await BookDiscussionThread.create({
      bookId,
      title: title || undefined,
      content,
      author: req.userId,
      lastActivity: new Date()
    });

    await discussion.populate('author', 'name username profilePicture');

    res.status(201).json({ success: true, discussion });
  } catch (error) {
    console.error('Error creating book discussion:', error);
    res.status(500).json({ success: false, message: 'Failed to start discussion' });
  }
});

// GET /api/books/:bookId/discussions/:discussionId
router.get('/:bookId/discussions/:discussionId', authenticate, async (req, res) => {
  try {
    const bookId = normalizeBookId(req.params.bookId);
    const discussionId = req.params.discussionId;

    if (!bookId) {
      return res.status(400).json({ success: false, message: 'Book ID is required' });
    }

    if (!isValidObjectId(discussionId)) {
      return res.status(400).json({ success: false, message: 'Invalid discussion id' });
    }

    const discussion = await BookDiscussionThread.findOne({ _id: discussionId, bookId, isDeleted: false })
      .populate('author', 'name username profilePicture')
      .populate('replies.author', 'name username profilePicture')
      .lean();

    if (!discussion) {
      return res.status(404).json({ success: false, message: 'Discussion not found' });
    }

    res.json({ success: true, discussion });
  } catch (error) {
    console.error('Error fetching book discussion:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch discussion' });
  }
});

// POST /api/books/:bookId/discussions/:discussionId/replies
router.post('/:bookId/discussions/:discussionId/replies', authenticate, async (req, res) => {
  try {
    const bookId = normalizeBookId(req.params.bookId);
    const discussionId = req.params.discussionId;

    if (!bookId) {
      return res.status(400).json({ success: false, message: 'Book ID is required' });
    }

    if (!isValidObjectId(discussionId)) {
      return res.status(400).json({ success: false, message: 'Invalid discussion id' });
    }

    const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
    if (!content) {
      return res.status(400).json({ success: false, message: 'Reply content is required' });
    }

    const discussion = await BookDiscussionThread.findOne({ _id: discussionId, bookId, isDeleted: false });
    if (!discussion) {
      return res.status(404).json({ success: false, message: 'Discussion not found' });
    }

    discussion.replies.push({ author: req.userId, content });
    discussion.lastActivity = new Date();
    await discussion.save();

    await discussion.populate('author', 'name username profilePicture');
    await discussion.populate('replies.author', 'name username profilePicture');

    res.status(201).json({ success: true, discussion });
  } catch (error) {
    console.error('Error replying to book discussion:', error);
    res.status(500).json({ success: false, message: 'Failed to add reply' });
  }
});

// ====================
// BOOK-SPECIFIC REVIEWS
// ====================

// GET /api/books/:bookId/reviews
router.get('/:bookId/reviews', authenticate, async (req, res) => {
  try {
    const bookId = normalizeBookId(req.params.bookId);
    if (!bookId) {
      return res.status(400).json({ success: false, message: 'Book ID is required' });
    }

    const reviews = await BookReview.find({ bookId })
      .sort({ createdAt: -1 })
      .populate('user', 'name username profilePicture')
      .lean();

    res.json({ success: true, reviews });
  } catch (error) {
    console.error('Error fetching book reviews:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch reviews' });
  }
});

// POST /api/books/:bookId/reviews
router.post('/:bookId/reviews', authenticate, async (req, res) => {
  try {
    const bookId = normalizeBookId(req.params.bookId);
    if (!bookId) {
      return res.status(400).json({ success: false, message: 'Book ID is required' });
    }

    const rating = Number(req.body?.rating);
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';

    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5' });
    }

    if (!isNonEmptyString(text)) {
      return res.status(400).json({ success: false, message: 'Review text is required' });
    }

    const review = await BookReview.create({
      bookId,
      user: req.userId,
      rating: Math.round(rating),
      text
    });

    await review.populate('user', 'name username profilePicture');

    res.status(201).json({ success: true, review });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ success: false, message: 'You already reviewed this book' });
    }
    console.error('Error creating book review:', error);
    res.status(500).json({ success: false, message: 'Failed to submit review' });
  }
});

// PUT /api/books/:bookId/reviews/:reviewId
router.put('/:bookId/reviews/:reviewId', authenticate, async (req, res) => {
  try {
    const bookId = normalizeBookId(req.params.bookId);
    const reviewId = req.params.reviewId;

    if (!bookId) {
      return res.status(400).json({ success: false, message: 'Book ID is required' });
    }

    if (!isValidObjectId(reviewId)) {
      return res.status(400).json({ success: false, message: 'Invalid review id' });
    }

    const rating = Number(req.body?.rating);
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';

    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5' });
    }

    if (!isNonEmptyString(text)) {
      return res.status(400).json({ success: false, message: 'Review text is required' });
    }

    const review = await BookReview.findOne({ _id: reviewId, bookId });
    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }

    if (String(review.user) !== String(req.userId)) {
      return res.status(403).json({ success: false, message: 'You can only edit your own review' });
    }

    review.rating = Math.round(rating);
    review.text = text;
    await review.save();
    await review.populate('user', 'name username profilePicture');

    res.json({ success: true, review });
  } catch (error) {
    console.error('Error updating book review:', error);
    res.status(500).json({ success: false, message: 'Failed to update review' });
  }
});

// DELETE /api/books/:bookId/reviews/:reviewId
router.delete('/:bookId/reviews/:reviewId', authenticate, async (req, res) => {
  try {
    const bookId = normalizeBookId(req.params.bookId);
    const reviewId = req.params.reviewId;

    if (!bookId) {
      return res.status(400).json({ success: false, message: 'Book ID is required' });
    }

    if (!isValidObjectId(reviewId)) {
      return res.status(400).json({ success: false, message: 'Invalid review id' });
    }

    const review = await BookReview.findOne({ _id: reviewId, bookId });
    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }

    if (String(review.user) !== String(req.userId)) {
      return res.status(403).json({ success: false, message: 'You can only delete your own review' });
    }

    await BookReview.deleteOne({ _id: reviewId });
    res.json({ success: true, message: 'Review deleted' });
  } catch (error) {
    console.error('Error deleting book review:', error);
    res.status(500).json({ success: false, message: 'Failed to delete review' });
  }
});

module.exports = router;

