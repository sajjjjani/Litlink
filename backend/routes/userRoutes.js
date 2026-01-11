const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();
const authenticate = require('../middleware/auth');
const User = require('../models/User');

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

// POST /api/users/:userId/books - Add book to user profile
router.post('/:userId/books', authenticate, async (req, res) => {
  try {
    const { userId } = req.params;
    const { bookTitle, bookId } = req.body;
    
    if (userId !== req.userId.toString()) {
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
    
    // Get book cover from Open Library - IMPROVED with multiple strategies
    if (bookId) {
      try {
        // Strategy 1: Try works endpoint first
        let workKey = bookId;
        if (!workKey.startsWith('/works/')) {
          workKey = workKey.startsWith('OL') ? `/works/${workKey}` : `/works/${workKey}`;
        }
        
        const response = await fetch(`https://openlibrary.org${workKey}.json`, {
          signal: AbortSignal.timeout(10000)
        });
        
        if (response.ok) {
          const bookData = await response.json();
          
          // Try covers array first
          if (bookData.covers && bookData.covers.length > 0) {
            const coverId = bookData.covers[0];
            bookCover = `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`;
          }
          
          // Try ISBN 13
          if (!bookCover && bookData.isbn_13 && bookData.isbn_13.length > 0) {
            bookCover = `https://covers.openlibrary.org/b/isbn/${bookData.isbn_13[0]}-M.jpg`;
          }
          
          // Try ISBN 10
          if (!bookCover && bookData.isbn_10 && bookData.isbn_10.length > 0) {
            bookCover = `https://covers.openlibrary.org/b/isbn/${bookData.isbn_10[0]}-M.jpg`;
          }
          
          // Try edition key for cover
          if (!bookCover && bookData.key) {
            const editionKey = bookData.key.replace('/works/', '').replace('OL', 'OL');
            bookCover = `https://covers.openlibrary.org/b/olid/${editionKey}-M.jpg`;
          }
          
          // Get author
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
            
            // Fallback to author name directly
            if (!bookAuthor && authorRef.name) {
              bookAuthor = authorRef.name;
            }
          }
        }
        
        // Strategy 2: Try OLID (Open Library ID) cover URL
        if (!bookCover) {
          const olid = bookId.replace('OL', 'OL').replace(/[^A-Z0-9]/g, '');
          if (olid) {
            const olidUrl = `https://covers.openlibrary.org/b/olid/${olid}-M.jpg`;
            try {
              const testRes = await fetch(olidUrl, { method: 'HEAD', signal: AbortSignal.timeout(3000) });
              if (testRes.ok && testRes.headers.get('content-type')?.includes('image')) {
                bookCover = olidUrl;
              }
            } catch (err) {
              // Continue
            }
          }
        }
        
        // Strategy 3: Try generic cover URL with bookId
        if (!bookCover) {
          const genericUrl = getBookCoverUrl(bookId, null, null);
          if (genericUrl) {
            try {
              const testRes = await fetch(genericUrl, { method: 'HEAD', signal: AbortSignal.timeout(3000) });
              if (testRes.ok && testRes.headers.get('content-type')?.includes('image')) {
                bookCover = genericUrl;
              }
            } catch (err) {
              // Continue
            }
          }
        }
      } catch (error) {
        console.log('Could not fetch book cover from Open Library:', error.message);
      }
    }
    
    // Use placeholder if no cover found
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
    
    // Check if book already exists
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
    
    if (userId !== req.userId.toString()) {
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
    
    if (userId !== req.userId.toString()) {
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

// GET /api/users/:userId/matches - Get user's matches
router.get('/:userId/matches', authenticate, async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (userId !== req.userId.toString()) {
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
    
    // For now, return empty matches array
    // In production, this would match users based on reading preferences
    res.json({
      success: true,
      matches: [],
      total: 0
    });
    
  } catch (error) {
    console.error('Get user matches error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching matches'
    });
  }
});

// GET /api/users/:userId/clubs - Get user's book clubs
router.get('/:userId/clubs', authenticate, async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (userId !== req.userId.toString()) {
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
    
    // For now, return empty clubs array
    // In production, this would return book clubs the user is part of
    res.json({
      success: true,
      clubs: [],
      total: 0
    });
    
  } catch (error) {
    console.error('Get user clubs error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching clubs'
    });
  }
});

module.exports = router;

