const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth');
const matchController = require('../controllers/matchController');

// All match routes require authentication
router.use(authenticate);

/**
 * @route   GET /api/matches/matches
 * @desc    Get matches for current user
 * @access  Private
 * @query   limit - Number of matches (default: 10)
 * @query   minMatchPercentage - Minimum match percentage (default: 0)
 */
router.get('/matches', matchController.getMatches);

/**
 * @route   GET /api/matches/matches/:userId
 * @desc    Get match details for a specific user
 * @access  Private
 */
router.get('/matches/:userId', matchController.getMatchDetails);

/**
 * @route   POST /api/matches/matches/filter
 * @desc    Get matches with filters
 * @access  Private
 * @body    minMatchPercentage - Minimum match percentage
 * @body    genres - Array of genres
 * @body    authors - Array of authors
 * @body    books - Array of books
 * @body    limit - Number of matches
 */
router.post('/matches/filter', matchController.getFilteredMatches);

/**
 * @route   GET /api/matches/match-suggestions
 * @desc    Get match suggestions
 * @access  Private
 * @query   limit - Number of suggestions (default: 5)
 */
router.get('/match-suggestions', matchController.getMatchSuggestions);

/**
 * @route   GET /api/matches/matches/by-book/:bookTitle
 * @desc    Get matches by a specific book
 * @access  Private
 * @param   bookTitle - Book title to search
 * @query   limit - Number of matches (default: 10)
 */
router.get('/matches/by-book/:bookTitle', matchController.getMatchesByBook);

/**
 * @route   GET /api/matches/global
 * @desc    Get global top matches
 * @access  Private
 * @query   limit - Number of matches (default: 20)
 */
router.get('/global', matchController.getGlobalMatches);

/**
 * @route   PUT /api/matches/preferences
 * @desc    Update user preferences
 * @access  Private
 * @body    favoriteGenres - Array of genres
 * @body    favoriteAuthors - Array of authors
 * @body    favoriteBooks - Array of books
 * @body    readingHabit - Reading habit
 * @body    preferredFormats - Array of formats
 */
router.put('/preferences', matchController.updatePreferences);

/**
 * @route   GET /api/matches/:userId
 * @desc    Get AI matches for a user via FastAPI service
 * @access  Private
 * @param   userId - User ID
 */
router.get('/:userId', matchController.getAIMatches);

module.exports = router;