class MatchService {
  /**
   * Calculate match score between two users
   * Enhanced with weighted scoring and normalization
   */
  calculateMatchScore(userA, userB) {
    let score = 0;
    let maxPossibleScore = 0;
    
    let details = {
      genreMatch: 0,
      authorMatch: 0,
      bookMatch: 0,
      readingHabitMatch: 0,
      formatMatch: 0,
      genreList: [],
      authorList: [],
      bookList: []
    };

    // ===== 1. GENRES (Weight: 2 points each, max 20) =====
    const genresA = userA.favoriteGenres || [];
    const genresB = userB.favoriteGenres || [];
    
    if (genresA.length > 0 && genresB.length > 0) {
      const commonGenres = genresA.filter(genre => genresB.includes(genre));
      details.genreMatch = commonGenres.length;
      details.genreList = commonGenres;
      
      // Weight: 2 points per genre
      const genreScore = commonGenres.length * 2;
      score += genreScore;
      
      // Max possible from genres (max 10 genres * 2 = 20)
      maxPossibleScore += Math.min(genresA.length, genresB.length) * 2;
    }

    // ===== 2. AUTHORS (Weight: 3 points each, max 30) =====
    const authorsA = userA.favoriteAuthors || [];
    const authorsB = userB.favoriteAuthors || [];
    
    if (authorsA.length > 0 && authorsB.length > 0) {
      const commonAuthors = authorsA.filter(author => authorsB.includes(author));
      details.authorMatch = commonAuthors.length;
      details.authorList = commonAuthors;
      
      const authorScore = commonAuthors.length * 3;
      score += authorScore;
      
      maxPossibleScore += Math.min(authorsA.length, authorsB.length) * 3;
    }

    // ===== 3. BOOKS (Weight: 5 points each, max 50) =====
    const booksA = userA.favoriteBooks || [];
    const booksB = userB.favoriteBooks || [];
    
    if (booksA.length > 0 && booksB.length > 0) {
      const commonBooks = booksA.filter(book => booksB.includes(book));
      details.bookMatch = commonBooks.length;
      details.bookList = commonBooks;
      
      const bookScore = commonBooks.length * 5;
      score += bookScore;
      
      maxPossibleScore += Math.min(booksA.length, booksB.length) * 5;
    }

    // ===== 4. READING HABIT (Weight: 5 points if match) =====
    if (userA.readingHabit && userB.readingHabit && 
        userA.readingHabit === userB.readingHabit) {
      details.readingHabitMatch = 1;
      score += 5;
      maxPossibleScore += 5;
    }

    // ===== 5. PREFERRED FORMATS (Weight: 1.5 points each) =====
    const formatsA = userA.preferredFormats || [];
    const formatsB = userB.preferredFormats || [];
    
    if (formatsA.length > 0 && formatsB.length > 0) {
      const commonFormats = formatsA.filter(format => formatsB.includes(format));
      details.formatMatch = commonFormats.length;
      score += commonFormats.length * 1.5;
      maxPossibleScore += Math.min(formatsA.length, formatsB.length) * 1.5;
    }

    // ===== 6. BONUS: Similar reading goals (Weight: 3 points) =====
    if (userA.readingGoal && userB.readingGoal) {
      const goalDiff = Math.abs(userA.readingGoal - userB.readingGoal);
      if (goalDiff <= 10) {
        score += 3;
        maxPossibleScore += 3;
      }
    }

    // ===== 7. BONUS: Location similarity (Weight: 2 points) =====
    if (userA.location && userB.location && userA.location === userB.location) {
      score += 2;
      maxPossibleScore += 2;
    }

    // Calculate final match details
    const totalScore = Math.round(score * 10) / 10;
    const matchPercentage = maxPossibleScore > 0 
      ? Math.min(100, Math.round((score / maxPossibleScore) * 100))
      : 0;
    
    return {
      userId: userB._id,
      username: userB.username || userB.name,
      name: userB.name,
      email: userB.email,
      profilePicture: userB.profilePicture || '📚',
      bio: userB.bio || '',
      location: userB.location || '',
      score: totalScore,
      maxPossibleScore: Math.round(maxPossibleScore * 10) / 10,
      matchPercentage: matchPercentage,
      details: details
    };
  }

