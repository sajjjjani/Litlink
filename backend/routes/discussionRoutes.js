// routes/discussionRoutes.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const DiscussionThread = require('../models/DiscussionThread');
const User = require('../models/User');
const authMiddleware = require('../middleware/authMiddleware');

// ===== THREAD ROUTES =====

// Get all threads with filtering, sorting, and pagination
router.get('/threads', authMiddleware, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      sort = 'latest',
      genre,
      tag,
      search,
      featured,
      userId
    } = req.query;

    const query = { isDeleted: false };
    
    // Apply filters
    if (genre && genre !== 'All Genres') {
      query.genre = genre;
    }
    
    if (tag) {
      query.tags = tag;
    }
    
    if (featured === 'true') {
      query.isFeatured = true;
    }
    
    if (userId) {
      query.author = userId;
    }
    
    if (search) {
      query.$text = { $search: search };
    }

    // Determine sort order
    let sortOption = {};
    switch (sort) {
      case 'latest':
        sortOption = { createdAt: -1 };
        break;
      case 'activity':
        sortOption = { lastActivity: -1 };
        break;
      case 'popular':
        sortOption = { views: -1, likeCount: -1, commentCount: -1 };
        break;
      case 'mostReplies':
        sortOption = { commentCount: -1 };
        break;
      case 'mostLikes':
        sortOption = { likeCount: -1 };
        break;
      default:
        sortOption = { createdAt: -1 };
    }

    // Get pinned threads first
    const pinnedThreads = await DiscussionThread.find({ ...query, isPinned: true })
      .populate('author', 'name username profilePicture')
      .populate('lastCommentBy', 'name username')
      .sort(sortOption)
      .limit(parseInt(limit));

    // Get regular threads with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const regularThreads = await DiscussionThread.find({ ...query, isPinned: false })
      .populate('author', 'name username profilePicture')
      .populate('lastCommentBy', 'name username')
      .sort(sortOption)
      .skip(skip)
      .limit(parseInt(limit));

    // Combine pinned and regular threads
    const threads = [...pinnedThreads, ...regularThreads];

    // Get total count for pagination
    const total = await DiscussionThread.countDocuments(query);
    const pinnedCount = await DiscussionThread.countDocuments({ ...query, isPinned: true });

    // Get community highlights
    const highlights = await getCommunityHighlights();

    res.json({
      success: true,
      threads,
      highlights,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
        pinnedCount
      }
    });
  } catch (error) {
    console.error('Error fetching threads:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching threads',
      error: error.message 
    });
  }
});

// Get single thread by ID
router.get('/threads/:threadId', authMiddleware, async (req, res) => {
  try {
    const { threadId } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(threadId)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid thread ID' 
      });
    }

    const thread = await DiscussionThread.findById(threadId)
      .populate('author', 'name username profilePicture')
      .populate('lastCommentBy', 'name username')
      .populate({
        path: 'comments',
        populate: [
          {
            path: 'user',
            select: 'name username profilePicture'
          },
          {
            path: 'replies',
            populate: {
              path: 'user',
              select: 'name username profilePicture'
            }
          }
        ],
        options: { sort: { createdAt: -1 } }
      });

    if (!thread || thread.isDeleted) {
      return res.status(404).json({ 
        success: false, 
        message: 'Thread not found' 
      });
    }

    // Increment view count
    await thread.incrementViews();

    // Check if user liked this thread
    const isLiked = thread.likes.includes(req.userId);

    res.json({
      success: true,
      thread,
      isLiked
    });
  } catch (error) {
    console.error('Error fetching thread:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching thread',
      error: error.message 
    });
  }
});

// Create new thread
router.post('/threads', authMiddleware, async (req, res) => {
  try {
    const { title, content, genre, tags, bookReferences } = req.body;
    
    // Validate required fields
    if (!title || !content) {
      return res.status(400).json({ 
        success: false, 
        message: 'Title and content are required' 
      });
    }

    // Create new thread
    const thread = new DiscussionThread({
      title,
      content,
      author: req.userId,
      genre: genre || 'General',
      tags: tags || [],
      bookReferences: bookReferences || []
    });

    await thread.save();

    // Populate author info
    await thread.populate('author', 'name username profilePicture');

    // Emit WebSocket event for new thread
    try {
      const io = global.io;
      if (io) {
        io.broadcastToAll('new-thread', {
          thread,
          message: `New discussion: "${title}"`
        });
      }
    } catch (socketError) {
      console.error('WebSocket error:', socketError);
    }

    res.status(201).json({
      success: true,
      message: 'Thread created successfully',
      thread
    });
  } catch (error) {
    console.error('Error creating thread:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error creating thread',
      error: error.message 
    });
  }
});

