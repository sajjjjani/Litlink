const express = require('express');
// Use safe fetch wrapper (Node 18+ global fetch, with node-fetch fallback)
const fetch = require('../utils/fetch');
const router = express.Router();
const authenticate = require('../middleware/auth');

// Cache for API responses
const cache = new Map();

// Helper: Get book cover URL with fallbacks
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

// Helper: Get placeholder image
function getPlaceholderImage(text = 'Book', width = 150, height = 200) {
  const safeText = encodeURIComponent(text.substring(0, 20));
  return `https://placehold.co/${width}x${height}/3d2617/f5e6d3?text=${safeText}&font=montserrat`;
}

// Helper: Format book description
function formatDescription(description) {
  if (!description) return 'No description available.';
  if (typeof description === 'string') return description;
  if (description.value) return description.value;
  return 'No description available.';
}

// Helper: Map genre to Open Library subject
function mapGenreToSubject(genre) {
  const genreMap = {
    'fantasy': 'fantasy',
    'mystery': 'detective_and_mystery_stories',
    'romance': 'love_stories',
    'sci-fi': 'science_fiction',
    'scifi': 'science_fiction',
    'science-fiction': 'science_fiction',
    'horror': 'horror_tales',
    'fiction': 'fiction',
    'non-fiction': 'nonfiction',
    'biography': 'biography',
    'history': 'history',
    'children': 'juvenile_fiction',
    'young-adult': 'young_adult_fiction',
    'young adult': 'young_adult_fiction',
    'thriller': 'thriller',
    'classics': 'classic_literature',
    'poetry': 'poetry',
    'graphic-novels': 'graphic_novels'
  };
  return genreMap[genre.toLowerCase()] || genre.toLowerCase().replace(/\s+/g, '_');
}

// Helper: Fetch genre books from Open Library
async function fetchGenreBooks(genre, limitNum, pageNum) {
  const cacheKey = `popular_${genre}_${limitNum}_${pageNum}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;
  
  const genreSlug = mapGenreToSubject(genre);
  const offset = (pageNum - 1) * limitNum;
  const url = `https://openlibrary.org/subjects/${genreSlug}.json?limit=${limitNum}&offset=${offset}&details=true`;
  
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Litlink/1.0' },
    signal: AbortSignal.timeout(15000)
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  
  const data = await response.json();
  
  const books = (data.works || []).map(work => {
    const workId = work.key ? work.key.replace('/works/', '') : work.cover_edition_key;
    const cover = getBookCoverUrl(workId, work.cover_id, null) || 
                 getPlaceholderImage(work.title || 'Book');
    
    return {
      id: workId || `genre-${Date.now()}`,
      title: work.title || 'Unknown Title',
      cover_id: work.cover_id || work.cover_edition_key,
      cover,
      authors: work.authors ? work.authors.map(a => a.name) : ['Unknown Author'],
      first_publish_year: work.first_publish_year || null,
      description: formatDescription(work.description)?.substring(0, 200) + '...' || 
                  `A popular ${genre} book.`,
      rating: work.ratings_average ? work.ratings_average.toFixed(1) : '4.0',
      rating_count: work.ratings_count || 0
    };
  });
  
  const result = {
    success: true,
    genre,
    total_results: data.work_count || books.length,
    page: pageNum,
    limit: limitNum,
    total_pages: Math.ceil((data.work_count || 0) / limitNum),
    books
  };
  
  cache.set(cacheKey, result);
  setTimeout(() => cache.delete(cacheKey), 30 * 60 * 1000);
  
  return result;
}

