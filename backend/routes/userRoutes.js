const express = require('express');
const fetch = require('../utils/fetch');
const router = express.Router();
const authenticate = require('../middleware/auth');
const User = require('../models/User');
const matchService = require('../services/matchService');
const UNS = require('../services/UserNotificationService');

// Helper: Get book cover URL
function getBookCoverUrl(bookId, coverId, isbn) {
  if (coverId) {
    return `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`;
  }
  if (isbn) {
    const isbnValue = Array.isArray(isbn) ? isbn[0] : isbn;
    return `https://covers.openlibrary.org/b/isbn/${isbnValue}-M.jpg`;
  }
  if (bookId) {
    return `https://covers.openlibrary.org/b/olid/${bookId}-M.jpg`;
  }
  return null;
}

// ==================== USER PREFERENCES ENDPOINTS ====================

// GET /api/users/preferences - Get user preferences
router.get('/preferences', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('textSizePreference');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, textSizePreference: user.textSizePreference || 'default' });
  } catch (error) {
    console.error('Error fetching user preferences:', error);
    res.status(500).json({ success: false, message: 'Error fetching preferences' });
  }
});

// PUT /api/users/preferences - Update user preferences
router.put('/preferences', authenticate, async (req, res) => {
  try {
    const { textSizePreference } = req.body;
    
    if (!['small', 'default', 'large'].includes(textSizePreference)) {
      return res.status(400).json({ success: false, message: 'Invalid text size preference' });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.textSizePreference = textSizePreference;
    await user.save();

    res.json({ success: true, message: 'Preferences updated successfully', textSizePreference: user.textSizePreference });
  } catch (error) {
    console.error('Error updating preferences:', error);
    res.status(500).json({ success: false, message: 'Error updating preferences' });
  }
});

// ==================== USER ENDPOINTS FOR EXPLORE PAGE ====================

// GET /api/users - Get all users (excluding current user, admins, banned)
router.get('/', authenticate, async (req, res) => {
  try {
    const currentUserId = req.user._id.toString();

    const users = await User.find({
      _id: { $ne: req.user._id },
      isBanned: false,
      isSuspended: false,
      isAdmin: false
    }).select('-password -resetToken -resetTokenExpiry -verificationCode -verificationExpiry -adminLevel -adminPermissions');

    // Filter out users who have blocked the current user
    const visibleUsers = users.filter(u => {
      if (u.blockedUsers && u.blockedUsers.some(id => id.toString() === currentUserId)) {
        return false;
      }
      return true;
    });
    
    res.json({
      success: true,
      users: visibleUsers,
      total: visibleUsers.length
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching users'
    });
  }
});

// GET /api/users/:userId - Get specific user by ID (with privacy enforcement)
router.get('/:userId', authenticate, async (req, res) => {
  try {
    const targetUserId = req.params.userId;
    const viewerId = req.user._id.toString();
    
    // Check profile visibility
    const UserSettings = require('../models/UserSettings');
    const settings = await UserSettings.findOne({ userId: targetUserId });
    let profilePrivacy = 'everyone';
    if (settings && settings.privacy && settings.privacy.profilePrivacy) {
      profilePrivacy = settings.privacy.profilePrivacy;
    }

    const isOwner = viewerId === targetUserId;

    if (!isOwner && profilePrivacy === 'private') {
      return res.json({
        success: true,
        user: {
          _id: targetUserId,
          name: 'Private Profile',
          profilePicture: '🔒',
          bio: '',
          privacyRestricted: true,
          privacyReason: 'This profile is private.'
        }
      });
    }

    if (!isOwner && profilePrivacy === 'followers') {
      const targetUser = await User.findById(targetUserId).select('followers');
      if (targetUser) {
        const isFollower = targetUser.followers &&
          targetUser.followers.some(id => id.toString() === viewerId);
        if (!isFollower) {
          return res.json({
            success: true,
            user: {
              _id: targetUserId,
              name: 'Private Profile',
              profilePicture: '🔒',
              bio: '',
              privacyRestricted: true,
              privacyReason: 'This profile is only visible to followers.'
            }
          });
        }
      }
    }

    const user = await User.findById(targetUserId)
      .select('-password -resetToken -resetTokenExpiry -verificationCode -verificationExpiry');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Also check if viewer is blocked by this user
    if (!isOwner && user.blockedUsers && user.blockedUsers.some(id => id.toString() === viewerId)) {
      return res.json({
        success: true,
        user: {
          _id: targetUserId,
          name: 'Private Profile',
          profilePicture: '🔒',
          bio: '',
          privacyRestricted: true,
          privacyReason: 'This profile is not available.'
        }
      });
    }
    
    res.json({
      success: true,
      user: user
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user'
    });
  }
});

// GET /api/users/search - Search users by name, username, or interests
router.get('/search', authenticate, async (req, res) => {
  try {
    const { query, genre, limit = 20 } = req.query;
    const currentUserId = req.user._id.toString();
    
    let searchCriteria = {
      _id: { $ne: req.user._id },
      isBanned: false,
      isSuspended: false,
      isAdmin: false
    };
    
    if (query) {
      searchCriteria.$or = [
        { name: { $regex: query, $options: 'i' } },
        { username: { $regex: query, $options: 'i' } },
        { favoriteBooks: { $regex: query, $options: 'i' } },
        { favoriteGenres: { $regex: query, $options: 'i' } }
      ];
    }
    
    if (genre && genre !== 'all') {
      searchCriteria.favoriteGenres = genre;
    }
    
    const users = await User.find(searchCriteria)
      .select('-password -resetToken -resetTokenExpiry -verificationCode -verificationExpiry')
      .limit(parseInt(limit))
      .sort({ lastLogin: -1 });

    // Filter out users who have blocked current user
    const filteredUsers = users.filter(u => {
      if (u.blockedUsers && u.blockedUsers.some(id => id.toString() === currentUserId)) {
        return false;
      }
      return true;
    });
    
    const usersWithMatches = filteredUsers.map(user => {
      const match = matchService.calculateMatchScore(req.user, user);
      return {
        ...user.toObject(),
        matchPercentage: match.matchPercentage,
        matchDetails: match.details
      };
    }).sort((a, b) => b.matchPercentage - a.matchPercentage);
    
    res.json({
      success: true,
      users: usersWithMatches,
      total: usersWithMatches.length
    });
  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).json({
      success: false,
      message: 'Error searching users'
    });
  }
});

