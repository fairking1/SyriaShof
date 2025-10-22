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

// GET /api/history - Get watch history
router.get('/', async (req, res) => {
  try {
    const sessionToken = req.headers['x-session-token'] || req.query.sessionToken;
    
    const session = await verifySession(sessionToken);
    if (!session) {
      return res.status(401).json({ error: 'Invalid session' });
    }
    
    const sql = getDB();
    const history = await sql`
      SELECT m.*, wh.progress_seconds, wh.completed, wh.last_watched
      FROM movies m
      JOIN watch_history wh ON m.id = wh.movie_id
      WHERE wh.user_id = ${session.user_id}
      ORDER BY wh.last_watched DESC
      LIMIT 50
    `;
    
    res.json({ history });
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/history/continue - Get continue watching (incomplete videos)
router.get('/continue', async (req, res) => {
  try {
    const sessionToken = req.headers['x-session-token'] || req.query.sessionToken;
    
    const session = await verifySession(sessionToken);
    if (!session) {
      return res.json({ videos: [] });
    }
    
    const sql = getDB();
    const videos = await sql`
      SELECT m.*, wh.progress_seconds, wh.last_watched
      FROM movies m
      JOIN watch_history wh ON m.id = wh.movie_id
      WHERE wh.user_id = ${session.user_id} 
        AND wh.completed = FALSE
        AND wh.progress_seconds > 30
      ORDER BY wh.last_watched DESC
      LIMIT 10
    `;
    
    res.json({ videos });
  } catch (error) {
    console.error('Get continue watching error:', error);
    res.json({ videos: [] });
  }
});

// POST /api/history/update - Update watch progress
router.post('/update', async (req, res) => {
  try {
    const { sessionToken, movieId, progressSeconds, completed } = req.body;
    
    const session = await verifySession(sessionToken);
    if (!session) {
      return res.status(401).json({ error: 'Invalid session' });
    }
    
    const sql = getDB();
    
    // Update or insert watch history
    await sql`
      INSERT INTO watch_history (user_id, movie_id, progress_seconds, completed, last_watched)
      VALUES (${session.user_id}, ${movieId}, ${progressSeconds}, ${completed || false}, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id, movie_id) 
      DO UPDATE SET 
        progress_seconds = ${progressSeconds},
        completed = ${completed || false},
        last_watched = CURRENT_TIMESTAMP
    `;
    
    res.json({ success: true });
  } catch (error) {
    console.error('Update history error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/history/progress/:movieId - Get progress for a specific movie
router.get('/progress/:movieId', async (req, res) => {
  try {
    const { movieId } = req.params;
    const sessionToken = req.headers['x-session-token'] || req.query.sessionToken;
    
    const session = await verifySession(sessionToken);
    if (!session) {
      return res.json({ progress: 0 });
    }
    
    const sql = getDB();
    const result = await sql`
      SELECT progress_seconds FROM watch_history 
      WHERE user_id = ${session.user_id} AND movie_id = ${movieId}
    `;
    
    res.json({ progress: result.length > 0 ? result[0].progress_seconds : 0 });
  } catch (error) {
    console.error('Get progress error:', error);
    res.json({ progress: 0 });
  }
});

module.exports = router;