// Update thread
router.put('/threads/:threadId', authMiddleware, async (req, res) => {
  try {
    const { threadId } = req.params;
    const { title, content, genre, tags } = req.body;

    const thread = await DiscussionThread.findById(threadId);
    
    if (!thread) {
      return res.status(404).json({ 
        success: false, 
        message: 'Thread not found' 
      });
    }

    // Check if user is author
    if (thread.author.toString() !== req.userId) {
      return res.status(403).json({ 
        success: false, 
        message: 'Not authorized to edit this thread' 
      });
    }

    // Update fields
    if (title) thread.title = title;
    if (content) thread.content = content;
    if (genre) thread.genre = genre;
    if (tags) thread.tags = tags;

    await thread.save();

    res.json({
      success: true,
      message: 'Thread updated successfully',
      thread
    });
  } catch (error) {
    console.error('Error updating thread:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error updating thread',
      error: error.message 
    });
  }
});

// Delete thread (soft delete)
router.delete('/threads/:threadId', authMiddleware, async (req, res) => {
  try {
    const { threadId } = req.params;

    const thread = await DiscussionThread.findById(threadId);
    
    if (!thread) {
      return res.status(404).json({ 
        success: false, 
        message: 'Thread not found' 
      });
    }

    // Check if user is author or admin
    const user = await User.findById(req.userId);
    if (thread.author.toString() !== req.userId && !user.isAdmin) {
      return res.status(403).json({ 
        success: false, 
        message: 'Not authorized to delete this thread' 
      });
    }

    // Soft delete
    thread.isDeleted = true;
    thread.deletedAt = new Date();
    await thread.save();

    res.json({
      success: true,
      message: 'Thread deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting thread:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error deleting thread',
      error: error.message 
    });
  }
});

// Like/unlike thread
router.post('/threads/:threadId/like', authMiddleware, async (req, res) => {
  try {
    const { threadId } = req.params;

    const thread = await DiscussionThread.findById(threadId);
    
    if (!thread) {
      return res.status(404).json({ 
        success: false, 
        message: 'Thread not found' 
      });
    }

    await thread.toggleLike(req.userId);

    res.json({
      success: true,
      message: 'Thread like toggled',
      likeCount: thread.likeCount,
      isLiked: thread.likes.includes(req.userId)
    });
  } catch (error) {
    console.error('Error toggling like:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error toggling like',
      error: error.message 
    });
  }
});

// ===== COMMENT ROUTES =====

// Add comment to thread
router.post('/threads/:threadId/comments', authMiddleware, async (req, res) => {
  try {
    const { threadId } = req.params;
    const { content, parentCommentId } = req.body;

    if (!content) {
      return res.status(400).json({ 
        success: false, 
        message: 'Comment content is required' 
      });
    }

    const thread = await DiscussionThread.findById(threadId);
    
    if (!thread) {
      return res.status(404).json({ 
        success: false, 
        message: 'Thread not found' 
      });
    }

    // Add comment
    const comment = await thread.addComment(req.userId, content, parentCommentId);

    // Populate user info
    await thread.populate({
      path: 'comments',
      populate: {
        path: 'user',
        select: 'name username profilePicture'
      }
    });

    // Get the populated comment
    const populatedComment = thread.comments.id(comment._id);

    // Emit WebSocket event
    try {
      const io = global.io;
      if (io) {
        io.broadcastToThread(threadId, 'new-comment', {
          comment: populatedComment,
          threadId,
          threadTitle: thread.title
        });
      }
    } catch (socketError) {
      console.error('WebSocket error:', socketError);
    }

    res.status(201).json({
      success: true,
      message: 'Comment added successfully',
      comment: populatedComment,
      commentCount: thread.commentCount
    });
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error adding comment',
      error: error.message 
    });
  }
});

// Like/unlike comment
router.post('/threads/:threadId/comments/:commentId/like', authMiddleware, async (req, res) => {
  try {
    const { threadId, commentId } = req.params;

    const thread = await DiscussionThread.findById(threadId);
    
    if (!thread) {
      return res.status(404).json({ 
        success: false, 
        message: 'Thread not found' 
      });
    }

    // Find comment
    const comment = thread.comments.id(commentId);
    if (!comment) {
      return res.status(404).json({ 
        success: false, 
        message: 'Comment not found' 
      });
    }

    // Toggle like
    const likeIndex = comment.likes.indexOf(req.userId);
    if (likeIndex === -1) {
      comment.likes.push(req.userId);
      comment.likeCount += 1;
    } else {
      comment.likes.splice(likeIndex, 1);
      comment.likeCount -= 1;
    }

    await thread.save();

    res.json({
      success: true,
      message: 'Comment like toggled',
      likeCount: comment.likeCount,
      isLiked: comment.likes.includes(req.userId)
    });
  } catch (error) {
    console.error('Error toggling comment like:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error toggling comment like',
      error: error.message 
    });
  }
});