// GET /api/books/details/:bookId - Rich book details endpoint
router.get('/details/:bookId', authenticate, async (req, res) => {
  try {
    const { bookId } = req.params;
    const cacheKey = `book_details_${bookId}`;
    
    // Check cache
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }
    
    let bookData = null;
    let authors = [];
    
    // Try works endpoint first
    try {
      const worksResponse = await fetch(`https://openlibrary.org/works/${bookId}.json`, {
        signal: AbortSignal.timeout(10000)
      });
      
      if (worksResponse.ok) {
        bookData = await worksResponse.json();
        
        // Fetch author details
        if (bookData.authors && bookData.authors.length > 0) {
          const authorPromises = bookData.authors.slice(0, 3).map(async (authorRef) => {
            try {
              const authorKey = authorRef.author?.key || authorRef.key;
              if (authorKey) {
                const authorRes = await fetch(`https://openlibrary.org${authorKey}.json`, {
                  signal: AbortSignal.timeout(5000)
                });
                if (authorRes.ok) {
                  const authorData = await authorRes.json();
                  return {
                    name: authorData.name || 'Unknown',
                    bio: authorData.bio ? formatDescription(authorData.bio) : null,
                    birthDate: authorData.birth_date || null,
                    deathDate: authorData.death_date || null
                  };
                }
              }
            } catch (err) {
              return { name: authorRef.name || 'Unknown' };
            }
            return { name: authorRef.name || 'Unknown' };
          });
          
          authors = await Promise.all(authorPromises);
        }
      }
    } catch (error) {
      console.error('Error fetching book details:', error.message);
    }
    
    // Format response
    const formatted = {
      success: true,
      book: {
        id: bookId,
        title: bookData?.title || 'Unknown Title',
        description: formatDescription(bookData?.description),
        cover: getBookCoverUrl(bookId, bookData?.covers?.[0], bookData?.isbn_13?.[0] || bookData?.isbn_10?.[0]) || 
               getPlaceholderImage(bookData?.title || 'Book'),
        authors: authors.length > 0 ? authors : 
                 (bookData?.authors?.map(a => ({ name: a.name || 'Unknown' })) || [{ name: 'Unknown Author' }]),
        firstPublishDate: bookData?.first_publish_date || bookData?.created?.value || null,
        publishDate: bookData?.first_publish_date || null,
        publishers: bookData?.publishers || [],
        isbn10: bookData?.isbn_10?.[0] || null,
        isbn13: bookData?.isbn_13?.[0] || null,
        numberOfPages: bookData?.number_of_pages || null,
        subjects: bookData?.subjects?.slice(0, 5) || [],
        ratings: {
          average: bookData?.ratings_average || null,
          count: bookData?.ratings_count || 0
        },
        languages: bookData?.languages?.map(l => l.key?.replace('/languages/', '') || l) || []
      }
    };
    
    // Cache for 1 hour
    cache.set(cacheKey, formatted);
    setTimeout(() => cache.delete(cacheKey), 60 * 60 * 1000);
    
    res.json(formatted);
    
  } catch (error) {
    console.error('Get book details error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching book details: ' + error.message
    });
  }
});