  /**
   * Get top matches with pagination and filtering
   */
  getTopMatches(currentUser, allUsers, limit = 10, minPercentage = 0) {
    // Calculate scores for all users
    const matches = allUsers
      .filter(user => {
        // Exclude self
        if (user._id.toString() === currentUser._id.toString()) return false;
        // Exclude banned/suspended users
        if (user.isBanned || user.isSuspended) return false;
        return true;
      })
      .map(user => this.calculateMatchScore(currentUser, user))
      .filter(match => match.matchPercentage >= minPercentage)
      .sort((a, b) => {
        // Sort by percentage first, then by score
        if (b.matchPercentage !== a.matchPercentage) {
          return b.matchPercentage - a.matchPercentage;
        }
        return b.score - a.score;
      });
    
    return matches.slice(0, limit);
  }

  /**
   * Get personalized match suggestions
   */
  getMatchSuggestions(currentUser, allUsers, limit = 5) {
    // Find users with at least one common interest
    const usersWithSimilarInterests = allUsers.filter(user => {
      if (user._id.toString() === currentUser._id.toString()) return false;
      if (user.isBanned || user.isSuspended) return false;
      
      const hasCommonGenre = user.favoriteGenres?.some(g => 
        currentUser.favoriteGenres?.includes(g)
      );
      const hasCommonAuthor = user.favoriteAuthors?.some(a => 
        currentUser.favoriteAuthors?.includes(a)
      );
      const hasCommonBook = user.favoriteBooks?.some(b => 
        currentUser.favoriteBooks?.includes(b)
      );
      
      return hasCommonGenre || hasCommonAuthor || hasCommonBook;
    });
    
    // Calculate scores and sort
    return usersWithSimilarInterests
      .map(user => this.calculateMatchScore(currentUser, user))
      .sort((a, b) => b.matchPercentage - a.matchPercentage)
      .slice(0, limit);
  }

  /**
   * Find users by specific book
   */
  getUsersByBook(currentUser, allUsers, bookTitle, limit = 10) {
    const bookLower = bookTitle.toLowerCase();
    
    const usersWhoLikeBook = allUsers.filter(user => {
      if (user._id.toString() === currentUser._id.toString()) return false;
      if (user.isBanned || user.isSuspended) return false;
      
      return user.favoriteBooks?.some(book => 
        book.toLowerCase().includes(bookLower)
      );
    });
    
    return usersWhoLikeBook
      .map(user => this.calculateMatchScore(currentUser, user))
      .sort((a, b) => b.matchPercentage - a.matchPercentage)
      .slice(0, limit);
  }