// GET /api/users/:userId/matches - Get matches for a specific user
router.get('/:userId/matches', authenticate, async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit) || 20;
    
    if (userId !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized'
      });
    }
    
    const currentUser = req.user;
    
    const allUsers = await User.find({
      _id: { $ne: currentUser._id },
      isBanned: false,
      isSuspended: false,
      isAdmin: false
    }).select('-password -resetToken -resetTokenExpiry -verificationCode -verificationExpiry');
    
    const matches = allUsers.map(user => matchService.calculateMatchScore(currentUser, user))
      .sort((a, b) => b.matchPercentage - a.matchPercentage)
      .slice(0, limit);
    
    const matchesWithDetails = await Promise.all(
      matches.map(async (match) => {
        const user = await User.findById(match.userId)
          .select('name username profilePicture bio favoriteGenres favoriteAuthors favoriteBooks location readingHabit');
        return { ...match, userDetails: user };
      })
    );
    
    res.json({
      success: true,
      matches: matchesWithDetails,
      total: matchesWithDetails.length
    });
    
  } catch (error) {
    console.error('Get user matches error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching matches'
    });
  }
});

// GET /api/users/:userId/suggested - Get suggested users
router.get('/:userId/suggested', authenticate, async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit) || 10;
    
    if (userId !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized'
      });
    }
    
    const currentUser = req.user;
    
    const allUsers = await User.find({
      _id: { $ne: currentUser._id },
      isBanned: false,
      isSuspended: false,
      isAdmin: false
    }).select('-password -resetToken -resetTokenExpiry -verificationCode -verificationExpiry');
    
    const suggestions = matchService.getMatchSuggestions(currentUser, allUsers, limit);
    
    const suggestionsWithDetails = await Promise.all(
      suggestions.map(async (suggestion) => {
        const user = await User.findById(suggestion.userId)
          .select('name username profilePicture bio favoriteGenres favoriteAuthors');
        
        let reason = "Similar reading interests";
        if (suggestion.details.bookMatch > 0) {
          reason = `Also loves ${suggestion.details.bookList[0]}`;
        } else if (suggestion.details.authorMatch > 0) {
          reason = `Shares favorite author: ${suggestion.details.authorList[0]}`;
        } else if (suggestion.details.genreMatch > 0) {
          reason = `Enjoys ${suggestion.details.genreList[0]} books too`;
        }
        
        return { ...suggestion, userDetails: user, reason };
      })
    );
    
    res.json({
      success: true,
      users: suggestionsWithDetails,
      total: suggestionsWithDetails.length
    });
    
  } catch (error) {
    console.error('Get suggested users error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching suggestions'
    });
  }
});