// GET /api/books/search - Enhanced search with pagination
router.get('/search', authenticate, async (req, res) => {
  try {
    const { query, limit = 40, page = 1 } = req.query;
    
    if (!query || query.trim() === '') {
      return res.json({
        success: true,
        books: [],
        total_results: 0,
        page: 1,
        limit: parseInt(limit),
        total_pages: 0
      });
    }
    
    const cacheKey = `search_${query}_${limit}_${page}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }
    
    try {
      const offset = (page - 1) * limit;
      const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}`;
      
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Litlink/1.0' },
        signal: AbortSignal.timeout(10000)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const searchData = await response.json();
      
      const books = searchData.docs.map(doc => {
        const title = doc.title || 'Unknown Title';
        const authors = doc.author_name || ['Unknown Author'];
        const coverId = doc.cover_i || doc.cover_id;
        const cover = getBookCoverUrl(null, coverId, doc.isbn) || 
                     getPlaceholderImage(title);
        
        let workId = doc.key || '';
        if (workId && workId.startsWith('/works/')) {
          workId = workId.replace('/works/', '');
        }
        
        return {
          id: workId || `search-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          title,
          cover_id: coverId,
          cover,
          authors,
          first_publish_year: doc.first_publish_year || null,
          publisher: doc.publisher ? (Array.isArray(doc.publisher) ? doc.publisher[0] : doc.publisher) : '',
          isbn: doc.isbn ? (Array.isArray(doc.isbn) ? doc.isbn[0] : doc.isbn) : ''
        };
      }).filter(book => book.title !== 'Unknown Title');
      
      const result = {
        success: true,
        query,
        total_results: searchData.numFound || 0,
        page: parseInt(page),
        limit: parseInt(limit),
        total_pages: Math.ceil((searchData.numFound || 0) / limit),
        books
      };
      
      // Cache for 10 minutes
      cache.set(cacheKey, result);
      setTimeout(() => cache.delete(cacheKey), 10 * 60 * 1000);
      
      res.json(result);
      
    } catch (apiError) {
      console.error('Open Library API error:', apiError.message);
      res.json({
        success: true,
        query,
        total_results: 0,
        page: parseInt(page),
        limit: parseInt(limit),
        total_pages: 0,
        books: [],
        message: 'Search service temporarily unavailable'
      });
    }
    
  } catch (error) {
    console.error('Book search error:', error);
    res.status(500).json({
      success: false,
      message: 'Error searching books: ' + error.message
    });
  }
});

// GET /api/books/popular/:genre - Genre books with pagination (200+ books)
router.get('/popular/:genre', async (req, res) => {
  try {
    const { genre } = req.params;
    const { limit = 30, page = 1 } = req.query;
    const limitNum = Math.min(parseInt(limit) || 30, 200); // Max 200 per request
    const pageNum = parseInt(page) || 1;
    
    try {
      const result = await fetchGenreBooks(genre, limitNum, pageNum);
      res.json(result);
    } catch (apiError) {
      console.error(`Genre API error for ${genre}:`, apiError.message);
      res.json({
        success: true,
        genre,
        total_results: 0,
        page: pageNum,
        limit: limitNum,
        total_pages: 0,
        books: [],
        message: 'Genre data temporarily unavailable'
      });
    }
    
  } catch (error) {
    console.error('Popular books error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching popular books: ' + error.message
    });
  }
});

// GET /api/books/genre/:genre - Legacy endpoint (uses same handler as popular)
router.get('/genre/:genre', authenticate, async (req, res) => {
  try {
    const { genre } = req.params;
    const { limit = 200, page = 1 } = req.query;
    const limitNum = Math.min(parseInt(limit) || 200, 200);
    const pageNum = parseInt(page) || 1;
    
    try {
      const result = await fetchGenreBooks(genre, limitNum, pageNum);
      res.json(result);
    } catch (apiError) {
      console.error(`Genre API error for ${genre}:`, apiError.message);
      res.json({
        success: true,
        genre,
        total_results: 0,
        page: pageNum,
        limit: limitNum,
        total_pages: 0,
        books: [],
        message: 'Genre data temporarily unavailable'
      });
    }
    
  } catch (error) {
    console.error('Genre books error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching genre books: ' + error.message
    });
  }
});

// Better approach: just use the same handler
router.get('/genre/:genre', authenticate, async (req, res) => {
  // Reuse popular handler logic
  const genre = req.params.genre;
  req.params.genre = genre;
  // Manually call popular endpoint logic
  const limitNum = Math.min(parseInt(req.query.limit) || 200, 200);
  const pageNum = parseInt(req.query.page) || 1;
  const cacheKey = `popular_${genre}_${limitNum}_${pageNum}`;
  
  const cached = cache.get(cacheKey);
  if (cached) {
    return res.json(cached);
  }
  
  // Use same logic as /popular/:genre
  try {
    const genreSlug = mapGenreToSubject(genre);
    const offset = (pageNum - 1) * limitNum;
    const url = `https://openlibrary.org/subjects/${genreSlug}.json?limit=${limitNum}&offset=${offset}&details=true`;
    
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Litlink/1.0' },
      signal: AbortSignal.timeout(15000)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    
    const books = (data.works || []).map(work => {
      const workId = work.key ? work.key.replace('/works/', '') : work.cover_edition_key;
      const cover = getBookCoverUrl(workId, work.cover_id, null) || 
                   getPlaceholderImage(work.title || 'Book');
      
      return {
        id: workId || `genre-${Date.now()}`,
        title: work.title || 'Unknown Title',
        cover_id: work.cover_id || work.cover_edition_key,
        cover,
        authors: work.authors ? work.authors.map(a => a.name) : ['Unknown Author'],
        first_publish_year: work.first_publish_year || null,
        description: formatDescription(work.description)?.substring(0, 200) + '...' || 
                    `A popular ${genre} book.`,
        rating: work.ratings_average ? work.ratings_average.toFixed(1) : '4.0',
        rating_count: work.ratings_count || 0
      };
    });
    
    const result = {
      success: true,
      genre,
      total_results: data.work_count || books.length,
      page: pageNum,
      limit: limitNum,
      total_pages: Math.ceil((data.work_count || 0) / limitNum),
      books
    };
    
    cache.set(cacheKey, result);
    setTimeout(() => cache.delete(cacheKey), 30 * 60 * 1000);
    
    res.json(result);
    
  } catch (apiError) {
    console.error(`Genre API error for ${genre}:`, apiError.message);
    res.json({
      success: true,
      genre,
      total_results: 0,
      page: pageNum,
      limit: limitNum,
      total_pages: 0,
      books: [],
      message: 'Genre data temporarily unavailable'
    });
  }
});

module.exports = router;

