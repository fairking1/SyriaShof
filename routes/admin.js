const express = require('express');
const { neon } = require('@neondatabase/serverless');
const { requireAdmin, logAdminAction } = require('../middleware/adminAuth');
const router = express.Router();

// Get database connection
function getDB() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  return neon(connectionString);
}

// ============================================
// DASHBOARD & ANALYTICS
// ============================================

// GET /api/admin/dashboard - Get dashboard statistics
router.post('/dashboard', requireAdmin, async (req, res) => {
  try {
    const sql = getDB();
    
    // Get statistics
    const [totalUsers] = await sql`SELECT COUNT(*) as count FROM users WHERE is_admin = FALSE`;
    const [totalMovies] = await sql`SELECT COUNT(*) as count FROM movies WHERE status = 'active'`;
    const [totalReports] = await sql`SELECT COUNT(*) as count FROM reports WHERE status = 'pending'`;
    const [totalComments] = await sql`SELECT COUNT(*) as count FROM comments`;
    
    // Recent registrations (last 7 days)
    const recentUsers = await sql`
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM users
      WHERE created_at > NOW() - INTERVAL '7 days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `;
    
    // Top rated movies
    const topMovies = await sql`
      SELECT id, title_ar, title_en, rating, views
      FROM movies
      WHERE status = 'active'
      ORDER BY rating DESC, views DESC
      LIMIT 10
    `;
    
    // Recent reports
    const recentReports = await sql`
      SELECT id, email, category, description, status, created_at
      FROM reports
      ORDER BY created_at DESC
      LIMIT 10
    `;
    
    console.log(`✅ Dashboard data fetched by ${req.admin.email}`);
    
    res.json({
      stats: {
        totalUsers: parseInt(totalUsers.count),
        totalMovies: parseInt(totalMovies.count),
        pendingReports: parseInt(totalReports.count),
        totalComments: parseInt(totalComments.count)
      },
      charts: {
        recentUsers
      },
      topMovies,
      recentReports
    });
    
  } catch (error) {
    console.error('❌ Dashboard error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

// ============================================
// MOVIE MANAGEMENT
// ============================================

// GET /api/admin/movies - Get all movies with pagination
router.post('/movies/list', requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '', status = 'all' } = req.body;
    const offset = (page - 1) * limit;
    const sql = getDB();
    
    let query = `SELECT * FROM movies WHERE 1=1`;
    const params = [];
    
    if (search) {
      query += ` AND (title_ar ILIKE $${params.length + 1} OR title_en ILIKE $${params.length + 1})`;
      params.push(`%${search}%`);
    }
    
    if (status !== 'all') {
      query += ` AND status = $${params.length + 1}`;
      params.push(status);
    }
    
    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);
    
    const movies = await sql(query, params);
    const [{ count }] = await sql`SELECT COUNT(*) FROM movies WHERE status = ${status === 'all' ? sql`TRUE` : status}`;
    
    res.json({
      movies,
      total: parseInt(count),
      page,
      totalPages: Math.ceil(count / limit)
    });
    
  } catch (error) {
    console.error('❌ Get movies error:', error);
    res.status(500).json({ error: 'Failed to fetch movies' });
  }
});

// POST /api/admin/movies/add - Add new movie
router.post('/movies/add', requireAdmin, async (req, res) => {
  try {
    const {
      title_ar,
      title_en,
      description_ar,
      description_en,
      video_url,
      poster_url,
      thumbnail_url,
      duration,
      year,
      genre,
      category,
      trending = false,
      featured = false
    } = req.body;
    
    if (!title_ar || !title_en || !video_url) {
      return res.status(400).json({ error: 'Title and video URL are required' });
    }
    
    const sql = getDB();
    
    const [movie] = await sql`
      INSERT INTO movies (
        title_ar, title_en, description_ar, description_en,
        video_url, poster_url, thumbnail_url, duration, year,
        genre, category, trending, featured, created_by, status
      ) VALUES (
        ${title_ar}, ${title_en}, ${description_ar}, ${description_en},
        ${video_url}, ${poster_url}, ${thumbnail_url}, ${duration}, ${year},
        ${genre}, ${category}, ${trending}, ${featured}, ${req.admin.id}, 'active'
      )
      RETURNING *
    `;
    
    await logAdminAction(req.admin.id, req.admin.email, 'movie_add', 'movie', movie.id, { title: title_en }, req.ip);
    
    console.log(`✅ Movie added by ${req.admin.email}: ${title_en}`);
    res.json({ success: true, movie });
    
  } catch (error) {
    console.error('❌ Add movie error:', error);
    res.status(500).json({ error: 'Failed to add movie' });
  }
});