// ==================== BLOCK/UNBLOCK ENDPOINTS ====================

// POST /api/users/:userId/block - Block a user
router.post('/:userId/block', authenticate, async (req, res) => {
  try {
    const currentUserId = req.user._id;
    const targetUserId = req.params.userId;
    
    if (currentUserId.toString() === targetUserId) {
      return res.status(400).json({ 
        success: false, 
        message: 'You cannot block yourself' 
      });
    }
    
    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }
    
    const currentUser = await User.findById(currentUserId);
    
    // Check if already blocked
    if (currentUser.blockedUsers && currentUser.blockedUsers.includes(targetUserId)) {
      return res.status(400).json({ 
        success: false, 
        message: 'User is already blocked' 
      });
    }
    
    // Add to blocked users
    if (!currentUser.blockedUsers) {
      currentUser.blockedUsers = [];
    }
    currentUser.blockedUsers.push(targetUserId);
    await currentUser.save();
    
    console.log(`🔒 User ${currentUser.name} blocked ${targetUser.name}`);
    
    // Send real-time notification to admins about block
    try {
      const io = global.io;
      if (io && io.broadcastToAdmins) {
        io.broadcastToAdmins({
          type: 'admin-notification',
          notificationType: 'admin_user_blocked',
          title: 'User Blocked',
          message: `${currentUser.name} has blocked ${targetUser.name}`,
          timestamp: new Date(),
          priority: 'low',
          metadata: {
            blockerId: currentUserId.toString(),
            blockerName: currentUser.name,
            blockedId: targetUserId,
            blockedName: targetUser.name
          }
        });
      }
    } catch (socketErr) {
      console.error('Block WebSocket notify error:', socketErr);
    }
    
    res.json({ 
      success: true, 
      message: `${targetUser.name} has been blocked`,
      blockedUser: {
        id: targetUser._id,
        name: targetUser.name,
        username: targetUser.username,
        profilePicture: targetUser.profilePicture
      }
    });
    
  } catch (error) {
    console.error('Block user error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to block user: ' + error.message 
    });
  }
});

// DELETE /api/users/:userId/unblock - Unblock a user
router.delete('/:userId/unblock', authenticate, async (req, res) => {
  try {
    const currentUserId = req.user._id;
    const targetUserId = req.params.userId;
    
    const currentUser = await User.findById(currentUserId);
    
    if (!currentUser.blockedUsers || !currentUser.blockedUsers.includes(targetUserId)) {
      return res.status(400).json({ 
        success: false, 
        message: 'User is not blocked' 
      });
    }
    
    // Remove from blocked users
    currentUser.blockedUsers = currentUser.blockedUsers.filter(
      id => id.toString() !== targetUserId
    );
    await currentUser.save();
    
    const targetUser = await User.findById(targetUserId);
    const targetName = targetUser ? targetUser.name : 'User';
    
    console.log(`🔓 User ${currentUser.name} unblocked ${targetName}`);
    
    res.json({ 
      success: true, 
      message: `${targetName} has been unblocked` 
    });
    
  } catch (error) {
    console.error('Unblock user error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to unblock user: ' + error.message 
    });
  }
});

