const express = require('express');
const router = express.Router();

// POST - Send email
router.post('/', async (req, res) => {
  try {
    const { to, subject, code, type, resetLink } = req.body;

    const emailTemplate = getEmailTemplate(type, code, resetLink);

    // Resend configuration
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    
    if (!RESEND_API_KEY) {
      console.warn('⚠️ No Resend API key configured. Code would be:', code);
      return res.json({ 
        success: true, 
        message: 'Email service not configured. Check console for code.',
        devCode: code // Only for development
      });
    }

    // Send email using Resend API
    const fetch = require('node-fetch');
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Syria Shof <noreply@syriashof.online>',
        to: to,
        subject: subject,
        html: emailTemplate
      })      
    });

    const data = await response.json();

    if (response.ok) {
      console.log('✅ Email sent via Resend:', data.id);
      return res.json({ success: true, message: 'Email sent successfully via Resend' });
    } else {
      console.error('❌ Resend error:', data);
      throw new Error(data.message || 'Failed to send email via Resend');
    }

  } catch (error) {
    console.error('Email error:', error);
    return res.status(500).json({ error: error.message });
  }
});

function getEmailTemplate(type, code, resetLink) {
  const syrianFlagColors = {
    green: '#007A3D',
    red: '#CE1126',
    white: '#FFFFFF',
    black: '#000000'
  };

  if (type === 'password-reset') {
    return `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background-color: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
                <!-- Header with Syrian Flag Colors -->
                <tr>
                  <td style="background: linear-gradient(135deg, ${syrianFlagColors.green} 0%, #004d25 100%); padding: 30px; text-align: center;">
                    <h1 style="color: white; margin: 0; font-size: 32px;">
                      🇸🇾 Syria Shof
                    </h1>
                    <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">شوف سوريا</p>
                  </td>
                </tr>
                
                <!-- Content -->
                <tr>
                  <td style="padding: 40px 30px; text-align: center;">
                    <div style="font-size: 48px; margin-bottom: 20px;">🔑</div>
                    <h2 style="color: #333; margin: 0 0 20px 0;">إعادة تعيين كلمة المرور</h2>
                    <p style="color: #666; font-size: 16px; line-height: 1.6; margin-bottom: 30px;">
                      لقد تلقينا طلباً لإعادة تعيين كلمة المرور الخاصة بك. انقر على الزر أدناه لإنشاء كلمة مرور جديدة:
                    </p>
                    
                    <!-- Reset Button -->
                    <div style="margin: 30px 0;">
                      <a href="${resetLink}" style="display: inline-block; background: linear-gradient(135deg, ${syrianFlagColors.green} 0%, ${syrianFlagColors.red} 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-size: 18px; font-weight: bold;">
                        إعادة تعيين كلمة المرور
                      </a>
                    </div>
                    
                    <p style="color: #666; font-size: 14px; margin-top: 30px;">
                      أو انسخ هذا الرابط في متصفحك:
                    </p>
                    <p style="color: ${syrianFlagColors.green}; font-size: 12px; word-break: break-all; padding: 10px; background: #f8f9fa; border-radius: 5px;">
                      ${resetLink}
                    </p>
                    
                    <p style="color: #999; font-size: 14px; margin-top: 30px;">
                      هذا الرابط صالح لمدة ساعة واحدة فقط
                    </p>
                    
                    <p style="color: #666; font-size: 14px; margin-top: 20px; padding: 15px; background: #fff3cd; border-radius: 5px; border-right: 4px solid ${syrianFlagColors.red};">
                      ⚠️ إذا لم تطلب إعادة تعيين كلمة المرور، يمكنك تجاهل هذه الرسالة بأمان.
                    </p>
                  </td>
                </tr>
                
                <!-- Footer -->
                <tr>
                  <td style="background: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #e0e0e0;">
                    <p style="color: #999; font-size: 12px; margin: 0;">
                      © 2024 Syria Shof - منصة المحتوى السوري
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;
  }

  if (type === 'verification') {
    return `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background-color: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
                <!-- Header with Syrian Flag Colors -->
                <tr>
                  <td style="background: linear-gradient(135deg, ${syrianFlagColors.green} 0%, #004d25 100%); padding: 30px; text-align: center;">
                    <h1 style="color: white; margin: 0; font-size: 32px;">
                      🇸🇾 Syria Shof
                    </h1>
                    <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">شوف سوريا</p>
                  </td>
                </tr>
                
                <!-- Content -->
                <tr>
                  <td style="padding: 40px 30px; text-align: center;">
                    <h2 style="color: #333; margin: 0 0 20px 0;">رمز التحقق من البريد الإلكتروني</h2>
                    <p style="color: #666; font-size: 16px; line-height: 1.6; margin-bottom: 30px;">
                      مرحباً بك في Syria Shof! استخدم الرمز التالي للتحقق من بريدك الإلكتروني:
                    </p>
                    
                    <!-- Verification Code -->
                    <div style="background: linear-gradient(135deg, ${syrianFlagColors.green} 0%, ${syrianFlagColors.red} 100%); padding: 3px; border-radius: 10px; display: inline-block; margin: 20px 0;">
                      <div style="background: white; padding: 20px 40px; border-radius: 8px;">
                        <span style="font-size: 36px; font-weight: bold; color: ${syrianFlagColors.green}; letter-spacing: 8px;">
                          ${code}
                        </span>
                      </div>
                    </div>
                    
                    <p style="color: #999; font-size: 14px; margin-top: 30px;">
                      هذا الرمز صالح لمدة 10 دقائق
                    </p>
                    
                    <p style="color: #666; font-size: 14px; margin-top: 20px; padding: 15px; background: #f8f9fa; border-radius: 5px; border-right: 4px solid ${syrianFlagColors.red};">
                      ⚠️ إذا لم تقم بإنشاء حساب، يمكنك تجاهل هذه الرسالة بأمان.
                    </p>
                  </td>
                </tr>
                
                <!-- Footer -->
                <tr>
                  <td style="background: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #e0e0e0;">
                    <p style="color: #999; font-size: 12px; margin: 0;">
                      © 2024 Syria Shof - منصة المحتوى السوري
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;
  }

  return `<p>Email from Syria Shof</p>`;
}

module.exports = router;