// POST /api/admin/movies/edit - Edit existing movie
router.post('/movies/edit', requireAdmin, async (req, res) => {
  try {
    const { id, ...updates } = req.body;
    
    if (!id) {
      return res.status(400).json({ error: 'Movie ID required' });
    }
    
    const sql = getDB();
    
    // Build update query
    const updateFields = [];
    const values = [];
    let paramCount = 1;
    
    Object.keys(updates).forEach(key => {
      if (updates[key] !== undefined && key !== 'id') {
        updateFields.push(`${key} = $${paramCount}`);
        values.push(updates[key]);
        paramCount++;
      }
    });
    
    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    values.push(id);
    const query = `UPDATE movies SET ${updateFields.join(', ')}, updated_at = NOW() WHERE id = $${paramCount} RETURNING *`;
    
    const [movie] = await sql(query, values);
    
    if (!movie) {
      return res.status(404).json({ error: 'Movie not found' });
    }
    
    await logAdminAction(req.admin.id, req.admin.email, 'movie_edit', 'movie', id, updates, req.ip);
    
    console.log(`✅ Movie edited by ${req.admin.email}: ID ${id}`);
    res.json({ success: true, movie });
    
  } catch (error) {
    console.error('❌ Edit movie error:', error);
    res.status(500).json({ error: 'Failed to edit movie' });
  }
});

// POST /api/admin/movies/delete - Delete movie
router.post('/movies/delete', requireAdmin, async (req, res) => {
  try {
    const { id } = req.body;
    
    if (!id) {
      return res.status(400).json({ error: 'Movie ID required' });
    }
    
    const sql = getDB();
    
    // Soft delete (change status to archived)
    const [movie] = await sql`
      UPDATE movies SET status = 'archived', updated_at = NOW()
      WHERE id = ${id}
      RETURNING title_ar, title_en
    `;
    
    if (!movie) {
      return res.status(404).json({ error: 'Movie not found' });
    }
    
    await logAdminAction(req.admin.id, req.admin.email, 'movie_delete', 'movie', id, { title: movie.title_en }, req.ip);
    
    console.log(`✅ Movie deleted by ${req.admin.email}: ID ${id}`);
    res.json({ success: true, message: 'Movie archived successfully' });
    
  } catch (error) {
    console.error('❌ Delete movie error:', error);
    res.status(500).json({ error: 'Failed to delete movie' });
  }
});

// ============================================
// USER MANAGEMENT
// ============================================

