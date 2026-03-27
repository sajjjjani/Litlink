class MatchService {
  /**
   * Calculate match score between two users
   * @param {Object} userA - Current user
   * @param {Object} userB - Another user to compare with
   * @returns {Object} - Match score and details
   */
  calculateMatchScore(userA, userB) {
    let score = 0;
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

    // Compare favorite genres (Weight: 2 points each)
    if (userA.favoriteGenres && userB.favoriteGenres && 
        Array.isArray(userA.favoriteGenres) && Array.isArray(userB.favoriteGenres)) {
      const commonGenres = userA.favoriteGenres.filter(genre => 
        userB.favoriteGenres.includes(genre)
      );
      details.genreMatch = commonGenres.length;
      details.genreList = commonGenres;
      score += commonGenres.length * 2;
    }

    // Compare favorite authors (Weight: 3 points each)
    if (userA.favoriteAuthors && userB.favoriteAuthors &&
        Array.isArray(userA.favoriteAuthors) && Array.isArray(userB.favoriteAuthors)) {
      const commonAuthors = userA.favoriteAuthors.filter(author => 
        userB.favoriteAuthors.includes(author)
      );
      details.authorMatch = commonAuthors.length;
      details.authorList = commonAuthors;
      score += commonAuthors.length * 3;
    }

    // Compare favorite books (Weight: 5 points each)
    if (userA.favoriteBooks && userB.favoriteBooks &&
        Array.isArray(userA.favoriteBooks) && Array.isArray(userB.favoriteBooks)) {
      const commonBooks = userA.favoriteBooks.filter(book => 
        userB.favoriteBooks.includes(book)
      );
      details.bookMatch = commonBooks.length;
      details.bookList = commonBooks;
      score += commonBooks.length * 5;
    }

    // Compare reading habits (Weight: 3 points if match)
    if (userA.readingHabit && userB.readingHabit && 
        userA.readingHabit === userB.readingHabit) {
      details.readingHabitMatch = 1;
      score += 3;
    }

    // Compare preferred formats (Weight: 1.5 points each)
    if (userA.preferredFormats && userB.preferredFormats &&
        Array.isArray(userA.preferredFormats) && Array.isArray(userB.preferredFormats)) {
      const commonFormats = userA.preferredFormats.filter(format => 
        userB.preferredFormats.includes(format)
      );
      details.formatMatch = commonFormats.length;
      score += commonFormats.length * 1.5;
    }

    details.totalScore = Math.round(score * 10) / 10;
    
    return {
      userId: userB._id,
      username: userB.username || userB.name,
      name: userB.name,
      email: userB.email,
      profilePicture: userB.profilePicture || '📚',
      bio: userB.bio || '',
      location: userB.location || '',
      score: details.totalScore,
      matchPercentage: this.calculatePercentage(score, this.getMaxPossibleScore(userA, userB)),
      details: details
    };
  }

  /**
   * Calculate match percentage
   */
  calculatePercentage(actualScore, maxPossibleScore) {
    if (maxPossibleScore === 0) return 0;
    return Math.min(100, Math.round((actualScore / maxPossibleScore) * 100));
  }

  /**
   * Get maximum possible score for two users
   */
  getMaxPossibleScore(userA, userB) {
    let maxScore = 0;
    
    // Max possible from genres
    const maxGenres = Math.min(
      (userA.favoriteGenres?.length || 0),
      (userB.favoriteGenres?.length || 0)
    );
    maxScore += maxGenres * 2;
    
    // Max possible from authors
    const maxAuthors = Math.min(
      (userA.favoriteAuthors?.length || 0),
      (userB.favoriteAuthors?.length || 0)
    );
    maxScore += maxAuthors * 3;
    
    // Max possible from books
    const maxBooks = Math.min(
      (userA.favoriteBooks?.length || 0),
      (userB.favoriteBooks?.length || 0)
    );
    maxScore += maxBooks * 5;
    
    // Reading habit match
    if (userA.readingHabit && userB.readingHabit) {
      maxScore += 3;
    }
    
    // Preferred formats match
    const maxFormats = Math.min(
      (userA.preferredFormats?.length || 0),
      (userB.preferredFormats?.length || 0)
    );
    maxScore += maxFormats * 1.5;
    
    return maxScore;
  }

  /**
   * Get top matches for a user
   */
  getTopMatches(currentUser, allUsers, limit = 10) {
    const matches = allUsers
      .filter(user => user._id.toString() !== currentUser._id.toString())
      .map(user => this.calculateMatchScore(currentUser, user))
      .sort((a, b) => b.score - a.score);
    
    return matches.slice(0, limit);
  }

  /**
   * Get matches with filters
   */
  getFilteredMatches(currentUser, allUsers, filters = {}) {
    let matches = this.getTopMatches(currentUser, allUsers, 100);
    
    if (filters.minMatchPercentage) {
      matches = matches.filter(m => m.matchPercentage >= filters.minMatchPercentage);
    }
    
    if (filters.genres && filters.genres.length > 0) {
      matches = matches.filter(m => {
        const user = allUsers.find(u => u._id.toString() === m.userId.toString());
        return user && user.favoriteGenres?.some(g => filters.genres.includes(g));
      });
    }
    
    if (filters.authors && filters.authors.length > 0) {
      matches = matches.filter(m => {
        const user = allUsers.find(u => u._id.toString() === m.userId.toString());
        return user && user.favoriteAuthors?.some(a => filters.authors.includes(a));
      });
    }
    
    if (filters.books && filters.books.length > 0) {
      matches = matches.filter(m => {
        const user = allUsers.find(u => u._id.toString() === m.userId.toString());
        return user && user.favoriteBooks?.some(b => filters.books.includes(b));
      });
    }
    
    return matches;
  }

  /**
   * Get match suggestions
   */
  getMatchSuggestions(currentUser, allUsers, limit = 5) {
    const usersWithSimilarInterests = allUsers.filter(user => {
      if (user._id.toString() === currentUser._id.toString()) return false;
      
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
    
    return usersWithSimilarInterests
      .map(user => this.calculateMatchScore(currentUser, user))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Get users by book
   */
  getUsersByBook(currentUser, allUsers, bookTitle, limit = 10) {
    const usersWhoLikeBook = allUsers.filter(user => {
      if (user._id.toString() === currentUser._id.toString()) return false;
      return user.favoriteBooks?.some(book => 
        book.toLowerCase().includes(bookTitle.toLowerCase())
      );
    });
    
    return usersWhoLikeBook
      .map(user => this.calculateMatchScore(currentUser, user))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Get compatibility summary
   */
  getCompatibilitySummary(userA, userB) {
    const match = this.calculateMatchScore(userA, userB);
    
    let compatibilityLevel = 'Low';
    if (match.matchPercentage >= 70) compatibilityLevel = 'Excellent';
    else if (match.matchPercentage >= 50) compatibilityLevel = 'Good';
    else if (match.matchPercentage >= 30) compatibilityLevel = 'Moderate';
    
    const recommendations = [];
    if (match.details.genreMatch === 0 && match.details.authorMatch === 0 && match.details.bookMatch === 0) {
      recommendations.push("You don't share any common interests yet. Try exploring more books!");
    } else {
      if (match.details.genreMatch > 0) {
        recommendations.push(`You both enjoy ${match.details.genreList.join(', ')} genres`);
      }
      if (match.details.authorMatch > 0) {
        recommendations.push(`You share favorite authors: ${match.details.authorList.join(', ')}`);
      }
      if (match.details.bookMatch > 0) {
        recommendations.push(`You both love ${match.details.bookList.join(', ')}`);
      }
    }
    
    return {
      percentage: match.matchPercentage,
      level: compatibilityLevel,
      recommendations: recommendations,
      commonInterests: {
        genres: match.details.genreList,
        authors: match.details.authorList,
        books: match.details.bookList
      }
    };
  }
}

module.exports = new MatchService();