// GET /api/users/blocked/list - Get list of blocked users
router.get('/blocked/list', authenticate, async (req, res) => {
  try {
    const currentUser = await User.findById(req.user._id).populate('blockedUsers', 'name username profilePicture bio favoriteGenres');
    
    const blockedList = currentUser.blockedUsers || [];
    
    res.json({
      success: true,
      blockedUsers: blockedList,
      total: blockedList.length
    });
    
  } catch (error) {
    console.error('Get blocked users error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch blocked users: ' + error.message 
    });
  }
});

// ==================== BOOK ENDPOINTS ====================

// POST /api/users/:userId/books - Add book to user profile
router.post('/:userId/books', authenticate, async (req, res) => {
  try {
    const { userId } = req.params;
    const { bookTitle, bookId } = req.body;
    
    if (userId !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized'
      });
    }
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    let bookCover = '';
    let bookAuthor = '';
    
    if (bookId) {
      try {
        let workKey = bookId;
        if (!workKey.startsWith('/works/')) {
          workKey = workKey.startsWith('OL') ? `/works/${workKey}` : `/works/${workKey}`;
        }
        
        const response = await fetch(`https://openlibrary.org${workKey}.json`, {
          signal: AbortSignal.timeout(10000)
        });
        
        if (response.ok) {
          const bookData = await response.json();
          
          if (bookData.covers && bookData.covers.length > 0) {
            const coverId = bookData.covers[0];
            bookCover = `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`;
          }
          
          if (!bookCover && bookData.isbn_13 && bookData.isbn_13.length > 0) {
            bookCover = `https://covers.openlibrary.org/b/isbn/${bookData.isbn_13[0]}-M.jpg`;
          }
          
          if (!bookCover && bookData.isbn_10 && bookData.isbn_10.length > 0) {
            bookCover = `https://covers.openlibrary.org/b/isbn/${bookData.isbn_10[0]}-M.jpg`;
          }
          
          if (bookData.authors && bookData.authors.length > 0) {
            const authorRef = bookData.authors[0];
            if (authorRef.author && authorRef.author.key) {
              try {
                const authorRes = await fetch(`https://openlibrary.org${authorRef.author.key}.json`, {
                  signal: AbortSignal.timeout(5000)
                });
                if (authorRes.ok) {
                  const authorData = await authorRes.json();
                  bookAuthor = authorData.name || '';
                }
              } catch (err) {
                console.log('Error fetching author:', err.message);
              }
            }
            
            if (!bookAuthor && authorRef.name) {
              bookAuthor = authorRef.name;
            }
          }
        }
      } catch (error) {
        console.log('Could not fetch book cover from Open Library:', error.message);
      }
    }
    
    if (!bookCover) {
      const safeTitle = encodeURIComponent(bookTitle.substring(0, 20));
      bookCover = `https://placehold.co/150x200/3d2617/f5e6d3?text=${safeTitle}&font=montserrat`;
    }
    
    const bookData = {
      bookId: bookId || `custom-${Date.now()}`,
      title: bookTitle,
      author: bookAuthor,
      readAt: new Date(),
      cover: bookCover
    };
    
    if (!user.booksRead) {
      user.booksRead = [];
    }
    
    const existingIndex = user.booksRead.findIndex(book => 
      book.bookId === bookData.bookId || 
      book.title.toLowerCase() === bookTitle.toLowerCase()
    );
    
    if (existingIndex === -1) {
      user.booksRead.push(bookData);
    } else {
      user.booksRead[existingIndex] = bookData;
    }
    
    await user.save();
    
    res.json({
      success: true,
      message: existingIndex === -1 ? 'Book added to your profile!' : 'Book updated in your profile',
      book: {
        id: bookData.bookId,
        title: bookData.title,
        author: bookData.author,
        cover: bookData.cover,
        addedAt: bookData.readAt
      }
    });
    
  } catch (error) {
    console.error('Add book error:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding book: ' + error.message
    });
  }
});

