const { neon } = require('@neondatabase/serverless');

// Get database connection
function getDB() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  return neon(connectionString);
}

// Middleware to verify admin session
async function requireAdmin(req, res, next) {
  const { sessionToken } = req.body;
  const authHeader = req.headers.authorization;
  
  // Get token from body or header
  const token = sessionToken || (authHeader && authHeader.replace('Bearer ', ''));
  
  if (!token) {
    console.log('❌ Admin auth failed: No token provided');
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const sql = getDB();
    
    // Verify session and check admin status
    const sessions = await sql`
      SELECT s.email, s.expires, u.is_admin, u.id, u.banned
      FROM sessions s
      JOIN users u ON s.email = u.email
      WHERE s.token = ${token}
    `;

    if (sessions.length === 0) {
      console.log('❌ Admin auth failed: Invalid session');
      return res.status(401).json({ error: 'Invalid session' });
    }

    const session = sessions[0];

    // Check if session expired
    if (session.expires < Date.now()) {
      console.log('❌ Admin auth failed: Session expired');
      await sql`DELETE FROM sessions WHERE token = ${token}`;
      return res.status(401).json({ error: 'Session expired' });
    }

    // Check if user is banned
    if (session.banned) {
      console.log(`❌ Admin auth failed: User banned - ${session.email}`);
      return res.status(403).json({ error: 'Account banned' });
    }

    // Check if user is admin
    if (!session.is_admin) {
      console.log(`❌ Admin auth failed: Not admin - ${session.email}`);
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Attach admin info to request
    req.admin = {
      id: session.id,
      email: session.email
    };

    console.log(`✅ Admin authenticated: ${session.email}`);
    next();

  } catch (error) {
    console.error('❌ Admin auth error:', error);
    return res.status(500).json({ error: 'Authentication failed' });
  }
}

// Log admin action
async function logAdminAction(adminId, adminEmail, action, targetType = null, targetId = null, details = null, ipAddress = null) {
  try {
    const sql = getDB();
    
    await sql`
      INSERT INTO admin_logs (admin_id, admin_email, action, target_type, target_id, details, ip_address)
      VALUES (${adminId}, ${adminEmail}, ${action}, ${targetType}, ${targetId}, ${details ? JSON.stringify(details) : null}, ${ipAddress})
    `;
    
    console.log(`📝 Admin action logged: ${action} by ${adminEmail}`);
  } catch (error) {
    console.error('❌ Failed to log admin action:', error);
    // Don't throw error - logging failure shouldn't break the main operation
  }
}

module.exports = {
  requireAdmin,
  logAdminAction
};

