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

// Verify reCAPTCHA token
async function verifyRecaptcha(token) {
  const secretKey = process.env.RECAPTCHA_SECRET_KEY;
  
  if (!secretKey) {
    console.warn('⚠️ reCAPTCHA secret key not set - skipping verification');
    return true;
  }

  try {
    const fetch = require('node-fetch');
    const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `secret=${secretKey}&response=${token}`,
    });

    const data = await response.json();
    console.log('reCAPTCHA verification result:', data.success);
    return data.success;
  } catch (error) {
    console.error('❌ reCAPTCHA verification error:', error);
    return false;
  }
}

// Main router handler
router.post('/', async (req, res) => {
  let sql;
  
  try {
    sql = getDB();
  } catch (error) {
    console.error('Database connection error:', error);
    return res.status(500).json({ error: 'Database connection failed' });
  }

  try {
    const { action, email, password, recaptchaToken, sessionToken, code } = req.body;

    // REGISTER
    if (action === 'register') {
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
      }

      if (!recaptchaToken) {
        return res.status(400).json({ error: 'reCAPTCHA verification required' });
      }

      const isRecaptchaValid = await verifyRecaptcha(recaptchaToken);
      if (!isRecaptchaValid) {
        return res.status(400).json({ error: 'reCAPTCHA verification failed' });
      }

      try {
        const existingUsers = await sql`SELECT id, is_verified FROM users WHERE email = ${email}`;
        
        if (existingUsers.length > 0) {
          const user = existingUsers[0];
          
          if (user.is_verified) {
            return res.status(400).json({ error: 'Email already registered' });
          }
          
          const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
          const verificationExpires = Date.now() + 10 * 60 * 1000;

          await sql`
            UPDATE users 
            SET verification_code = ${verificationCode}, 
                verification_expires = ${verificationExpires},
                password = ${password}
            WHERE email = ${email}
          `;

          try {
            const fetch = require('node-fetch');
            await fetch(`${req.protocol}://${req.get('host')}/api/send-email`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                to: email,
                subject: 'رمز التحقق - Syria Shof',
                code: verificationCode,
                type: 'verification'
              })
            });
          } catch (emailError) {
            console.error('Email sending failed:', emailError);
          }

          return res.json({ 
            message: 'Verification code sent',
            needsVerification: true,
            email: email
          });
        }

        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        const verificationExpires = Date.now() + 10 * 60 * 1000;

        await sql`
          INSERT INTO users (email, password, is_verified, verification_code, verification_expires)
          VALUES (${email}, ${password}, false, ${verificationCode}, ${verificationExpires})
        `;

        try {
          const fetch = require('node-fetch');
          await fetch(`${req.protocol}://${req.get('host')}/api/send-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: email,
              subject: 'رمز التحقق - Syria Shof',
              code: verificationCode,
              type: 'verification'
            })
          });
        } catch (emailError) {
          console.error('Email sending failed:', emailError);
        }

        return res.json({ 
          message: 'Registration successful. Please verify your email.',
          needsVerification: true,
          email: email
        });

      } catch (error) {
        console.error('Registration error:', error);
        return res.status(500).json({ error: 'Registration failed' });
      }
    }

    // LOGIN
    if (action === 'login') {
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
      }

      if (!recaptchaToken) {
        return res.status(400).json({ error: 'reCAPTCHA verification required' });
      }

      const isRecaptchaValid = await verifyRecaptcha(recaptchaToken);
      if (!isRecaptchaValid) {
        return res.status(400).json({ error: 'reCAPTCHA verification failed' });
      }

      try {
        const users = await sql`SELECT * FROM users WHERE email = ${email}`;
        
        if (users.length === 0) {
          return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = users[0];

        if (user.password !== password) {
          return res.status(401).json({ error: 'Invalid credentials' });
        }

        if (!user.is_verified) {
          const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
          const verificationExpires = Date.now() + 10 * 60 * 1000;

          await sql`
            UPDATE users 
            SET verification_code = ${verificationCode}, 
                verification_expires = ${verificationExpires}
            WHERE email = ${email}
          `;

          try {
            const fetch = require('node-fetch');
            await fetch(`${req.protocol}://${req.get('host')}/api/send-email`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                to: email,
                subject: 'رمز التحقق - Syria Shof',
                code: verificationCode,
                type: 'verification'
              })
            });
          } catch (emailError) {
            console.error('Email sending failed:', emailError);
          }

          return res.json({
            needsVerification: true,
            email: email,
            message: 'Please verify your email first'
          });
        }

        const sessionToken = Math.random().toString(36).substring(2) + Date.now().toString(36);
        const expires = Date.now() + 30 * 24 * 60 * 60 * 1000;

        await sql`
          INSERT INTO sessions (token, user_id, email, expires)
          VALUES (${sessionToken}, ${user.id}, ${email}, ${expires})
        `;

        return res.json({
          sessionToken: sessionToken,
          email: email,
          message: 'Login successful'
        });

      } catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({ error: 'Login failed' });
      }
    }

    // VERIFY SESSION
    if (action === 'verify-session') {
      if (!sessionToken) {
        return res.status(401).json({ error: 'No session token' });
      }

      try {
        const sessions = await sql`
          SELECT email FROM sessions 
          WHERE token = ${sessionToken} AND expires > ${Date.now()}
        `;

        if (sessions.length === 0) {
          return res.status(401).json({ error: 'Invalid or expired session' });
        }

        return res.json({
          valid: true,
          email: sessions[0].email
        });
      } catch (error) {
        console.error('Session verification error:', error);
        return res.status(500).json({ error: 'Verification failed' });
      }
    }

    // LOGOUT
    if (action === 'logout') {
      if (!sessionToken) {
        return res.status(400).json({ error: 'Session token required' });
      }

      try {
        await sql`DELETE FROM sessions WHERE token = ${sessionToken}`;
        return res.json({ message: 'Logged out successfully' });
      } catch (error) {
        console.error('Logout error:', error);
        return res.status(500).json({ error: 'Logout failed' });
      }
    }

    // VERIFY EMAIL
    if (action === 'verify-email') {
      if (!email || !code) {
        return res.status(400).json({ error: 'Email and code required' });
      }

      try {
        const users = await sql`
          SELECT * FROM users 
          WHERE email = ${email} AND verification_code = ${code}
        `;

        if (users.length === 0) {
          return res.status(400).json({ error: 'Invalid verification code' });
        }

        const user = users[0];

        if (user.verification_expires < Date.now()) {
          return res.status(400).json({ error: 'Verification code expired' });
        }

        await sql`
          UPDATE users 
          SET is_verified = true, 
              verification_code = NULL, 
              verification_expires = NULL
          WHERE email = ${email}
        `;

        const sessionToken = Math.random().toString(36).substring(2) + Date.now().toString(36);
        const expires = Date.now() + 30 * 24 * 60 * 60 * 1000;

        await sql`
          INSERT INTO sessions (token, user_id, email, expires)
          VALUES (${sessionToken}, ${user.id}, ${email}, ${expires})
        `;

        return res.json({
          sessionToken: sessionToken,
          email: email,
          message: 'Email verified successfully'
        });

      } catch (error) {
        console.error('Email verification error:', error);
        return res.status(500).json({ error: 'Verification failed' });
      }
    }

    // RESEND CODE
    if (action === 'resend-code') {
      if (!email) {
        return res.status(400).json({ error: 'Email required' });
      }

      try {
        const users = await sql`SELECT * FROM users WHERE email = ${email}`;
        
        if (users.length === 0) {
          return res.status(400).json({ error: 'User not found' });
        }

        const user = users[0];

        if (user.is_verified) {
          return res.status(400).json({ error: 'Email already verified' });
        }

        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        const verificationExpires = Date.now() + 10 * 60 * 1000;

        await sql`
          UPDATE users 
          SET verification_code = ${verificationCode}, 
              verification_expires = ${verificationExpires}
          WHERE email = ${email}
        `;

        try {
          const fetch = require('node-fetch');
          await fetch(`${req.protocol}://${req.get('host')}/api/send-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: email,
              subject: 'رمز التحقق - Syria Shof',
              code: verificationCode,
              type: 'verification'
            })
          });
        } catch (emailError) {
          console.error('Email sending failed:', emailError);
          return res.status(500).json({ error: 'Failed to send email' });
        }

        return res.json({
          message: 'Verification code resent',
          success: true
        });

      } catch (error) {
        console.error('Resend code error:', error);
        return res.status(500).json({ error: 'Failed to resend code' });
      }
    }

    // FORGOT PASSWORD
    if (action === 'forgot-password') {
      if (!email) {
        return res.status(400).json({ error: 'Email is required' });
      }

      try {
        const users = await sql`SELECT id, email FROM users WHERE email = ${email}`;
        
        if (users.length === 0) {
          return res.status(200).json({ 
            message: 'If this email exists, a reset link has been sent.',
            success: true
          });
        }

        const user = users[0];
        const resetToken = Math.random().toString(36).substring(2) + Date.now().toString(36);
        const resetExpires = Date.now() + 60 * 60 * 1000;

        await sql`
          INSERT INTO password_resets (user_id, email, token, expires, used)
          VALUES (${user.id}, ${user.email}, ${resetToken}, ${resetExpires}, false)
        `;

        const resetLink = `${req.protocol}://${req.get('host')}/reset-password.html?token=${resetToken}`;
        
        try {
          const fetch = require('node-fetch');
          await fetch(`${req.protocol}://${req.get('host')}/api/send-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: email,
              subject: 'إعادة تعيين كلمة المرور - Syria Shof',
              type: 'password-reset',
              resetLink: resetLink
            })
          });
        } catch (emailError) {
          console.error('Email sending failed:', emailError);
        }

        return res.json({ 
          message: 'Reset link sent to your email',
          success: true
        });
      } catch (error) {
        console.error('Forgot password error:', error);
        return res.status(500).json({ error: 'Internal server error' });
      }
    }

    // RESET PASSWORD
    if (action === 'reset-password') {
      const { token, newPassword } = req.body;

      if (!token || !newPassword) {
        return res.status(400).json({ error: 'Token and new password are required' });
      }

      try {
        const resets = await sql`
          SELECT * FROM password_resets 
          WHERE token = ${token} AND used = false AND expires > ${Date.now()}
        `;

        if (resets.length === 0) {
          return res.status(400).json({ error: 'Invalid or expired reset token' });
        }

        const reset = resets[0];

        await sql`
          UPDATE users 
          SET password = ${newPassword}
          WHERE id = ${reset.user_id}
        `;

        await sql`
          UPDATE password_resets 
          SET used = true 
          WHERE id = ${reset.id}
        `;

        return res.json({ 
          message: 'Password reset successfully',
          success: true
        });
      } catch (error) {
        console.error('Reset password error:', error);
        return res.status(500).json({ error: 'Internal server error' });
      }
    }

    // CHANGE PASSWORD
    if (action === 'change-password') {
      const session = await sql`
        SELECT email FROM sessions WHERE token = ${sessionToken}
      `;

      if (session.length === 0) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (!password) {
        return res.status(400).json({ error: 'New password required' });
      }

      await sql`
        UPDATE users 
        SET password = ${password}
        WHERE email = ${session[0].email}
      `;

      return res.json({ message: 'Password changed successfully' });
    }

    return res.status(400).json({ error: 'Invalid action' });

  } catch (error) {
    console.error('Auth error:', error);
    return res.status(500).json({ 
      error: 'Server error', 
      details: error.message 
    });
  }
});

module.exports = router;

