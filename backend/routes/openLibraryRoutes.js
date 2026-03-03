const express = require('express');
const router = express.Router();
const axios = require('axios');

// Simple in-memory cache
const cache = new Map();

// Cache TTL in milliseconds (1 hour)
const CACHE_TTL = 60 * 60 * 1000;

// Helper function to get cached data
function getCached(key) {
    const cached = cache.get(key);
    if (cached && Date.now() < cached.expiry) {
        return cached.data;
    }
    return null;
}

// Helper function to set cached data
function setCached(key, data, ttl = CACHE_TTL) {
    cache.set(key, {
        data,
        expiry: Date.now() + ttl
    });
}

// Search books
router.get('/search', async (req, res) => {
    try {
        const { q, limit = 10, page = 1 } = req.query;
        if (!q) {
            return res.status(400).json({ success: false, message: 'Search query required' });
        }

        const offset = (page - 1) * limit;
        const response = await axios.get(`https://openlibrary.org/search.json`, {
            params: {
                q,
                limit,
                offset
            }
        });

        const books = response.data.docs.map(book => ({
            id: book.key?.split('/').pop(),
            key: book.key,
            title: book.title,
            author: book.author_name?.[0] || 'Unknown Author',
            coverId: book.cover_i,
            coverUrl: book.cover_i ? `https://covers.openlibrary.org/b/id/${book.cover_i}-M.jpg` : null,
            firstPublishYear: book.first_publish_year,
            ratingsAverage: book.ratings_average,
            ratingsCount: book.ratings_count
        }));

        res.json({
            success: true,
            data: books,
            total: response.data.numFound,
            page: parseInt(page),
            totalPages: Math.ceil(response.data.numFound / limit)
        });
    } catch (error) {
        console.error('Open Library search error:', error);
        res.status(500).json({ success: false, message: 'Failed to search books' });
    }
});

// Get book details by ID
router.get('/works/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Check cache first
        const cacheKey = `work_${id}`;
        const cached = getCached(cacheKey);
        if (cached) {
            return res.json({ success: true, data: cached });
        }

        // Fetch work details
        const workResponse = await axios.get(`https://openlibrary.org/works/${id}.json`);
        const workData = workResponse.data;

        // Fetch ratings if available
        let ratingsData = null;
        try {
            const ratingsResponse = await axios.get(`https://openlibrary.org/works/${id}/ratings.json`);
            ratingsData = ratingsResponse.data;
        } catch (e) {
            // Ratings not available
        }

        // Fetch author details if available
        let authorData = null;
        if (workData.authors && workData.authors[0]?.author?.key) {
            try {
                const authorResponse = await axios.get(`https://openlibrary.org${workData.authors[0].author.key}.json`);
                authorData = authorResponse.data;
            } catch (e) {
                // Author details not available
            }
        }

        // Fetch editions for ISBN
        let editionsData = null;
        try {
            const editionsResponse = await axios.get(`https://openlibrary.org/works/${id}/editions.json?limit=1`);
            editionsData = editionsResponse.data;
        } catch (e) {
            // Editions not available
        }

        // Format the response
        const bookData = {
            id,
            title: workData.title || 'Unknown Title',
            description: workData.description?.value || workData.description || 'No description available',
            covers: workData.covers || [],
            coverUrl: workData.covers?.[0] ? `https://covers.openlibrary.org/b/id/${workData.covers[0]}-L.jpg` : null,
            firstPublishYear: workData.first_publish_year,
            authors: workData.authors?.map(a => ({
                key: a.author?.key,
                name: 'Loading...'
            })) || [],
            authorDetails: authorData ? {
                name: authorData.name,
                birthDate: authorData.birth_date,
                bio: authorData.bio?.value || authorData.bio
            } : null,
            subjects: workData.subjects?.slice(0, 20) || [],
            subjectPlaces: workData.subject_places || [],
            subjectPeople: workData.subject_people || [],
            subjectTimes: workData.subject_times || [],
            ratings: ratingsData ? {
                average: ratingsData.summary?.average,
                count: ratingsData.summary?.count
            } : null,
            languages: workData.languages?.map(l => l.key.split('/').pop()) || ['en'],
            pagination: workData.pagination,
            numberOfPages: workData.number_of_pages,
            isbn: editionsData?.entries?.[0]?.isbn_13?.[0] || editionsData?.entries?.[0]?.isbn_10?.[0] || null
        };

        // Cache the result
        setCached(cacheKey, bookData);

        res.json({ success: true, data: bookData });
    } catch (error) {
        console.error('Open Library work fetch error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch book details' });
    }
});

