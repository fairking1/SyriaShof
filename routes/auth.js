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
    console.log('✅ reCAPTCHA verification result:', data.success);
    return data.success;
  } catch (error) {
    console.error('❌ reCAPTCHA verification error:', error);
    return false;
  }
}

// Send email helper with better error handling
async function sendEmail(req, to, subject, code, type, resetLink = null) {
  try {
    const fetch = require('node-fetch');
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const baseUrl = `${protocol}://${host}`;
    
    console.log(`📧 Sending ${type} email to ${to}`);
    
    const response = await fetch(`${baseUrl}/api/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to,
        subject,
        code,
        type,
        resetLink
      }),
      timeout: 15000
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error(`❌ Email API error for ${to}:`, data);
      throw new Error(data.error || 'Failed to send email');
    }
    
    console.log(`✅ Email sent successfully to ${to}`);
    return true;
  } catch (error) {
    console.error(`❌ Email sending failed for ${to}:`, error.message);
    // Don't throw - email failure shouldn't block registration/login
    return false;
  }
}

// Main router handler
router.post('/', async (req, res) => {
  let sql;
  
  try {
    sql = getDB();
  } catch (error) {
    console.error('❌ Database connection error:', error);
    return res.status(500).json({ error: 'Database connection failed' });
  }

  try {
    const { action, email, password, recaptchaToken, sessionToken, code, token: resetToken, newPassword } = req.body;

    console.log(`📝 Auth action: ${action} ${email ? `for ${email}` : ''}`);

    // ============================================
    // REGISTER - Create new user account
    // ============================================
    if (action === 'register') {
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }

      // Validate password strength
      if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
      }

      if (!recaptchaToken) {
        return res.status(400).json({ error: 'reCAPTCHA verification required' });
      }

      const isRecaptchaValid = await verifyRecaptcha(recaptchaToken);
      if (!isRecaptchaValid) {
        return res.status(400).json({ error: 'reCAPTCHA verification failed' });
      }

      try {
        // Check if user already exists
        const existingUsers = await sql`SELECT id, is_verified FROM users WHERE email = ${email}`;
        
        if (existingUsers.length > 0) {
          const user = existingUsers[0];
          
          if (user.is_verified) {
            return res.status(400).json({ error: 'Email already registered. Please login.' });
          }
          
          // User exists but not verified - resend code
          const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
          const verificationExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

          await sql`
            UPDATE users 
            SET verification_code = ${verificationCode}, 
                verification_expires = ${verificationExpires},
                password = ${password}
            WHERE email = ${email}
          `;

          // Send verification email
          await sendEmail(req, email, 'رمز التحقق - Syria Shof', verificationCode, 'verification');

          console.log(`✅ Resent verification code to existing unverified user: ${email}`);
          return res.json({
            message: 'Account exists but not verified. New verification code sent.',
            needsVerification: true,
            email: email
          });
        }

        // Create new user
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        const verificationExpires = Date.now() + 10 * 60 * 1000;

        await sql`
          INSERT INTO users (email, password, is_verified, verification_code, verification_expires)
          VALUES (${email}, ${password}, false, ${verificationCode}, ${verificationExpires})
        `;

        // Send verification email
        await sendEmail(req, email, 'رمز التحقق - Syria Shof', verificationCode, 'verification');

        console.log(`✅ New user registered: ${email}`);
        return res.json({
          message: 'Registration successful! Please check your email for verification code.',
          needsVerification: true,
          email: email
        });

      } catch (error) {
        console.error('❌ Registration error:', error);
        return res.status(500).json({ error: 'Registration failed. Please try again.' });
      }
    }

    // ============================================
    // LOGIN - Authenticate user
    // ============================================
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
          console.log(`❌ Login failed: User not found - ${email}`);
          return res.status(401).json({ error: 'Invalid email or password' });
        }

        const user = users[0];

        if (user.password !== password) {
          console.log(`❌ Login failed: Wrong password - ${email}`);
          return res.status(401).json({ error: 'Invalid email or password' });
        }

        // CRITICAL: Check if email is verified
        if (!user.is_verified) {
          console.log(`⚠️ Login blocked: Email not verified - ${email}`);
          
          // Generate and send new verification code
          const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
          const verificationExpires = Date.now() + 10 * 60 * 1000;

          await sql`
            UPDATE users 
            SET verification_code = ${verificationCode}, 
                verification_expires = ${verificationExpires}
            WHERE email = ${email}
          `;

          await sendEmail(req, email, 'رمز التحقق - Syria Shof', verificationCode, 'verification');

          return res.status(403).json({
            error: 'Email not verified. Please check your email for verification code.',
            needsVerification: true,
            email: email
          });
        }

        // Create session
        const newSessionToken = Math.random().toString(36).substring(2) + Date.now().toString(36);
        const expires = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days

        await sql`
          INSERT INTO sessions (token, user_id, email, expires)
          VALUES (${newSessionToken}, ${user.id}, ${email}, ${expires})
        `;

        console.log(`✅ Login successful: ${email}`);
        return res.json({
          sessionToken: newSessionToken,
          email: email,
          message: 'Login successful'
        });

      } catch (error) {
        console.error('❌ Login error:', error);
        return res.status(500).json({ error: 'Login failed. Please try again.' });
      }
    }

    // ============================================
    // VERIFY SESSION - Check if session is valid
    // ============================================
    if (action === 'verify-session') {
      if (!sessionToken) {
        return res.status(401).json({ error: 'No session token provided', valid: false });
      }

      try {
        const sessions = await sql`
          SELECT s.email, s.expires, u.is_verified 
          FROM sessions s
          JOIN users u ON s.email = u.email
          WHERE s.token = ${sessionToken}
        `;

        if (sessions.length === 0) {
          console.log('❌ Session not found');
          return res.status(401).json({ error: 'Invalid session', valid: false });
        }

        const session = sessions[0];

        // Check if session expired
        if (session.expires < Date.now()) {
          console.log(`❌ Session expired for ${session.email}`);
          await sql`DELETE FROM sessions WHERE token = ${sessionToken}`;
          return res.status(401).json({ error: 'Session expired', valid: false });
        }

        // CRITICAL: Double-check verification status
        if (!session.is_verified) {
          console.log(`❌ Session invalid: User not verified - ${session.email}`);
          await sql`DELETE FROM sessions WHERE token = ${sessionToken}`;
          return res.status(403).json({ error: 'Account not verified', valid: false });
        }

        console.log(`✅ Session valid for ${session.email}`);
        return res.json({
          valid: true,
          email: session.email
        });
      } catch (error) {
        console.error('❌ Session verification error:', error);
        return res.status(500).json({ error: 'Verification failed', valid: false });
      }
    }

    // ============================================
    // LOGOUT - Invalidate session
    // ============================================
    if (action === 'logout') {
      if (!sessionToken) {
        return res.status(400).json({ error: 'Session token required' });
      }

      try {
        await sql`DELETE FROM sessions WHERE token = ${sessionToken}`;
        console.log('✅ User logged out successfully');
        return res.json({ message: 'Logged out successfully' });
      } catch (error) {
        console.error('❌ Logout error:', error);
        return res.status(500).json({ error: 'Logout failed' });
      }
    }

    // ============================================
    // VERIFY EMAIL - Confirm email with code
    // ============================================
    if (action === 'verify-email') {
      if (!email || !code) {
        return res.status(400).json({ error: 'Email and verification code required' });
      }

      try {
        const users = await sql`
          SELECT * FROM users 
          WHERE email = ${email}
        `;

        if (users.length === 0) {
          console.log(`❌ Verification failed: User not found - ${email}`);
          return res.status(400).json({ error: 'User not found' });
        }

        const user = users[0];

        if (user.is_verified) {
          console.log(`⚠️ User already verified - ${email}`);
          return res.status(400).json({ error: 'Email already verified. Please login.' });
        }

        if (user.verification_code !== code) {
          console.log(`❌ Verification failed: Invalid code for ${email}`);
          return res.status(400).json({ error: 'Invalid verification code' });
        }

        if (user.verification_expires < Date.now()) {
          console.log(`❌ Verification failed: Code expired for ${email}`);
          return res.status(400).json({ error: 'Verification code expired. Please request a new one.' });
        }

        // Mark user as verified
        await sql`
          UPDATE users 
          SET is_verified = true, 
              verification_code = NULL, 
              verification_expires = NULL
          WHERE email = ${email}
        `;

        // Create session
        const newSessionToken = Math.random().toString(36).substring(2) + Date.now().toString(36);
        const expires = Date.now() + 30 * 24 * 60 * 60 * 1000;

        await sql`
          INSERT INTO sessions (token, user_id, email, expires)
          VALUES (${newSessionToken}, ${user.id}, ${email}, ${expires})
        `;

        console.log(`✅ Email verified successfully: ${email}`);
        return res.json({
          sessionToken: newSessionToken,
          email: email,
          message: 'Email verified successfully! Welcome to Syria Shof.'
        });

      } catch (error) {
        console.error('❌ Email verification error:', error);
        return res.status(500).json({ error: 'Verification failed. Please try again.' });
      }
    }

    // ============================================
    // RESEND VERIFICATION CODE
    // ============================================
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
          return res.status(400).json({ error: 'Email already verified. Please login.' });
        }

        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        const verificationExpires = Date.now() + 10 * 60 * 1000;

        await sql`
          UPDATE users 
          SET verification_code = ${verificationCode}, 
              verification_expires = ${verificationExpires}
          WHERE email = ${email}
        `;

        await sendEmail(req, email, 'رمز التحقق - Syria Shof', verificationCode, 'verification');

        console.log(`✅ Verification code resent to ${email}`);
        return res.json({ message: 'Verification code sent! Please check your email.' });

      } catch (error) {
        console.error('❌ Resend code error:', error);
        return res.status(500).json({ error: 'Failed to resend code. Please try again.' });
      }
    }

    // ============================================
    // FORGOT PASSWORD - Send reset link
    // ============================================
    if (action === 'forgot-password') {
      if (!email) {
        return res.status(400).json({ error: 'Email required' });
      }

      try {
        const users = await sql`SELECT id FROM users WHERE email = ${email} AND is_verified = true`;
        
        if (users.length === 0) {
          // Don't reveal if email exists for security
          console.log(`⚠️ Password reset requested for non-existent or unverified email: ${email}`);
          return res.json({ message: 'If your email is registered, you will receive a password reset link.' });
        }

        const userId = users[0].id;
        const resetToken = Math.random().toString(36).substring(2) + Date.now().toString(36);
        const resetExpires = Date.now() + 60 * 60 * 1000; // 1 hour

        // Delete any existing reset tokens for this user
        await sql`DELETE FROM password_resets WHERE user_id = ${userId}`;

        // Create new reset token
        await sql`
          INSERT INTO password_resets (token, user_id, email, expires, used)
          VALUES (${resetToken}, ${userId}, ${email}, ${resetExpires}, false)
        `;

        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const host = req.headers['x-forwarded-host'] || req.get('host');
        const resetLink = `${protocol}://${host}/reset-password.html?token=${resetToken}`;

        await sendEmail(req, email, 'إعادة تعيين كلمة المرور - Syria Shof', null, 'password-reset', resetLink);

        console.log(`✅ Password reset link sent to ${email}`);
        return res.json({ message: 'If your email is registered, you will receive a password reset link.' });

      } catch (error) {
        console.error('❌ Forgot password error:', error);
        return res.status(500).json({ error: 'Failed to process request. Please try again.' });
      }
    }

    // ============================================
    // RESET PASSWORD - Set new password with token
    // ============================================
    if (action === 'reset-password') {
      if (!resetToken || !newPassword) {
        return res.status(400).json({ error: 'Reset token and new password required' });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
      }

      try {
        const resets = await sql`
          SELECT * FROM password_resets 
          WHERE token = ${resetToken} AND used = false
        `;

        if (resets.length === 0) {
          console.log('❌ Invalid or used reset token');
          return res.status(400).json({ error: 'Invalid or expired reset link' });
        }

        const reset = resets[0];

        if (reset.expires < Date.now()) {
          console.log(`❌ Reset token expired for ${reset.email}`);
          return res.status(400).json({ error: 'Reset link has expired. Please request a new one.' });
        }

        // Update password
        await sql`
          UPDATE users 
          SET password = ${newPassword}
          WHERE id = ${reset.user_id}
        `;

        // Mark token as used
        await sql`
          UPDATE password_resets 
          SET used = true
          WHERE token = ${resetToken}
        `;

        // Invalidate all sessions for this user
        await sql`DELETE FROM sessions WHERE email = ${reset.email}`;

        console.log(`✅ Password reset successful for ${reset.email}`);
        return res.json({ message: 'Password reset successful! You can now login with your new password.' });

      } catch (error) {
        console.error('❌ Reset password error:', error);
        return res.status(500).json({ error: 'Failed to reset password. Please try again.' });
      }
    }

    // ============================================
    // CHANGE PASSWORD - Update password for logged-in user
    // ============================================
    if (action === 'change-password') {
      if (!sessionToken || !newPassword) {
        return res.status(400).json({ error: 'Session token and new password required' });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
      }

      try {
        const sessions = await sql`
          SELECT email FROM sessions 
          WHERE token = ${sessionToken} AND expires > ${Date.now()}
        `;

        if (sessions.length === 0) {
          return res.status(401).json({ error: 'Invalid or expired session' });
        }

        await sql`
          UPDATE users 
          SET password = ${newPassword}
          WHERE email = ${sessions[0].email}
        `;

        console.log(`✅ Password changed successfully for ${sessions[0].email}`);
        return res.json({ message: 'Password changed successfully!' });

      } catch (error) {
        console.error('❌ Change password error:', error);
        return res.status(500).json({ error: 'Failed to change password. Please try again.' });
      }
    }

    // Invalid action
    console.log(`❌ Invalid action: ${action}`);
    return res.status(400).json({ error: 'Invalid action' });

  } catch (error) {
    console.error('❌ Auth error:', error);
    return res.status(500).json({ 
      error: 'Server error', 
      details: error.message 
    });
  }
});

module.exports = router;