  /**
   * Get compatibility summary for two users
   */
  getCompatibilitySummary(userA, userB) {
    const match = this.calculateMatchScore(userA, userB);
    
    // Determine compatibility level
    let compatibilityLevel = 'Low';
    let color = '#ef4444'; // red
    let icon = '😕';
    
    if (match.matchPercentage >= 80) {
      compatibilityLevel = 'Perfect Match!';
      color = '#10b981'; // green
      icon = '🔥';
    } else if (match.matchPercentage >= 70) {
      compatibilityLevel = 'Excellent';
      color = '#3b82f6'; // blue
      icon = '✨';
    } else if (match.matchPercentage >= 50) {
      compatibilityLevel = 'Good';
      color = '#f59e0b'; // orange
      icon = '📚';
    } else if (match.matchPercentage >= 30) {
      compatibilityLevel = 'Moderate';
      color = '#8b5cf6'; // purple
      icon = '🤝';
    } else {
      compatibilityLevel = 'Low';
      color = '#6b7280'; // gray
      icon = '🌱';
    }
    
    // Generate recommendations
    const recommendations = [];
    
    if (match.details.genreMatch === 0 && match.details.authorMatch === 0 && match.details.bookMatch === 0) {
      recommendations.push("You don't share any common interests yet. Try exploring more books to find better matches!");
    } else {
      if (match.details.genreMatch > 0) {
        recommendations.push(`📚 You both enjoy ${match.details.genreList.join(', ')} genres`);
      }
      if (match.details.authorMatch > 0) {
        recommendations.push(`✍️ You share favorite authors: ${match.details.authorList.join(', ')}`);
      }
      if (match.details.bookMatch > 0) {
        recommendations.push(`📖 You both love ${match.details.bookList.join(', ')}`);
      }
      if (match.details.readingHabitMatch) {
        recommendations.push(`⏰ You have similar reading habits (${userA.readingHabit})`);
      }
    }
    
    // Add tips based on match percentage
    if (match.matchPercentage < 30) {
      recommendations.push("💡 Tip: Add more books and genres to your profile to find better matches!");
    } else if (match.matchPercentage >= 80) {
      recommendations.push("🎉 Amazing match! You two would definitely enjoy reading together!");
    }
    
    return {
      percentage: match.matchPercentage,
      level: compatibilityLevel,
      color: color,
      icon: icon,
      recommendations: recommendations.slice(0, 3), // Max 3 recommendations
      commonInterests: {
        genres: match.details.genreList,
        authors: match.details.authorList,
        books: match.details.bookList
      }
    };
  }

  /**
   * Get match statistics for dashboard
   */
  getMatchStats(currentUser, allUsers) {
    const matches = this.getTopMatches(currentUser, allUsers, 100);
    
    if (matches.length === 0) {
      return {
        totalMatches: 0,
        averageCompatibility: 0,
        topGenre: null,
        topAuthor: null,
        topBook: null,
        matchDistribution: {
          excellent: 0,
          good: 0,
          moderate: 0,
          low: 0
        }
      };
    }
    
    // Calculate average compatibility
    const avgCompatibility = matches.reduce((sum, m) => sum + m.matchPercentage, 0) / matches.length;
    
    // Count match distribution
    const distribution = {
      excellent: matches.filter(m => m.matchPercentage >= 70).length,
      good: matches.filter(m => m.matchPercentage >= 50 && m.matchPercentage < 70).length,
      moderate: matches.filter(m => m.matchPercentage >= 30 && m.matchPercentage < 50).length,
      low: matches.filter(m => m.matchPercentage < 30).length
    };
    
    // Find most common genres among matches
    const genreCounts = new Map();
    const authorCounts = new Map();
    const bookCounts = new Map();
    
    matches.forEach(match => {
      match.details.genreList.forEach(genre => {
        genreCounts.set(genre, (genreCounts.get(genre) || 0) + 1);
      });
      match.details.authorList.forEach(author => {
        authorCounts.set(author, (authorCounts.get(author) || 0) + 1);
      });
      match.details.bookList.forEach(book => {
        bookCounts.set(book, (bookCounts.get(book) || 0) + 1);
      });
    });
    
    const topGenre = genreCounts.size > 0 
      ? Array.from(genreCounts.entries()).sort((a, b) => b[1] - a[1])[0][0]
      : null;
    
    const topAuthor = authorCounts.size > 0
      ? Array.from(authorCounts.entries()).sort((a, b) => b[1] - a[1])[0][0]
      : null;
    
    const topBook = bookCounts.size > 0
      ? Array.from(bookCounts.entries()).sort((a, b) => b[1] - a[1])[0][0]
      : null;
    
    return {
      totalMatches: matches.length,
      averageCompatibility: Math.round(avgCompatibility),
      topGenre,
      topAuthor,
      topBook,
      matchDistribution: distribution
    };
  }
}

module.exports = new MatchService();