// Get books by subject/genre
router.get('/subjects/:subject', async (req, res) => {
    try {
        const { subject } = req.params;
        const { limit = 20, offset = 0 } = req.query;

        // Check cache
        const cacheKey = `subject_${subject}_${limit}_${offset}`;
        const cached = getCached(cacheKey);
        if (cached) {
            return res.json({ success: true, data: cached });
        }

        const response = await axios.get(`https://openlibrary.org/subjects/${subject}.json`, {
            params: { limit, offset }
        });

        const data = {
            name: response.data.name,
            workCount: response.data.work_count,
            works: response.data.works?.map(work => ({
                key: work.key,
                id: work.key.split('/').pop(),
                title: work.title,
                author: work.authors?.[0]?.name || 'Unknown Author',
                coverId: work.cover_id,
                coverUrl: work.cover_id ? `https://covers.openlibrary.org/b/id/${work.cover_id}-M.jpg` : null,
                firstPublishYear: work.first_publish_year,
                ratingsAverage: work.ratings_average,
                ratingsCount: work.ratings_count
            })) || []
        };

        setCached(cacheKey, data);

        res.json({ success: true, data });
    } catch (error) {
        console.error('Open Library subject fetch error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch genre books' });
    }
});

// Get multiple subjects at once (for dashboard)
router.post('/subjects/batch', async (req, res) => {
    try {
        const { subjects } = req.body;
        if (!subjects || !Array.isArray(subjects)) {
            return res.status(400).json({ success: false, message: 'Subjects array required' });
        }

        const results = {};
        
        await Promise.all(subjects.map(async (subject) => {
            try {
                const cacheKey = `subject_${subject}_3_0`;
                const cached = getCached(cacheKey);
                
                if (cached) {
                    results[subject] = cached;
                    return;
                }

                const response = await axios.get(`https://openlibrary.org/subjects/${subject}.json`, {
                    params: { limit: 3 }
                });

                results[subject] = {
                    name: response.data.name,
                    workCount: response.data.work_count,
                    works: response.data.works?.map(work => ({
                        key: work.key,
                        id: work.key.split('/').pop(),
                        title: work.title,
                        author: work.authors?.[0]?.name || 'Unknown Author',
                        coverId: work.cover_id,
                        coverUrl: work.cover_id ? `https://covers.openlibrary.org/b/id/${work.cover_id}-S.jpg` : null,
                        firstPublishYear: work.first_publish_year
                    })) || []
                };

                setCached(cacheKey, results[subject]);
            } catch (error) {
                console.error(`Error fetching subject ${subject}:`, error.message);
                results[subject] = { error: true, works: [] };
            }
        }));

        res.json({ success: true, data: results });
    } catch (error) {
        console.error('Batch subject fetch error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch genre books' });
    }
});

// Get trending books (by subject)
router.get('/trending/:subject', async (req, res) => {
    try {
        const { subject } = req.params;
        const { limit = 5 } = req.query;

        const cacheKey = `trending_${subject}_${limit}`;
        const cached = getCached(cacheKey);
        if (cached) {
            return res.json({ success: true, data: cached });
        }

        const response = await axios.get(`https://openlibrary.org/subjects/${subject}.json`, {
            params: { limit }
        });

        const books = response.data.works?.map(work => ({
            id: work.key.split('/').pop(),
            title: work.title,
            author: work.authors?.[0]?.name || 'Unknown Author',
            coverUrl: work.cover_id ? `https://covers.openlibrary.org/b/id/${work.cover_id}-M.jpg` : null,
            year: work.first_publish_year
        })) || [];

        setCached(cacheKey, books);

        res.json({ success: true, data: books });
    } catch (error) {
        console.error('Trending books fetch error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch trending books' });
    }
});

module.exports = router;