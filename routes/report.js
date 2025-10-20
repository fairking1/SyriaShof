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

// POST - Submit report
router.post('/', async (req, res) => {
  try {
    const { category, description, email, sessionToken } = req.body;

    if (!category || !description) {
      return res.status(400).json({ error: 'Category and description are required' });
    }

    let userEmail = email || 'unknown@user.com';
    let userId = 'guest';

    // Verify session if provided
    if (sessionToken) {
      try {
        const sql = getDB();
        const session = await sql`
          SELECT user_id, email FROM sessions 
          WHERE token = ${sessionToken} AND expires > ${Date.now()}
        `;
        
        if (session.length > 0) {
          userEmail = session[0].email;
          userId = session[0].user_id;
        }
      } catch (error) {
        console.error('Session verification error:', error);
      }
    }

    // Send to Discord webhook
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    
    if (!webhookUrl) {
      console.warn('⚠️ Discord webhook not configured');
      // Still return success for user experience
      return res.json({ 
        message: 'Report received',
        success: true
      });
    }

    const categoryEmojis = {
      'video_not_working': '🎬',
      'login_issue': '🔐',
      'bug': '🐛',
      'feature_request': '💡',
      'account_issue': '👤',
      'content_issue': '📝',
      'other': '❓'
    };

    const categoryNames = {
      'video_not_working': 'Video Not Working',
      'login_issue': 'Login Issue',
      'bug': 'Website Bug',
      'feature_request': 'Feature Request',
      'account_issue': 'Account Issue',
      'content_issue': 'Content Issue',
      'other': 'Other'
    };

    const discordPayload = {
      embeds: [{
        title: `${categoryEmojis[category] || '📢'} New Report: ${categoryNames[category] || category}`,
        color: category === 'bug' ? 15158332 : category === 'feature_request' ? 3447003 : 15105570,
        fields: [
          {
            name: '📧 User Email',
            value: userEmail,
            inline: true
          },
          {
            name: '🆔 User ID',
            value: userId.toString(),
            inline: true
          },
          {
            name: '📋 Category',
            value: categoryNames[category] || category,
            inline: false
          },
          {
            name: '📝 Description',
            value: description.length > 1000 ? description.substring(0, 1000) + '...' : description,
            inline: false
          },
          {
            name: '⏰ Time',
            value: new Date().toISOString(),
            inline: false
          }
        ],
        footer: {
          text: '🇸🇾 Syria Shof - Report System'
        },
        timestamp: new Date().toISOString()
      }]
    };

    const fetch = require('node-fetch');
    const discordResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(discordPayload)
    });

    if (!discordResponse.ok) {
      console.error('Discord webhook error:', await discordResponse.text());
    }

    return res.json({ 
      message: 'Report sent successfully',
      success: true
    });

  } catch (error) {
    console.error('Report error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
});

module.exports = router;

