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

// GET /api/profile - Get user profile
router.get('/', async (req, res) => {
  try {
    const sessionToken = req.headers['x-session-token'] || req.query.sessionToken;
    
    const session = await verifySession(sessionToken);
    if (!session) {
      return res.status(401).json({ error: 'Invalid session' });
    }
    
    const sql = getDB();
    const [user] = await sql`
      SELECT id, email, display_name, avatar_url, created_at,
             (SELECT COUNT(*) FROM watchlist WHERE user_id = users.id) as watchlist_count,
             (SELECT COUNT(*) FROM comments WHERE user_id = users.id) as comments_count,
             (SELECT COUNT(*) FROM ratings WHERE user_id = users.id) as ratings_count
      FROM users
      WHERE id = ${session.user_id}
    `;
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ profile: user });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/profile/update - Update user profile
router.post('/update', async (req, res) => {
  try {
    const { sessionToken, displayName, avatarUrl } = req.body;
    
    const session = await verifySession(sessionToken);
    if (!session) {
      return res.status(401).json({ error: 'Invalid session' });
    }
    
    const sql = getDB();
    
    const updates = [];
    const values = [];
    
    if (displayName !== undefined) {
      updates.push('display_name = $' + (updates.length + 1));
      values.push(displayName);
    }
    
    if (avatarUrl !== undefined) {
      updates.push('avatar_url = $' + (updates.length + 1));
      values.push(avatarUrl);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }
    
    values.push(session.user_id);
    
    await sql`
      UPDATE users 
      SET display_name = ${displayName || null}, 
          avatar_url = ${avatarUrl || null}
      WHERE id = ${session.user_id}
    `;
    
    res.json({ success: true, message: 'Profile updated' });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/profile/stats - Get user statistics
router.get('/stats', async (req, res) => {
  try {
    const sessionToken = req.headers['x-session-token'] || req.query.sessionToken;
    
    const session = await verifySession(sessionToken);
    if (!session) {
      return res.status(401).json({ error: 'Invalid session' });
    }
    
    const sql = getDB();
    
    // Get watch time (total progress in hours)
    const [watchTime] = await sql`
      SELECT COALESCE(SUM(progress_seconds), 0) as total_seconds
      FROM watch_history
      WHERE user_id = ${session.user_id}
    `;
    
    // Get favorite genres
    const favoriteGenres = await sql`
      SELECT m.genre, COUNT(*) as count
      FROM watchlist w
      JOIN movies m ON w.movie_id = m.id
      WHERE w.user_id = ${session.user_id}
      GROUP BY m.genre
      ORDER BY count DESC
      LIMIT 5
    `;
    
    // Get recent activity
    const recentActivity = await sql`
      SELECT 'watched' as type, m.title_ar, m.title_en, wh.last_watched as timestamp
      FROM watch_history wh
      JOIN movies m ON wh.movie_id = m.id
      WHERE wh.user_id = ${session.user_id}
      ORDER BY wh.last_watched DESC
      LIMIT 10
    `;
    
    res.json({
      stats: {
        totalWatchTimeHours: Math.round(parseInt(watchTime.total_seconds) / 3600),
        favoriteGenres,
        recentActivity
      }
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