// GET /api/admin/users - Get all users with pagination
router.post('/users/list', requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 50, search = '', filter = 'all' } = req.body;
    const offset = (page - 1) * limit;
    const sql = getDB();
    
    let whereClause = `WHERE is_admin = FALSE`;
    const params = [];
    
    if (search) {
      whereClause += ` AND email ILIKE $${params.length + 1}`;
      params.push(`%${search}%`);
    }
    
    if (filter === 'verified') {
      whereClause += ` AND is_verified = TRUE`;
    } else if (filter === 'unverified') {
      whereClause += ` AND is_verified = FALSE`;
    } else if (filter === 'banned') {
      whereClause += ` AND banned = TRUE`;
    }
    
    params.push(limit, offset);
    const query = `
      SELECT id, email, username, display_name, is_verified, banned, ban_reason, created_at
      FROM users
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;
    
    const users = await sql(query, params);
    const [{ count }] = await sql(`SELECT COUNT(*) FROM users ${whereClause}`, params.slice(0, -2));
    
    res.json({
      users,
      total: parseInt(count),
      page,
      totalPages: Math.ceil(count / limit)
    });
    
  } catch (error) {
    console.error('❌ Get users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// POST /api/admin/users/ban - Ban user
router.post('/users/ban', requireAdmin, async (req, res) => {
  try {
    const { userId, reason } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID required' });
    }
    
    const sql = getDB();
    
    const [user] = await sql`
      UPDATE users
      SET banned = TRUE, ban_reason = ${reason || 'Banned by administrator'}
      WHERE id = ${userId} AND is_admin = FALSE
      RETURNING email
    `;
    
    if (!user) {
      return res.status(404).json({ error: 'User not found or is admin' });
    }
    
    // Invalidate all user sessions
    await sql`DELETE FROM sessions WHERE email = ${user.email}`;
    
    await logAdminAction(req.admin.id, req.admin.email, 'user_ban', 'user', userId, { email: user.email, reason }, req.ip);
    
    console.log(`✅ User banned by ${req.admin.email}: ${user.email}`);
    res.json({ success: true, message: 'User banned successfully' });
    
  } catch (error) {
    console.error('❌ Ban user error:', error);
    res.status(500).json({ error: 'Failed to ban user' });
  }
});

// POST /api/admin/users/unban - Unban user
router.post('/users/unban', requireAdmin, async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID required' });
    }
    
    const sql = getDB();
    
    const [user] = await sql`
      UPDATE users
      SET banned = FALSE, ban_reason = NULL
      WHERE id = ${userId}
      RETURNING email
    `;
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    await logAdminAction(req.admin.id, req.admin.email, 'user_unban', 'user', userId, { email: user.email }, req.ip);
    
    console.log(`✅ User unbanned by ${req.admin.email}: ${user.email}`);
    res.json({ success: true, message: 'User unbanned successfully' });
    
  } catch (error) {
    console.error('❌ Unban user error:', error);
    res.status(500).json({ error: 'Failed to unban user' });
  }
});

// POST /api/admin/users/delete - Delete user permanently
router.post('/users/delete', requireAdmin, async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID required' });
    }
    
    const sql = getDB();
    
    const [user] = await sql`
      DELETE FROM users
      WHERE id = ${userId} AND is_admin = FALSE
      RETURNING email
    `;
    
    if (!user) {
      return res.status(404).json({ error: 'User not found or is admin' });
    }
    
    await logAdminAction(req.admin.id, req.admin.email, 'user_delete', 'user', userId, { email: user.email }, req.ip);
    
    console.log(`✅ User deleted by ${req.admin.email}: ${user.email}`);
    res.json({ success: true, message: 'User deleted successfully' });
    
  } catch (error) {
    console.error('❌ Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// ============================================
// REPORTS MANAGEMENT
// ============================================

// GET /api/admin/reports - Get all reports
router.post('/reports/list', requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, status = 'all' } = req.body;
    const offset = (page - 1) * limit;
    const sql = getDB();
    
    const whereClause = status === 'all' ? '' : `WHERE status = '${status}'`;
    
    const reports = await sql`
      SELECT r.*, u.email as user_email
      FROM reports r
      LEFT JOIN users u ON r.user_id = u.id
      ${sql(whereClause)}
      ORDER BY r.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    
    const [{ count }] = await sql`SELECT COUNT(*) FROM reports ${sql(whereClause)}`;
    
    res.json({
      reports,
      total: parseInt(count),
      page,
      totalPages: Math.ceil(count / limit)
    });
    
  } catch (error) {
    console.error('❌ Get reports error:', error);
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

// POST /api/admin/reports/update - Update report status
router.post('/reports/update', requireAdmin, async (req, res) => {
  try {
    const { reportId, status, adminNotes } = req.body;
    
    if (!reportId || !status) {
      return res.status(400).json({ error: 'Report ID and status required' });
    }
    
    const sql = getDB();
    
    const [report] = await sql`
      UPDATE reports
      SET status = ${status},
          admin_notes = ${adminNotes || null},
          resolved_by = ${req.admin.id},
          resolved_at = ${status !== 'pending' ? sql`NOW()` : null}
      WHERE id = ${reportId}
      RETURNING *
    `;
    
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }
    
    await logAdminAction(req.admin.id, req.admin.email, 'report_update', 'report', reportId, { status, adminNotes }, req.ip);
    
    console.log(`✅ Report updated by ${req.admin.email}: ID ${reportId}`);
    res.json({ success: true, report });
    
  } catch (error) {
    console.error('❌ Update report error:', error);
    res.status(500).json({ error: 'Failed to update report' });
  }
});

// ============================================
// ADMIN LOGS
// ============================================

// GET /api/admin/logs - Get admin activity logs
router.post('/logs', requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.body;
    const offset = (page - 1) * limit;
    const sql = getDB();
    
    const logs = await sql`
      SELECT * FROM admin_logs
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    
    const [{ count }] = await sql`SELECT COUNT(*) FROM admin_logs`;
    
    res.json({
      logs,
      total: parseInt(count),
      page,
      totalPages: Math.ceil(count / limit)
    });
    
  } catch (error) {
    console.error('❌ Get logs error:', error);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

module.exports = router;

