const express = require('express');
const User = require('../models/User');
const router = express.Router();

// Get user profile
router.get('/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId)
      .populate('followers', 'name username profilePicture')
      .populate('following', 'name username profilePicture');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
        profilePicture: user.profilePicture,
        bio: user.bio,
        location: user.location,
        pronouns: user.pronouns,
        favoriteGenres: user.favoriteGenres,
        favoriteAuthors: user.favoriteAuthors,
        favoriteBooks: user.favoriteBooks,
        readingHabit: user.readingHabit,
        readingGoal: user.readingGoal,
        stats: {
          booksRead: user.booksRead.length,
          following: user.following.length,
          followers: user.followers.length
        },
        bookshelf: {
          currentlyReading: user.currentlyReading,
          wantToRead: user.wantToRead,
          read: user.booksRead
        }
      }
    });
    
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Update user profile
router.put('/:userId', async (req, res) => {
  try {
    const { name, username, bio, location, pronouns, profilePicture } = req.body;
    
    const user = await User.findByIdAndUpdate(
      req.params.userId,
      {
        name,
        username,
        bio,
        location,
        pronouns,
        profilePicture
      },
      { new: true }
    );
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        name: user.name,
        username: user.username,
        bio: user.bio,
        location: user.location,
        pronouns: user.pronouns,
        profilePicture: user.profilePicture
      }
    });
    
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

module.exports = router;