// GET /api/users/:userId/books - Get user's books
router.get('/:userId/books', authenticate, async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (userId !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized'
      });
    }
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const books = (user.booksRead || []).map(book => ({
      id: book.bookId || book.id,
      title: book.title,
      author: book.author,
      cover: book.cover || `https://placehold.co/150x200/3d2617/f5e6d3?text=${encodeURIComponent((book.title || 'Book').substring(0, 20))}&font=montserrat`,
      addedAt: book.readAt || book.addedAt,
      readAt: book.readAt
    })).sort((a, b) => 
      new Date(b.addedAt) - new Date(a.addedAt)
    );
    
    res.json({
      success: true,
      books,
      total: books.length
    });
    
  } catch (error) {
    console.error('Get user books error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching books'
    });
  }
});

// DELETE /api/users/:userId/books/:bookId - Remove book
router.delete('/:userId/books/:bookId', authenticate, async (req, res) => {
  try {
    const { userId, bookId } = req.params;
    
    if (userId !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized'
      });
    }
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    if (!user.booksRead) {
      user.booksRead = [];
    }
    
    const initialLength = user.booksRead.length;
    user.booksRead = user.booksRead.filter(book => 
      book.bookId !== bookId && book.id !== bookId
    );
    
    if (user.booksRead.length < initialLength) {
      await user.save();
      res.json({
        success: true,
        message: 'Book removed from your profile'
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Book not found in your profile'
      });
    }
    
  } catch (error) {
    console.error('Remove book error:', error);
    res.status(500).json({
      success: false,
      message: 'Error removing book'
    });
  }
});

// ==================== WANT TO READ ENDPOINTS ====================

// GET /api/users/:userId/want-to-read - Get user's want-to-read list
router.get('/:userId/want-to-read', authenticate, async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (userId !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    const wantToRead = (user.wantToRead || []).map(book => ({
      bookId: book.bookId,
      id: book.bookId,
      title: book.title,
      author: book.author,
      cover: book.cover || `https://covers.openlibrary.org/b/olid/${book.bookId}-M.jpg`
    }));
    
    res.json({ success: true, wantToRead, total: wantToRead.length });
  } catch (error) {
    console.error('Get want to read error:', error);
    res.status(500).json({ success: false, message: 'Error fetching want to read list' });
  }
});

// POST /api/users/:userId/want-to-read - Add book to want-to-read list
router.post('/:userId/want-to-read', authenticate, async (req, res) => {
  try {
    const { userId } = req.params;
    const { bookId, bookTitle, bookAuthor, bookCover } = req.body;
    
    if (userId !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }
    
    if (!bookId || !bookTitle) {
      return res.status(400).json({ success: false, message: 'Book ID and Title are required' });
    }
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    if (!user.wantToRead) user.wantToRead = [];
    
    const existingIndex = user.wantToRead.findIndex(book => book.bookId === bookId);
    if (existingIndex !== -1) {
      return res.status(400).json({ success: false, message: 'Book is already in your Want to Read list' });
    }
    
    user.wantToRead.push({
      bookId,
      title: bookTitle,
      author: bookAuthor || 'Unknown Author',
      cover: bookCover
    });
    
    await user.save();
    
    res.json({ success: true, message: 'Book added to Want to Read list' });
  } catch (error) {
    console.error('Add want to read error:', error);
    res.status(500).json({ success: false, message: 'Error adding book to want to read list' });
  }
});

