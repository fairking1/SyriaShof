const express = require('express');
const { neon } = require('@neondatabase/serverless');
const router = express.Router();

function getDB() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL not set');
  return neon(connectionString);
}

async function verifySession(token) {
  if (!token) return null;
  const sql = getDB();
  const sessions = await sql`
    SELECT s.user_id, s.email
    FROM sessions s
    WHERE s.token = ${token} AND s.expires > ${Date.now()}
  `;
  return sessions.length > 0 ? sessions[0] : null;
}

// GET /api/watchlist - Get user's watchlist
router.get('/', async (req, res) => {
  try {
    const sessionToken = req.headers['x-session-token'] || req.query.sessionToken;
    
    const session = await verifySession(sessionToken);
    if (!session) {
      return res.status(401).json({ error: 'Invalid session' });
    }
    
    const sql = getDB();
    const movies = await sql`
      SELECT m.*, w.added_at
      FROM movies m
      JOIN watchlist w ON m.id = w.movie_id
      WHERE w.user_id = ${session.user_id}
      ORDER BY w.added_at DESC
    `;
    
    res.json({ movies });
  } catch (error) {
    console.error('Get watchlist error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/watchlist/add - Add to watchlist
router.post('/add', async (req, res) => {
  try {
    const { sessionToken, movieId } = req.body;
    
    const session = await verifySession(sessionToken);
    if (!session) {
      return res.status(401).json({ error: 'Invalid session' });
    }
    
    const sql = getDB();
    
    // Check if already in watchlist
    const existing = await sql`
      SELECT id FROM watchlist 
      WHERE user_id = ${session.user_id} AND movie_id = ${movieId}
    `;
    
    if (existing.length > 0) {
      return res.json({ success: true, message: 'Already in watchlist' });
    }
    
    await sql`
      INSERT INTO watchlist (user_id, movie_id)
      VALUES (${session.user_id}, ${movieId})
    `;
    
    res.json({ success: true, message: 'Added to watchlist' });
  } catch (error) {
    console.error('Add to watchlist error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/watchlist/remove - Remove from watchlist
router.post('/remove', async (req, res) => {
  try {
    const { sessionToken, movieId } = req.body;
    
    const session = await verifySession(sessionToken);
    if (!session) {
      return res.status(401).json({ error: 'Invalid session' });
    }
    
    const sql = getDB();
    await sql`
      DELETE FROM watchlist 
      WHERE user_id = ${session.user_id} AND movie_id = ${movieId}
    `;
    
    res.json({ success: true, message: 'Removed from watchlist' });
  } catch (error) {
    console.error('Remove from watchlist error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/watchlist/check/:movieId - Check if movie is in watchlist
router.get('/check/:movieId', async (req, res) => {
  try {
    const { movieId } = req.params;
    const sessionToken = req.headers['x-session-token'] || req.query.sessionToken;
    
    const session = await verifySession(sessionToken);
    if (!session) {
      return res.json({ inWatchlist: false });
    }
    
    const sql = getDB();
    const result = await sql`
      SELECT id FROM watchlist 
      WHERE user_id = ${session.user_id} AND movie_id = ${movieId}
    `;
    
    res.json({ inWatchlist: result.length > 0 });
  } catch (error) {
    console.error('Check watchlist error:', error);
    res.json({ inWatchlist: false });
  }
});

module.exports = router;

