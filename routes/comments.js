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
    SELECT s.user_id, s.email, u.display_name, u.avatar_url
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ${token} AND s.expires > ${Date.now()}
  `;
  return sessions.length > 0 ? sessions[0] : null;
}

// GET /api/comments/:movieId - Get comments for a movie
router.get('/:movieId', async (req, res) => {
  try {
    const { movieId } = req.params;
    const sql = getDB();
    
    const comments = await sql`
      SELECT c.id, c.content, c.parent_id, c.likes, c.created_at,
             u.email, u.display_name, u.avatar_url
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.movie_id = ${movieId}
      ORDER BY c.created_at DESC
    `;
    
    res.json({ comments });
  } catch (error) {
    console.error('Get comments error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/comments - Add a comment
router.post('/', async (req, res) => {
  try {
    const { sessionToken, movieId, content, parentId } = req.body;
    
    const session = await verifySession(sessionToken);
    if (!session) {
      return res.status(401).json({ error: 'Invalid session' });
    }
    
    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Comment content required' });
    }
    
    const sql = getDB();
    const [comment] = await sql`
      INSERT INTO comments (movie_id, user_id, content, parent_id)
      VALUES (${movieId}, ${session.user_id}, ${content.trim()}, ${parentId || null})
      RETURNING id, content, created_at
    `;
    
    res.json({
      success: true,
      comment: {
        ...comment,
        email: session.email,
        display_name: session.display_name,
        avatar_url: session.avatar_url
      }
    });
  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/comments/:commentId - Delete a comment
router.delete('/:commentId', async (req, res) => {
  try {
    const { commentId } = req.params;
    const sessionToken = req.headers['x-session-token'];
    
    const session = await verifySession(sessionToken);
    if (!session) {
      return res.status(401).json({ error: 'Invalid session' });
    }
    
    const sql = getDB();
    
    // Check if comment belongs to user
    const [comment] = await sql`
      SELECT user_id FROM comments WHERE id = ${commentId}
    `;
    
    if (!comment || comment.user_id !== session.user_id) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    
    await sql`DELETE FROM comments WHERE id = ${commentId}`;
    
    res.json({ success: true });
  } catch (error) {
    console.error('Delete comment error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

