const express = require('express');
const { neon } = require('@neondatabase/serverless');
const fetch = require('node-fetch');
const router = express.Router();

function getDB() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL not set');
  return neon(connectionString);
}

// GET /api/stream/:movieId - Stream video with range support
router.get('/:movieId', async (req, res) => {
  try {
    const { movieId } = req.params;
    const sql = getDB();
    
    // Get movie details
    const [movie] = await sql`
      SELECT video_url FROM movies WHERE id = ${movieId} AND status = 'active'
    `;
    
    if (!movie || !movie.video_url) {
      return res.status(404).json({ error: 'Movie not found' });
    }
    
    const videoUrl = movie.video_url;
    const range = req.headers.range;
    
    // If video URL is external (HTTP/HTTPS), proxy it with range support
    if (videoUrl.startsWith('http://') || videoUrl.startsWith('https://')) {
      try {
        const headers = {};
        if (range) {
          headers.Range = range;
        }
        
        const videoResponse = await fetch(videoUrl, {
          headers,
          timeout: 30000
        });
        
        // Forward status and headers
        res.status(videoResponse.status);
        
        // Forward important headers
        const headersToForward = [
          'content-type',
          'content-length',
          'content-range',
          'accept-ranges',
          'cache-control',
          'etag',
          'last-modified'
        ];
        
        headersToForward.forEach(header => {
          const value = videoResponse.headers.get(header);
          if (value) {
            res.set(header, value);
          }
        });
        
        // If partial content, set 206 status
        if (videoResponse.status === 206 || range) {
          res.status(206);
        }
        
        // Stream the video
        videoResponse.body.pipe(res);
        
        // Update view count (don't await, fire and forget)
        sql`UPDATE movies SET views = views + 1 WHERE id = ${movieId}`.catch(() => {});
        
      } catch (error) {
        console.error('Video streaming error:', error);
        return res.status(500).json({ error: 'Failed to stream video' });
      }
    } else {
      // For non-HTTP URLs, return the URL directly
      res.json({ videoUrl: movie.video_url });
    }
    
  } catch (error) {
    console.error('Stream error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/stream/:movieId/info - Get video info without streaming
router.get('/:movieId/info', async (req, res) => {
  try {
    const { movieId } = req.params;
    const sql = getDB();
    
    const [movie] = await sql`
      SELECT id, title_ar, title_en, video_url, poster_url, thumbnail_url, duration_minutes
      FROM movies WHERE id = ${movieId} AND status = 'active'
    `;
    
    if (!movie) {
      return res.status(404).json({ error: 'Movie not found' });
    }
    
    res.json(movie);
  } catch (error) {
    console.error('Get video info error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

