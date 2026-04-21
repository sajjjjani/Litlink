const User = require('../models/User');
const matchService = require('../services/matchService');

class MatchController {
  constructor() {
    // Express passes handlers as plain callbacks, so bind instance methods
    // once to preserve `this` for internal helper calls.
    this.getMatches = this.getMatches.bind(this);
    this.getMatchDetails = this.getMatchDetails.bind(this);
    this.getFilteredMatches = this.getFilteredMatches.bind(this);
    this.getMatchSuggestions = this.getMatchSuggestions.bind(this);
    this.getMatchesByBook = this.getMatchesByBook.bind(this);
    this.getGlobalMatches = this.getGlobalMatches.bind(this);
    this.updatePreferences = this.updatePreferences.bind(this);
    this.getMatchStats = this.getMatchStats.bind(this);
  }

  /**
   * Get matches for current user
   */
  async getMatches(req, res) {
    try {
      const currentUser = req.user;
      const limit = parseInt(req.query.limit) || 10;
      const minMatchPercentage = parseInt(req.query.minMatchPercentage) || 0;
      
      console.log(`📊 Getting matches for: ${currentUser.name} (ID: ${currentUser._id})`);
      
      // Get all active users
      const allUsers = await User.find({
        _id: { $ne: currentUser._id },
        isBanned: false,
        isSuspended: false
      }).select('-password -resetToken -resetTokenExpiry -verificationCode -verificationExpiry');
      
      console.log(`📚 Found ${allUsers.length} potential matches`);
      
      // Get top matches
      let topMatches = matchService.getTopMatches(currentUser, allUsers, limit, minMatchPercentage);
      
      // Add user details and compatibility
      const matchesWithDetails = await Promise.all(
        topMatches.map(async (match) => {
          const user = await User.findById(match.userId)
            .select('name username profilePicture bio favoriteGenres favoriteAuthors favoriteBooks location readingHabit readingGoal');
          
          return {
            ...match,
            userDetails: user,
            compatibility: matchService.getCompatibilitySummary(currentUser, user)
          };
        })
      );
      
      // Get match stats
      const stats = matchService.getMatchStats(currentUser, allUsers);
      
      res.json({
        success: true,
        matches: matchesWithDetails,
        total: matchesWithDetails.length,
        stats: stats,
        filters: { limit, minMatchPercentage },
        userInterests: {
          genres: currentUser.favoriteGenres || [],
          authors: currentUser.favoriteAuthors || [],
          books: currentUser.favoriteBooks || [],
          readingHabit: currentUser.readingHabit,
          preferredFormats: currentUser.preferredFormats
        }
      });
      
    } catch (error) {
      console.error('❌ Error getting matches:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching matches',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Get match details for a specific user
   */
  async getMatchDetails(req, res) {
    try {
      const currentUser = req.user;
      const otherUserId = req.params.userId;
      
      const otherUser = await User.findById(otherUserId)
        .select('-password -resetToken -resetTokenExpiry -verificationCode -verificationExpiry');
      
      if (!otherUser) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
      
      const matchDetails = matchService.calculateMatchScore(currentUser, otherUser);
      const compatibility = matchService.getCompatibilitySummary(currentUser, otherUser);
      
      // Find common interests
      const commonBooks = currentUser.favoriteBooks?.filter(book => 
        otherUser.favoriteBooks?.includes(book)
      ) || [];
      
      const commonAuthors = currentUser.favoriteAuthors?.filter(author => 
        otherUser.favoriteAuthors?.includes(author)
      ) || [];
      
      const commonGenres = currentUser.favoriteGenres?.filter(genre => 
        otherUser.favoriteGenres?.includes(genre)
      ) || [];
      
      // Calculate reading goal similarity
      let readingGoalMatch = false;
      if (currentUser.readingGoal && otherUser.readingGoal) {
        const goalDiff = Math.abs(currentUser.readingGoal - otherUser.readingGoal);
        readingGoalMatch = goalDiff <= 10;
      }
      
      res.json({
        success: true,
        match: {
          ...matchDetails,
          compatibility,
          user: {
            _id: otherUser._id,
            name: otherUser.name,
            username: otherUser.username,
            profilePicture: otherUser.profilePicture,
            bio: otherUser.bio,
            location: otherUser.location,
            readingHabit: otherUser.readingHabit,
            readingGoal: otherUser.readingGoal,
            favoriteGenres: otherUser.favoriteGenres,
            favoriteAuthors: otherUser.favoriteAuthors,
            favoriteBooks: otherUser.favoriteBooks,
            booksRead: otherUser.booksRead?.length || 0,
            currentlyReading: otherUser.currentlyReading?.length || 0,
            followers: otherUser.followers?.length || 0,
            following: otherUser.following?.length || 0
          },
          commonInterests: {
            genres: commonGenres,
            authors: commonAuthors,
            books: commonBooks,
            readingGoalMatch: readingGoalMatch,
            total: commonGenres.length + commonAuthors.length + commonBooks.length
          },
          recommendations: this.generateRecommendations(currentUser, otherUser, commonGenres, commonAuthors, commonBooks)
        }
      });
      
    } catch (error) {
      console.error('❌ Error getting match details:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching match details',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Generate personalized recommendations based on match
   */
  generateRecommendations(currentUser, otherUser, commonGenres, commonAuthors, commonBooks) {
    const recommendations = [];
    
    if (commonGenres.length > 0) {
      recommendations.push({
        type: 'genre',
        message: `You both enjoy ${commonGenres.slice(0, 3).join(', ')}. Why not discuss your favorite books in these genres?`,
        action: 'Start a discussion'
      });
    }
    
    if (commonAuthors.length > 0) {
      recommendations.push({
        type: 'author',
        message: `You share ${commonAuthors.length} favorite author${commonAuthors.length > 1 ? 's' : ''}. Ask ${otherUser.name} which ${commonAuthors[0]} book they recommend!`,
        action: 'Send a message'
      });
    }
    
    if (commonBooks.length > 0) {
      recommendations.push({
        type: 'book',
        message: `You both love ${commonBooks[0]}. Compare your thoughts on the characters and plot!`,
        action: 'Discuss now'
      });
    }
    
    if (recommendations.length === 0) {
      recommendations.push({
        type: 'suggestion',
        message: `You haven't found common interests yet. Why not ask ${otherUser.name} about their favorite books?`,
        action: 'Start conversation'
      });
    }
    
    return recommendations;
  }

  /**
   * Get filtered matches
   */
  async getFilteredMatches(req, res) {
    try {
      const currentUser = req.user;
      const { minMatchPercentage, genres, authors, books, limit = 10 } = req.body;
      
      const allUsers = await User.find({
        _id: { $ne: currentUser._id },
        isBanned: false,
        isSuspended: false
      }).select('-password');
      
      let matches = matchService.getTopMatches(currentUser, allUsers, 100);
      
      // Apply filters
      if (minMatchPercentage) {
        matches = matches.filter(m => m.matchPercentage >= minMatchPercentage);
      }
      
      if (genres && genres.length > 0) {
        matches = matches.filter(m => {
          const user = allUsers.find(u => u._id.toString() === m.userId.toString());
          return user && user.favoriteGenres?.some(g => genres.includes(g));
        });
      }
      
      if (authors && authors.length > 0) {
        matches = matches.filter(m => {
          const user = allUsers.find(u => u._id.toString() === m.userId.toString());
          return user && user.favoriteAuthors?.some(a => authors.includes(a));
        });
      }
      
      if (books && books.length > 0) {
        matches = matches.filter(m => {
          const user = allUsers.find(u => u._id.toString() === m.userId.toString());
          return user && user.favoriteBooks?.some(b => books.includes(b));
        });
      }
      
      matches = matches.slice(0, limit);
      
      const matchesWithDetails = await Promise.all(
        matches.map(async (match) => {
          const user = await User.findById(match.userId)
            .select('name username profilePicture bio favoriteGenres favoriteAuthors');
          return { ...match, userDetails: user };
        })
      );
      
      res.json({
        success: true,
        matches: matchesWithDetails,
        total: matchesWithDetails.length,
        filters: { minMatchPercentage, genres, authors, books }
      });
      
    } catch (error) {
      console.error('❌ Error getting filtered matches:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching filtered matches',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Get match suggestions
   */
  async getMatchSuggestions(req, res) {
    try {
      const currentUser = req.user;
      const limit = parseInt(req.query.limit) || 5;
      
      const allUsers = await User.find({
        _id: { $ne: currentUser._id },
        isBanned: false,
        isSuspended: false
      }).select('-password');
      
      const suggestions = matchService.getMatchSuggestions(currentUser, allUsers, limit);
      
      const suggestionsWithDetails = await Promise.all(
        suggestions.map(async (suggestion) => {
          const user = await User.findById(suggestion.userId)
            .select('name username profilePicture bio favoriteGenres favoriteAuthors favoriteBooks');
          
          // Generate a friendly reason
          let reason = "Similar reading interests";
          if (suggestion.details.bookMatch > 0) {
            reason = `Also loves ${suggestion.details.bookList[0]}`;
          } else if (suggestion.details.authorMatch > 0) {
            reason = `Shares favorite author: ${suggestion.details.authorList[0]}`;
          } else if (suggestion.details.genreMatch > 0) {
            reason = `Enjoys ${suggestion.details.genreList[0]} books too`;
          }
          
          return { 
            ...suggestion, 
            userDetails: user, 
            reason,
            compatibilityLevel: this.getCompatibilityLevel(suggestion.matchPercentage)
          };
        })
      );
      
      res.json({
        success: true,
        suggestions: suggestionsWithDetails,
        total: suggestionsWithDetails.length
      });
      
    } catch (error) {
      console.error('❌ Error getting suggestions:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching match suggestions',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
  
  getCompatibilityLevel(percentage) {
    if (percentage >= 80) return 'Excellent';
    if (percentage >= 60) return 'Very Good';
    if (percentage >= 40) return 'Good';
    if (percentage >= 20) return 'Moderate';
    return 'Low';
  }

  /**
   * Get matches by book
   */
  async getMatchesByBook(req, res) {
    try {
      const currentUser = req.user;
      const { bookTitle } = req.params;
      const limit = parseInt(req.query.limit) || 10;
      
      if (!bookTitle) {
        return res.status(400).json({
          success: false,
          message: 'Book title is required'
        });
      }
      
      const allUsers = await User.find({
        _id: { $ne: currentUser._id },
        isBanned: false,
        isSuspended: false
      }).select('-password');
      
      const matches = matchService.getUsersByBook(currentUser, allUsers, bookTitle, limit);
      
      res.json({
        success: true,
        bookTitle,
        matches,
        total: matches.length
      });
      
    } catch (error) {
      console.error('❌ Error getting matches by book:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching matches by book',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Get global matches (top overall)
   */
  async getGlobalMatches(req, res) {
    try {
      const currentUser = req.user;
      const limit = parseInt(req.query.limit) || 20;
      
      const allUsers = await User.find({
        _id: { $ne: currentUser._id },
        isBanned: false,
        isSuspended: false,
        $or: [
          { favoriteGenres: { $exists: true, $ne: [] } },
          { favoriteBooks: { $exists: true, $ne: [] } }
        ]
      })
      .select('-password')
      .limit(limit);
      
      const matches = allUsers.map(user => 
        matchService.calculateMatchScore(currentUser, user)
      ).sort((a, b) => b.matchPercentage - a.matchPercentage);
      
      res.json({
        success: true,
        matches,
        total: matches.length
      });
      
    } catch (error) {
      console.error('❌ Error getting global matches:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching global matches',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Update user preferences
   */
  async updatePreferences(req, res) {
    try {
      const currentUser = req.user;
      const { favoriteGenres, favoriteAuthors, favoriteBooks, readingHabit, preferredFormats } = req.body;
      
      const updatedUser = await User.findByIdAndUpdate(
        currentUser._id,
        {
          $set: {
            favoriteGenres: favoriteGenres || currentUser.favoriteGenres,
            favoriteAuthors: favoriteAuthors || currentUser.favoriteAuthors,
            favoriteBooks: favoriteBooks || currentUser.favoriteBooks,
            readingHabit: readingHabit || currentUser.readingHabit,
            preferredFormats: preferredFormats || currentUser.preferredFormats
          }
        },
        { new: true }
      ).select('-password');
      
      console.log(`✅ Updated preferences for ${updatedUser.name}`);
      
      res.json({
        success: true,
        message: 'Preferences updated successfully',
        user: updatedUser
      });
      
    } catch (error) {
      console.error('❌ Error updating preferences:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating preferences',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Get match statistics for dashboard
   */
  async getMatchStats(req, res) {
    try {
      const currentUser = req.user;
      
      const allUsers = await User.find({
        _id: { $ne: currentUser._id },
        isBanned: false,
        isSuspended: false
      }).select('favoriteGenres favoriteAuthors favoriteBooks readingHabit readingGoal');
      
      const stats = matchService.getMatchStats(currentUser, allUsers);
      
      res.json({
        success: true,
        stats: stats,
        yourPreferences: {
          genres: currentUser.favoriteGenres || [],
          authors: currentUser.favoriteAuthors || [],
          books: currentUser.favoriteBooks || [],
          readingHabit: currentUser.readingHabit,
          readingGoal: currentUser.readingGoal
        }
      });
      
    } catch (error) {
      console.error('❌ Error getting match stats:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching match statistics',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
}

module.exports = new MatchController();