// DELETE /api/users/:userId/want-to-read/:bookId - Remove book from want-to-read list
router.delete('/:userId/want-to-read/:bookId', authenticate, async (req, res) => {
  try {
    const { userId, bookId } = req.params;
    
    if (userId !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    if (!user.wantToRead) user.wantToRead = [];
    
    const initialLength = user.wantToRead.length;
    user.wantToRead = user.wantToRead.filter(book => book.bookId !== bookId);
    
    if (user.wantToRead.length < initialLength) {
      await user.save();
      res.json({ success: true, message: 'Book removed from Want to Read list' });
    } else {
      res.status(404).json({ success: false, message: 'Book not found in Want to Read list' });
    }
  } catch (error) {
    console.error('Remove want to read error:', error);
    res.status(500).json({ success: false, message: 'Error removing book from want to read list' });
  }
});

// ==================== FOLLOW/UNFOLLOW ENDPOINTS ====================

// POST /api/users/:userId/follow - Follow a user
router.post('/:userId/follow', authenticate, async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (userId === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'You cannot follow yourself'
      });
    }
    
    const userToFollow = await User.findById(userId);
    if (!userToFollow) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Check if current user is blocked by the target user
    if (userToFollow.blockedUsers && userToFollow.blockedUsers.some(id => id.toString() === req.user._id.toString())) {
      return res.status(403).json({
        success: false,
        message: 'You cannot follow this user'
      });
    }

    const currentUser = req.user;
    
    if (currentUser.following && currentUser.following.includes(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Already following this user'
      });
    }
    
    if (!currentUser.following) currentUser.following = [];
    currentUser.following.push(userId);
    await currentUser.save();
    
    if (!userToFollow.followers) userToFollow.followers = [];
    userToFollow.followers.push(req.user._id);
    await userToFollow.save();

    // ── Notify the followed user ───────────────────────────────────────────
    try {
      await UNS.onFollow(currentUser, userId);
    } catch (unsErr) {
      console.error('[UNS] onFollow error:', unsErr.message);
    }
    
    res.json({
      success: true,
      message: `You are now following ${userToFollow.name}`
    });
    
  } catch (error) {
    console.error('Follow user error:', error);
    res.status(500).json({
      success: false,
      message: 'Error following user'
    });
  }
});

// POST /api/users/:userId/unfollow - Unfollow a user
router.post('/:userId/unfollow', authenticate, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUser = req.user;

    if (userId === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'You cannot unfollow yourself'
      });
    }
    
    if (currentUser.following) {
      currentUser.following = currentUser.following.filter(id => id.toString() !== userId);
      await currentUser.save();
    }
    
    const userToUnfollow = await User.findById(userId);
    if (userToUnfollow && userToUnfollow.followers) {
      userToUnfollow.followers = userToUnfollow.followers.filter(id => id.toString() !== req.user._id.toString());
      await userToUnfollow.save();

      try {
        await UNS.onUnfollow(currentUser, userId);
      } catch (unsErr) {
        console.error('[UNS] onUnfollow error:', unsErr.message);
      }
    }
    
    res.json({
      success: true,
      message: 'Unfollowed successfully'
    });
    
  } catch (error) {
    console.error('Unfollow user error:', error);
    res.status(500).json({
      success: false,
      message: 'Error unfollowing user'
    });
  }
});

// GET /api/users/:userId/followers - Get user's followers
router.get('/:userId/followers', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId)
      .populate('followers', 'name username profilePicture')
      .select('followers');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.json({
      success: true,
      followers: user.followers || [],
      count: user.followers?.length || 0
    });
    
  } catch (error) {
    console.error('Get followers error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching followers'
    });
  }
});

// GET /api/users/:userId/following - Get users that a user follows
router.get('/:userId/following', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId)
      .populate('following', 'name username profilePicture')
      .select('following');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.json({
      success: true,
      following: user.following || [],
      count: user.following?.length || 0
    });
    
  } catch (error) {
    console.error('Get following error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching following'
    });
  }
});

// ==================== USER STATS ENDPOINTS ====================

// GET /api/users/:userId/stats - Get user statistics
router.get('/:userId/stats', authenticate, async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (userId !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized'
      });
    }
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const allUsers = await User.find({
      _id: { $ne: user._id },
      isBanned: false,
      isSuspended: false
    });
    
    const matchStats = matchService.getMatchStats(user, allUsers);
    
    res.json({
      success: true,
      stats: {
        totalBooksRead: user.booksRead?.length || 0,
        currentlyReading: user.currentlyReading?.length || 0,
        wantToRead: user.wantToRead?.length || 0,
        followers: user.followers?.length || 0,
        following: user.following?.length || 0,
        readingGoal: user.readingGoal,
        readingGoalProgress: user.booksRead?.length ? 
          Math.round((user.booksRead.length / (user.readingGoal || 1)) * 100) : 0,
        matchStats: matchStats
      }
    });
    
  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user stats'
    });
  }
});

module.exports = router;