// Delete comment
router.delete('/threads/:threadId/comments/:commentId', authMiddleware, async (req, res) => {
  try {
    const { threadId, commentId } = req.params;

    const thread = await DiscussionThread.findById(threadId);
    
    if (!thread) {
      return res.status(404).json({ 
        success: false, 
        message: 'Thread not found' 
      });
    }

    // Find comment
    const comment = thread.comments.id(commentId);
    if (!comment) {
      return res.status(404).json({ 
        success: false, 
        message: 'Comment not found' 
      });
    }

    // Check if user is author or admin
    const user = await User.findById(req.userId);
    if (comment.user.toString() !== req.userId && !user.isAdmin) {
      return res.status(403).json({ 
        success: false, 
        message: 'Not authorized to delete this comment' 
      });
    }

    // Soft delete comment
    comment.isDeleted = true;
    comment.deletedAt = new Date();
    comment.content = '[deleted]';
    
    thread.commentCount -= 1;
    await thread.save();

    res.json({
      success: true,
      message: 'Comment deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting comment:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error deleting comment',
      error: error.message 
    });
  }
});

// ===== HELPER FUNCTIONS =====

async function getCommunityHighlights() {
  try {
    // Most discussed thread this week
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const mostDiscussed = await DiscussionThread.findOne({
      createdAt: { $gte: oneWeekAgo },
      isDeleted: false
    })
      .sort({ commentCount: -1 })
      .select('title commentCount views');

    // Trending genre (based on thread count in last 3 days)
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const genreStats = await DiscussionThread.aggregate([
      {
        $match: {
          createdAt: { $gte: threeDaysAgo },
          isDeleted: false
        }
      },
      {
        $group: {
          _id: '$genre',
          count: { $sum: 1 },
          totalViews: { $sum: '$views' },
          totalComments: { $sum: '$commentCount' }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 1 }
    ]);

    // Active users count (users who commented in last 24h)
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    const activeUsers = await DiscussionThread.aggregate([
      {
        $match: {
          lastActivity: { $gte: oneDayAgo },
          isDeleted: false
        }
      },
      {
        $group: {
          _id: null,
          uniqueUsers: { $addToSet: '$lastCommentBy' }
        }
      },
      {
        $project: {
          count: { $size: '$uniqueUsers' }
        }
      }
    ]);

    return {
      mostDiscussed: mostDiscussed ? {
        title: mostDiscussed.title,
        comments: mostDiscussed.commentCount,
        views: mostDiscussed.views
      } : null,
      trendingGenre: genreStats[0] ? {
        genre: genreStats[0]._id,
        threadCount: genreStats[0].count
      } : null,
      activeUsers: activeUsers[0]?.count || 0,
      totalThreads: await DiscussionThread.countDocuments({ isDeleted: false }),
      totalComments: await DiscussionThread.aggregate([
        { $match: { isDeleted: false } },
        { $group: { _id: null, total: { $sum: '$commentCount' } } }
      ]).then(result => result[0]?.total || 0)
    };
  } catch (error) {
    console.error('Error getting highlights:', error);
    return {
      mostDiscussed: null,
      trendingGenre: null,
      activeUsers: 0,
      totalThreads: 0,
      totalComments: 0
    };
  }
}

// Get genre stats
router.get('/stats/genres', authMiddleware, async (req, res) => {
  try {
    const genreStats = await DiscussionThread.aggregate([
      {
        $match: { isDeleted: false }
      },
      {
        $group: {
          _id: '$genre',
          count: { $sum: 1 },
          totalViews: { $sum: '$views' },
          totalComments: { $sum: '$commentCount' },
          totalLikes: { $sum: '$likeCount' }
        }
      },
      {
        $project: {
          genre: '$_id',
          count: 1,
          totalViews: 1,
          totalComments: 1,
          totalLikes: 1,
          _id: 0
        }
      },
      { $sort: { count: -1 } }
    ]);

    res.json({
      success: true,
      genreStats
    });
  } catch (error) {
    console.error('Error getting genre stats:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error getting genre stats',
      error: error.message 
    });
  }
});

// Get user's threads
router.get('/user/:userId/threads', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const threads = await DiscussionThread.find({ 
      author: userId,
      isDeleted: false 
    })
      .populate('author', 'name username profilePicture')
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));

    const total = await DiscussionThread.countDocuments({ 
      author: userId,
      isDeleted: false 
    });

    res.json({
      success: true,
      threads,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching user threads:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching user threads',
      error: error.message 
    });
  }
});

module.exports = router;