const express = require('express');
const { neon } = require('@neondatabase/serverless');
const router = express.Router();

// Get database connection
function getDB() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  return neon(connectionString);
}

// POST - Rate a movie
router.post('/', async (req, res) => {
  try {
    const sql = getDB();
    const { action, movieId, rating, userId } = req.body;

    if (action === 'rate') {
      if (!movieId || !rating || rating < 1 || rating > 5) {
        return res.status(400).json({ error: 'Invalid rating' });
      }

      // Insert or update rating
      await sql`
        INSERT INTO movie_ratings (movie_id, user_id, rating)
        VALUES (${movieId}, ${userId}, ${rating})
        ON CONFLICT (movie_id, user_id)
        DO UPDATE SET rating = ${rating}, updated_at = CURRENT_TIMESTAMP
      `;

      // Calculate average rating
      const stats = await sql`
        SELECT 
          ROUND(AVG(rating)::numeric, 1) as average,
          COUNT(*)::int as count
        FROM movie_ratings
        WHERE movie_id = ${movieId}
      `;

      return res.json({ 
        message: 'Rating submitted',
        average: parseFloat(stats[0].average) || 0,
        count: stats[0].count || 0
      });
    }

    return res.status(400).json({ error: 'Invalid action' });

  } catch (error) {
    console.error('Movies error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET - Get movie rating
router.get('/', async (req, res) => {
  try {
    const sql = getDB();
    const movieId = req.query.movieId;
    
    if (movieId) {
      const stats = await sql`
        SELECT 
          ROUND(AVG(rating)::numeric, 1) as average,
          COUNT(*)::int as count
        FROM movie_ratings
        WHERE movie_id = ${movieId}
      `;

      return res.json({
        average: parseFloat(stats[0]?.average) || 0,
        count: stats[0]?.count || 0
      });
    }

    return res.json({ average: 0, count: 0 });

  } catch (error) {
    console.error('Movies error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

