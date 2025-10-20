// State Management
let currentLang = 'ar';
let allVideos = [];
let favorites = [];
let currentCategory = 'all';
let currentGenre = 'all';
let currentSort = 'recent';
let currentView = 'grid';
let currentVideoId = null;
let currentUser = null;
let sessionToken = null;
let currentAuthAction = null;
let currentEmail = null;
let pendingVerificationEmail = null;
let watchHistory = JSON.parse(localStorage.getItem('watchHistory') || '[]');
let continueWatching = JSON.parse(localStorage.getItem('continueWatching') || '[]');

// ============================================
// URL ROUTER - Clean URLs Support
// ============================================

const router = {
    routes: {
        '/': () => router.showHomePage(),
        '/login': () => router.showLoginPage(),
        '/signup': () => router.showSignupPage(),
        '/verify': () => router.showVerifyPage(),
        '/settings': () => router.showSettingsPage(),
        '/movie/:id': (id) => router.showMoviePage(id),
    },

    init() {
        // Handle initial page load
        this.handleRoute();
        
        // Handle browser back/forward buttons
        window.addEventListener('popstate', () => this.handleRoute());
        
        // Intercept all anchor clicks
        document.addEventListener('click', (e) => {
            if (e.target.matches('a[data-route]') || e.target.closest('a[data-route]')) {
                e.preventDefault();
                const link = e.target.matches('a[data-route]') ? e.target : e.target.closest('a[data-route]');
                this.navigate(link.getAttribute('href'));
            }
        });
    },

    navigate(path) {
        window.history.pushState({}, '', path);
        this.handleRoute();
    },

    handleRoute() {
        const path = window.location.pathname;
        
        // Match dynamic routes
        if (path.startsWith('/movie/')) {
            const id = path.split('/')[2];
            if (id && this.routes['/movie/:id']) {
                this.routes['/movie/:id'](id);
                return;
            }
        }
        
        // Match static routes
        const handler = this.routes[path] || this.routes['/'];
        handler();
    },

    // Route Handlers
    showHomePage() {
        if (!currentUser) {
            this.showLoginPage();
            return;
        }
        document.getElementById('authPage').style.display = 'none';
        document.getElementById('mainApp').style.display = 'block';
        
        // Initialize main app if not already done
        if (!document.getElementById('mainApp').dataset.initialized) {
            document.getElementById('userEmail').textContent = currentUser.email;
            loadFavorites();
            initializeEventListeners();
            renderTrending();
            renderContinueWatching();
            renderVideos(allVideos);
            document.getElementById('mainApp').dataset.initialized = 'true';
        }
        
        updateLanguage();
    },

    showLoginPage() {
        document.getElementById('authPage').style.display = 'flex';
        document.getElementById('mainApp').style.display = 'none';
        document.getElementById('loginForm').style.display = 'block';
        document.getElementById('registerForm').style.display = 'none';
        document.getElementById('verifyForm').style.display = 'none';
        document.getElementById('forgotPasswordForm').style.display = 'none';
        
        // Close settings modal if somehow open
        const settingsModal = document.getElementById('settingsModal');
        if (settingsModal && settingsModal.classList.contains('active')) {
            settingsModal.classList.remove('active');
            document.body.style.overflow = 'auto';
        }
        
        // Initialize auth listeners if not already done
        if (!document.getElementById('authPage').dataset.initialized) {
            initializeAuthListeners();
            document.getElementById('authPage').dataset.initialized = 'true';
        }
        
        updateLanguage();
    },

    showSignupPage() {
        document.getElementById('authPage').style.display = 'flex';
        document.getElementById('mainApp').style.display = 'none';
        document.getElementById('loginForm').style.display = 'none';
        document.getElementById('registerForm').style.display = 'block';
        document.getElementById('verifyForm').style.display = 'none';
        document.getElementById('forgotPasswordForm').style.display = 'none';
        
        // Initialize auth listeners if not already done
        if (!document.getElementById('authPage').dataset.initialized) {
            initializeAuthListeners();
            document.getElementById('authPage').dataset.initialized = 'true';
        }
        
        updateLanguage();
    },

    showVerifyPage() {
        document.getElementById('authPage').style.display = 'flex';
        document.getElementById('mainApp').style.display = 'none';
        document.getElementById('loginForm').style.display = 'none';
        document.getElementById('registerForm').style.display = 'none';
        document.getElementById('verifyForm').style.display = 'block';
        document.getElementById('forgotPasswordForm').style.display = 'none';
        
        // Initialize auth listeners if not already done
        if (!document.getElementById('authPage').dataset.initialized) {
            initializeAuthListeners();
            document.getElementById('authPage').dataset.initialized = 'true';
        }
        
        updateLanguage();
    },

    showSettingsPage() {
        if (!currentUser) {
            this.navigate('/login');
            return;
        }
        // Ensure main app is visible
        document.getElementById('authPage').style.display = 'none';
        document.getElementById('mainApp').style.display = 'block';
        // Open settings modal
        document.getElementById('settingsModal').classList.add('active');
        document.getElementById('settingsEmail').value = currentUser.email;
        document.body.style.overflow = 'hidden';
        updateLanguage();
    },

    showMoviePage(id) {
        if (!currentUser) {
            this.navigate('/login');
            return;
        }
        
        // Initialize main app if not already done
        if (!document.getElementById('mainApp').dataset.initialized) {
            document.getElementById('authPage').style.display = 'none';
            document.getElementById('mainApp').style.display = 'block';
            document.getElementById('userEmail').textContent = currentUser.email;
            loadFavorites();
            initializeEventListeners();
            renderTrending();
            renderContinueWatching();
            renderVideos(allVideos);
            document.getElementById('mainApp').dataset.initialized = 'true';
        }
        
        const video = allVideos.find(v => v.id == id);
        if (video) {
            openVideo(video);
        } else {
            this.navigate('/');
        }
    }
};

// Initialize reCAPTCHA
let recaptchaLoginWidget = null;
let recaptchaRegisterWidget = null;

function initRecaptcha() {
    // ⚠️ REPLACE WITH YOUR reCAPTCHA v2 CHECKBOX KEY
    // Get it from: https://www.google.com/recaptcha/admin/create
    // Make sure to select: reCAPTCHA v2 → "I'm not a robot" Checkbox
    const siteKey = '6LfWUtsrAAAAAFl_eSacNWtQfyFMYh7Veq_ebmgj'; // 👈 Paste your NEW v2 key here
    
    // Wait for grecaptcha to be ready
    if (typeof grecaptcha !== 'undefined' && siteKey && siteKey !== 'YOUR_RECAPTCHA_V2_SITE_KEY') {
        try {
            recaptchaLoginWidget = grecaptcha.render('recaptcha-login', {
                'sitekey': siteKey,
                'theme': 'dark' // Matches your Syrian flag theme
            });
            recaptchaRegisterWidget = grecaptcha.render('recaptcha-register', {
                'sitekey': siteKey,
                'theme': 'dark'
            });
            console.log('✅ reCAPTCHA v2 initialized successfully!');
        } catch (e) {
            console.error('❌ reCAPTCHA init error:', e.message);
            console.log('💡 Make sure you created a reCAPTCHA v2 CHECKBOX key (not v3)');
        }
    } else if (siteKey === 'YOUR_RECAPTCHA_V2_SITE_KEY') {
        console.warn('⚠️ Please add your reCAPTCHA v2 Site Key in script.js');
    }
}

// Call initRecaptcha when page loads
window.addEventListener('load', () => {
    setTimeout(initRecaptcha, 1000);
});

// Sample Videos Data with multiple servers
const videos = [
    {
        id: 1,
        titleAr: "The Stupids (1996)",
        titleEn: "The Stupids (1996)",
        descAr: "فيلم كوميدي عن عائلة غبية تواجه مغامرات مضحكة.",
        descEn: "A comedy film about a stupid family facing funny adventures.",
        servers: [
            { name: "Server 1", url: "https://uqload.cx/bndo1w5y5r1e.html" },
            { name: "Server 2", url: "https://uqload.cx/bndo1w5y5r1e.html" }
        ],
        category: "movie",
        genre: "comedy",
        year: 1996,
        poster: "https://image.tmdb.org/t/p/w500/placeholder.jpg", // Add real poster URLs
        trending: true,
        views: 1250
    },
     {
        id: 2,
        titleAr: "Desperate Measures 1998",
        titleEn: "Desperate Measures 1998",
        descAr: "فيلم إثارة ومغامرة",
        descEn: "A thriller and adventure film",
        servers: [
            { name: "Server 1", url: "https://aflam-fs1-cew.cdnz.quest/yh5chxippxikjnl75zpkr5b5xophfwyqzssmwecxhvz6ymjwm3se7vp3k6oq/v.mp4" }
        ],
        category: "movie",
        genre: "thriller",
        year: 1998,
        poster: "https://image.tmdb.org/t/p/w500/placeholder.jpg",
        trending: false,
        views: 850
    },
     {
        id: 3,
        titleAr: "Monolith 2016",
        titleEn: "Monolith 2016",
        descAr: "فيلم إثارة نفسية",
        descEn: "A psychological thriller",
        servers: [
            { name: "Server 1", url: "https://aflam-store2-lhr.cdnz.quest/yh5ch2d5pxikjnl75zpkr2tyw3elrfeviwlpy5t64yofd3dvvmwxy4vexuda/v.mp4" },
            { name: "Server 2", url: "https://aflam-store2-lhr.cdnz.quest/yh5ch2d5pxikjnl75zpkr2tyw3elrfeviwlpy5t64yofd3dvvmwxy4vexuda/v.mp4" }
        ],
        category: "movie",
        genre: "thriller",
        year: 2016,
        poster: "https://image.tmdb.org/t/p/w500/placeholder.jpg",
        trending: true,
        views: 2100
    },
     {
        id: 4,
        titleAr: "Monolith 2022",
        titleEn: "Monolith 2022",
        descAr: "فيلم خيال علمي",
        descEn: "A sci-fi film",
        servers: [
            { name: "Server 1", url: "https://aflam-store1-gbf.cdnz.quest/yh5ca2cgpxikjnl75zo2r4d75w5l2g3otuyo6rbd5sv3mveczauncshphvva/v.mp4" }
        ],
        category: "movie",
        year: 2022
    }
];

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    allVideos = videos;
    router.init(); // Initialize router FIRST
    checkSession(); // Then check session
});

// Session Management with retry logic
async function checkSession() {
    sessionToken = localStorage.getItem('sessionToken');
    
    if (!sessionToken) {
        console.log('📭 No session token found');
        router.navigate('/login');
        return;
    }

    // Retry logic for session verification
    const maxRetries = 3;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`🔐 Verifying session (attempt ${attempt}/${maxRetries})`);
            
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000); // 10 second timeout
            
            const response = await fetch('/api/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'verify-session',
                    sessionToken
                }),
                signal: controller.signal
            });

            clearTimeout(timeout);
            const data = await response.json();

            if (response.ok && data.valid) {
                console.log('✅ Session valid for:', data.email);
                currentUser = { email: data.email };
                localStorage.setItem('userEmail', data.email); // Store email
                router.handleRoute(); // Use router to show correct page
                return;
            } else {
                // Session invalid - clear and redirect
                console.log('❌ Session invalid:', data.error);
                localStorage.removeItem('sessionToken');
                localStorage.removeItem('userEmail');
                sessionToken = null;
                currentUser = null;
                router.navigate('/login');
                return;
            }
        } catch (error) {
            console.error(`❌ Session check error (attempt ${attempt}/${maxRetries}):`, error.message);
            
            if (error.name === 'AbortError') {
                console.error('Session verification timeout');
            }
            
            // If it's the last attempt, clear session and redirect
            if (attempt === maxRetries) {
                console.log('❌ All session verification attempts failed, logging out');
                localStorage.removeItem('sessionToken');
                localStorage.removeItem('userEmail');
                sessionToken = null;
                currentUser = null;
                router.navigate('/login');
                return;
            }
            
            // Wait before retrying (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
    }
}

function showAuthPage() {
    document.getElementById('authPage').style.display = 'flex';
    document.getElementById('mainApp').style.display = 'none';
    initializeAuthListeners();
}

function showMainApp() {
    document.getElementById('authPage').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';
    document.getElementById('userEmail').textContent = currentUser.email;
    loadFavorites();
    initializeEventListeners();
    renderVideos(videos);
}

// Auth Event Listeners
function initializeAuthListeners() {
    // Navigation is now handled by the router!
    // Links with data-route attribute will automatically navigate

    // Login
    document.getElementById('loginBtn').addEventListener('click', handleLogin);
    document.getElementById('loginPassword').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleLogin();
    });

    // Forgot Password
    document.getElementById('forgotPasswordLink').addEventListener('click', (e) => {
        e.preventDefault();
        showForgotPasswordForm();
    });

    document.getElementById('sendResetLinkBtn').addEventListener('click', handleForgotPassword);
    document.getElementById('forgotPasswordEmail').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleForgotPassword();
    });

    // Register
    document.getElementById('registerBtn').addEventListener('click', handleRegister);
    document.getElementById('registerConfirmPassword').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleRegister();
    });

    // Verification
    document.getElementById('verifyBtn').addEventListener('click', handleVerifyEmail);
    document.getElementById('verificationCodeInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleVerifyEmail();
    });
    
    // Auto-format verification code input
    document.getElementById('verificationCodeInput').addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/[^0-9]/g, '').slice(0, 6);
    });

    // Resend code
    document.getElementById('resendCodeBtn').addEventListener('click', handleResendCode);
}

function showForgotPasswordForm() {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('registerForm').style.display = 'none';
    document.getElementById('verifyForm').style.display = 'none';
    document.getElementById('forgotPasswordForm').style.display = 'block';
    updateLanguage();
}

async function handleForgotPassword() {
    const email = document.getElementById('forgotPasswordEmail').value.trim();
    const errorMsg = document.getElementById('forgotPasswordErrorMsg');
    const successMsg = document.getElementById('forgotPasswordSuccessMsg');
    const sendBtn = document.getElementById('sendResetLinkBtn');

    errorMsg.style.display = 'none';
    successMsg.style.display = 'none';

    if (!email) {
        errorMsg.textContent = currentLang === 'ar' ? 'الرجاء إدخال البريد الإلكتروني' : 'Please enter your email';
        errorMsg.style.display = 'block';
        return;
    }

    sendBtn.disabled = true;
    sendBtn.textContent = currentLang === 'ar' ? 'جاري الإرسال...' : 'Sending...';

    try {
        const response = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'forgot-password',
                email: email
            })
        });

        const data = await response.json();

        if (response.ok) {
            successMsg.textContent = currentLang === 'ar' ? '✅ تم إرسال رابط إعادة التعيين إلى بريدك الإلكتروني!' : '✅ Reset link sent to your email!';
            successMsg.style.display = 'block';
            document.getElementById('forgotPasswordEmail').value = '';
            showToast(currentLang === 'ar' ? '📧 تحقق من بريدك الإلكتروني' : '📧 Check your email');
        } else {
            errorMsg.textContent = data.error || (currentLang === 'ar' ? 'خطأ في إرسال الرابط' : 'Error sending link');
            errorMsg.style.display = 'block';
        }
    } catch (error) {
        errorMsg.textContent = currentLang === 'ar' ? 'خطأ في الاتصال بالخادم' : 'Server connection error';
        errorMsg.style.display = 'block';
    } finally {
        sendBtn.disabled = false;
        sendBtn.textContent = currentLang === 'ar' ? 'إرسال رابط إعادة التعيين' : 'Send Reset Link';
    }
}

// Auth Handlers
async function handleLogin() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const rememberMe = document.getElementById('rememberMe').checked;
    const errorMsg = document.getElementById('loginErrorMsg');

    if (!email || !password) {
        errorMsg.textContent = currentLang === 'ar' ? 'الرجاء ملء جميع الحقول' : 'Please fill all fields';
        errorMsg.style.display = 'block';
        return;
    }

    // Get reCAPTCHA response
    let recaptchaToken = null;
    if (typeof grecaptcha !== 'undefined' && recaptchaLoginWidget !== null) {
        try {
            recaptchaToken = grecaptcha.getResponse(recaptchaLoginWidget);
            if (!recaptchaToken) {
                errorMsg.textContent = currentLang === 'ar' ? 'الرجاء التحقق من أنك لست روبوت' : 'Please verify you are not a robot';
                errorMsg.style.display = 'block';
                return;
            }
        } catch (e) {
            console.warn('reCAPTCHA not configured, skipping validation');
        }
    }

    try {
        const response = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'login',
                email,
                password,
                rememberMe,
                recaptchaToken
            })
        });

        const data = await response.json();

        if (response.ok) {
            // Login successful
            sessionToken = data.sessionToken;
            localStorage.setItem('sessionToken', sessionToken);
            localStorage.setItem('userEmail', data.email); // Store email for report function
            currentUser = { email: data.email };
            router.navigate('/'); // Use router instead of showMainApp()
            showToast(currentLang === 'ar' ? 'تم تسجيل الدخول بنجاح!' : 'Successfully logged in!');
        } else {
            // Check if needs verification
            if (data.needsVerification) {
                pendingVerificationEmail = data.email;
                showVerificationForm(data.email);
                router.navigate('/verify'); // Use router
                errorMsg.textContent = '';
                errorMsg.style.display = 'none';
                showToast(currentLang === 'ar' ? '⚠️ يرجى التحقق من بريدك الإلكتروني أولاً' : '⚠️ Please verify your email first');
            } else {
                errorMsg.textContent = data.error || (currentLang === 'ar' ? 'خطأ في تسجيل الدخول' : 'Login error');
                errorMsg.style.display = 'block';
            }
        }
    } catch (error) {
        errorMsg.textContent = currentLang === 'ar' ? 'خطأ في الاتصال بالخادم' : 'Server connection error';
        errorMsg.style.display = 'block';
    }
}

async function handleRegister() {
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('registerConfirmPassword').value;
    const rememberMe = document.getElementById('rememberMe') ? document.getElementById('rememberMe').checked : false;
    const errorMsg = document.getElementById('registerErrorMsg');

    if (!email || !password || !confirmPassword) {
        errorMsg.textContent = currentLang === 'ar' ? 'الرجاء ملء جميع الحقول' : 'Please fill all fields';
        errorMsg.style.display = 'block';
        return;
    }

    if (password !== confirmPassword) {
        errorMsg.textContent = currentLang === 'ar' ? 'كلمات المرور غير متطابقة' : 'Passwords do not match';
        errorMsg.style.display = 'block';
        return;
    }

    // Get reCAPTCHA response
    let recaptchaToken = null;
    if (typeof grecaptcha !== 'undefined' && recaptchaRegisterWidget !== null) {
        try {
            recaptchaToken = grecaptcha.getResponse(recaptchaRegisterWidget);
            if (!recaptchaToken) {
                errorMsg.textContent = currentLang === 'ar' ? 'الرجاء التحقق من أنك لست روبوت' : 'Please verify you are not a robot';
                errorMsg.style.display = 'block';
                return;
            }
        } catch (e) {
            console.warn('reCAPTCHA not configured, skipping validation');
        }
    }

    try {
        const response = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'register',
                email,
                password,
                rememberMe,
                recaptchaToken
            })
        });

        const data = await response.json();

        if (response.ok) {
            // Registration successful - now need verification
            if (data.needsVerification) {
                pendingVerificationEmail = data.email;
                showVerificationForm(data.email, data.devCode);
                router.navigate('/verify'); // Use router
                showToast(currentLang === 'ar' ? '✅ تم إرسال رمز التحقق إلى بريدك!' : '✅ Verification code sent to your email!');
            } else {
                // No verification needed (shouldn't happen with new flow)
                sessionToken = data.sessionToken;
                localStorage.setItem('sessionToken', sessionToken);
                currentUser = { email: data.email };
                router.navigate('/'); // Use router
                showToast(currentLang === 'ar' ? 'تم إنشاء الحساب بنجاح!' : 'Account created successfully!');
            }
        } else {
            errorMsg.textContent = data.error || (currentLang === 'ar' ? 'خطأ في التسجيل' : 'Registration error');
            errorMsg.style.display = 'block';
        }
    } catch (error) {
        errorMsg.textContent = currentLang === 'ar' ? 'خطأ في الاتصال بالخادم' : 'Server connection error';
        errorMsg.style.display = 'block';
    }
}

// Verification Handlers
function showVerificationForm(email, devCode) {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('registerForm').style.display = 'none';
    document.getElementById('verifyForm').style.display = 'block';
    document.getElementById('verifyEmailDisplay').textContent = email;
    document.getElementById('verificationCodeInput').value = '';
    document.getElementById('verifyErrorMsg').textContent = '';
    document.getElementById('verifyErrorMsg').style.display = 'none';
    
    // For development - show code in UI
    if (devCode) {
        const devDisplay = document.getElementById('devCodeDisplay');
        devDisplay.textContent = `🔧 Development Code: ${devCode}`;
        devDisplay.style.display = 'block';
        console.log('📧 Verification Code:', devCode);
    }
}

async function handleVerifyEmail() {
    const code = document.getElementById('verificationCodeInput').value.trim();
    const errorMsg = document.getElementById('verifyErrorMsg');

    if (!code || code.length !== 6) {
        errorMsg.textContent = currentLang === 'ar' ? 'الرجاء إدخال رمز مكون من 6 أرقام' : 'Please enter a 6-digit code';
        errorMsg.style.display = 'block';
        return;
    }

    try {
        const response = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'verify-email',
                email: pendingVerificationEmail,
                code: code
            })
        });

        const data = await response.json();

        if (response.ok) {
            sessionToken = data.sessionToken;
            localStorage.setItem('sessionToken', sessionToken);
            localStorage.setItem('userEmail', data.email);
            currentUser = { email: data.email };
            router.navigate('/'); // Use router
            showToast(currentLang === 'ar' ? '🎉 تم التحقق بنجاح! مرحباً بك!' : '🎉 Successfully verified! Welcome!');
        } else {
            errorMsg.textContent = data.error || (currentLang === 'ar' ? 'رمز تحقق غير صحيح' : 'Invalid verification code');
            errorMsg.style.display = 'block';
        }
    } catch (error) {
        errorMsg.textContent = currentLang === 'ar' ? 'خطأ في الاتصال بالخادم' : 'Server connection error';
        errorMsg.style.display = 'block';
    }
}

async function handleResendCode() {
    if (!pendingVerificationEmail) return;

    try {
        const response = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'resend-code',
                email: pendingVerificationEmail
            })
        });

        const data = await response.json();

        if (response.ok) {
            showToast(currentLang === 'ar' ? '✅ تم إعادة إرسال الرمز' : '✅ Code resent');
            
            // Show dev code if available
            if (data.devCode) {
                const devDisplay = document.getElementById('devCodeDisplay');
                devDisplay.textContent = `🔧 Development Code: ${data.devCode}`;
                devDisplay.style.display = 'block';
                console.log('📧 New Verification Code:', data.devCode);
            }
        } else {
            showToast(currentLang === 'ar' ? '❌ فشل إعادة الإرسال' : '❌ Failed to resend');
        }
    } catch (error) {
        showToast(currentLang === 'ar' ? '❌ خطأ في الخادم' : '❌ Server error');
    }
}

// Main App Event Listeners
function initializeEventListeners() {
    // Language Toggle
    document.getElementById('langBtn').addEventListener('click', toggleLanguage);

    // Search
    document.getElementById('searchBox').addEventListener('input', searchVideos);

    // Filter
    document.getElementById('filterBtn').addEventListener('click', toggleFilters);
    
    // Category Filters
    const categoryFilters = document.querySelectorAll('[data-category]');
    categoryFilters.forEach(btn => {
        btn.addEventListener('click', function() {
            categoryFilters.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentCategory = this.dataset.category;
            filterVideos();
        });
    });

    // Genre Filters
    const genreFilters = document.querySelectorAll('[data-genre]');
    genreFilters.forEach(btn => {
        btn.addEventListener('click', function() {
            genreFilters.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentGenre = this.dataset.genre;
            filterVideos();
        });
    });

    // Sort Filters
    const sortFilters = document.querySelectorAll('[data-sort]');
    sortFilters.forEach(btn => {
        btn.addEventListener('click', function() {
            sortFilters.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentSort = this.dataset.sort;
            filterVideos();
        });
    });

    // View Controls
    const viewBtns = document.querySelectorAll('.view-btn');
    viewBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            viewBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentView = this.dataset.view;
            toggleView();
        });
    });

    // Modal
    document.getElementById('closeModal').addEventListener('click', closeModal);
    document.getElementById('videoModal').addEventListener('click', function(e) {
        if (e.target === this) closeModal();
    });

    // Favorites
    document.getElementById('favoritesBtn').addEventListener('click', toggleFavoritesPanel);
    document.getElementById('closeFavoritesPanel').addEventListener('click', closeFavoritesPanel);

    // Mobile Menu
    document.getElementById('menuToggle').addEventListener('click', toggleMobileMenu);
    document.getElementById('closeMenu').addEventListener('click', closeMobileMenu);

    // Modal Favorite Button
    document.getElementById('modalFavoriteBtn').addEventListener('click', toggleCurrentVideoFavorite);

    // Share Button
    document.getElementById('shareBtn').addEventListener('click', shareVideo);

    // Settings
    document.getElementById('settingsBtn').addEventListener('click', openSettings);
    document.getElementById('closeSettings').addEventListener('click', closeSettings);
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    document.getElementById('changePasswordBtn').addEventListener('click', handleChangePassword);
    document.getElementById('reportBtn').addEventListener('click', openReportPage);

    // Open Movie Page
    document.getElementById('openMoviePage').addEventListener('click', openMoviePage);

    // Close on Escape
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeModal();
            closeFavoritesPanel();
            closeMobileMenu();
            closeSettings();
        }
    });
}

// Settings Functions
function openSettings() {
    router.navigate('/settings'); // Use router
}

function closeSettings() {
    const settingsModal = document.getElementById('settingsModal');
    if (settingsModal) {
        settingsModal.classList.remove('active');
    }
    document.body.style.overflow = 'auto';
    
    // Clear password fields and error messages
    const newPasswordField = document.getElementById('newPassword');
    const confirmPasswordField = document.getElementById('confirmNewPassword');
    const errorMsg = document.getElementById('passwordErrorMsg');
    
    if (newPasswordField) newPasswordField.value = '';
    if (confirmPasswordField) confirmPasswordField.value = '';
    if (errorMsg) errorMsg.style.display = 'none';
    
    // Only navigate if user is logged in
    if (currentUser) {
        router.navigate('/'); // Navigate back to home
    } else {
        router.navigate('/login'); // Navigate to login if somehow logged out
    }
}

function openReportPage() {
    window.open('/report.html', '_blank');
}

async function handleChangePassword() {
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmNewPassword').value;
    const errorMsg = document.getElementById('passwordErrorMsg');
    const successMsg = document.getElementById('passwordSuccessMsg');

    errorMsg.style.display = 'none';
    successMsg.style.display = 'none';

    if (!newPassword || !confirmPassword) {
        errorMsg.textContent = currentLang === 'ar' ? 'الرجاء ملء جميع الحقول' : 'Please fill all fields';
        errorMsg.style.display = 'block';
        return;
    }

    if (newPassword !== confirmPassword) {
        errorMsg.textContent = currentLang === 'ar' ? 'كلمات المرور غير متطابقة' : 'Passwords do not match';
        errorMsg.style.display = 'block';
        return;
    }

    try {
        const response = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'change-password',
                sessionToken,
                password: newPassword
            })
        });

        const data = await response.json();

        if (response.ok) {
            successMsg.textContent = currentLang === 'ar' ? 'تم تغيير كلمة المرور بنجاح!' : 'Password changed successfully!';
            successMsg.style.display = 'block';
            document.getElementById('newPassword').value = '';
            document.getElementById('confirmNewPassword').value = '';
            showToast(currentLang === 'ar' ? 'تم تغيير كلمة المرور بنجاح' : 'Password changed successfully');
    } else {
            errorMsg.textContent = data.error;
        errorMsg.style.display = 'block';
        }
    } catch (error) {
        errorMsg.textContent = currentLang === 'ar' ? 'خطأ في الاتصال' : 'Connection error';
        errorMsg.style.display = 'block';
    }
}

async function handleLogout() {
    console.log('🚪 Logging out user');
    
    // Close settings modal if open
    const settingsModal = document.getElementById('settingsModal');
    if (settingsModal && settingsModal.classList.contains('active')) {
        settingsModal.classList.remove('active');
        document.body.style.overflow = 'auto';
    }
    
    // Call logout API to invalidate session on server
    if (sessionToken) {
        try {
            await fetch('/api/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'logout',
                    sessionToken
                })
            });
            console.log('✅ Server session invalidated');
        } catch (error) {
            console.error('❌ Logout API error:', error);
        }
    }

    // Clear all local data
    localStorage.removeItem('sessionToken');
    localStorage.removeItem('userEmail');
    sessionToken = null;
    currentUser = null;
    
    // Clear main app initialization flag to force re-initialization on next login
    const mainApp = document.getElementById('mainApp');
    if (mainApp) {
        delete mainApp.dataset.initialized;
    }
    
    // Clear auth page initialization flag too
    const authPage = document.getElementById('authPage');
    if (authPage) {
        delete authPage.dataset.initialized;
    }
    
    console.log('✅ Logout complete');
    router.navigate('/login'); // Use router instead of reload
    showToast(currentLang === 'ar' ? '👋 تم تسجيل الخروج' : '👋 Logged out');
}

// Render Trending Section
function renderTrending() {
    const carousel = document.getElementById('trendingCarousel');
    const trendingVideos = allVideos.filter(v => v.trending === true || v.views > 1000).slice(0, 5);
    
    carousel.innerHTML = '';
    
    trendingVideos.forEach(video => {
        const card = document.createElement('div');
        card.className = 'trending-card';
        const title = currentLang === 'ar' ? video.titleAr : video.titleEn;
        const categoryText = getCategoryText(video.category);
        
        card.innerHTML = `
            <div class="trending-thumbnail">
                <div class="trending-play">▶</div>
                <div class="trending-badge">🔥 ${video.views || 0} ${currentLang === 'ar' ? 'مشاهدة' : 'views'}</div>
            </div>
            <div class="trending-info">
                <h3>${title}</h3>
                <p>${video.year} • HD • ${categoryText}</p>
            </div>
        `;
        
        card.addEventListener('click', () => openVideo(video));
        carousel.appendChild(card);
    });
}

// Render Continue Watching
function renderContinueWatching() {
    const section = document.getElementById('continueWatchingSection');
    const grid = document.getElementById('continueWatchingGrid');
    
    if (continueWatching.length === 0) {
        section.style.display = 'none';
        return;
    }
    
    section.style.display = 'block';
    grid.innerHTML = '';
    
    continueWatching.slice(0, 4).forEach(item => {
        const video = allVideos.find(v => v.id === item.id);
        if (!video) return;
        
        const card = document.createElement('div');
        card.className = 'video-card continue-watching-card';
        const title = currentLang === 'ar' ? video.titleAr : video.titleEn;
        
        card.innerHTML = `
            <div class="video-thumbnail">
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${item.progress || 0}%"></div>
                </div>
                ▶
            </div>
            <div class="video-info">
                <div class="video-title">${title}</div>
                <div class="video-meta">
                    <span>${item.progress || 0}%</span>
                    <span>•</span>
                    <span>${video.year}</span>
                </div>
            </div>
        `;
        
        card.addEventListener('click', () => openVideo(video));
        grid.appendChild(card);
    });
}

// Render Videos
function renderVideos(videosToRender) {
    const grid = document.getElementById('videoGrid');
    grid.innerHTML = '';
    
    if (videosToRender.length === 0) {
        grid.innerHTML = `<p style="grid-column: 1/-1; text-align: center; padding: 40px; color: rgba(255,255,255,0.5);">
            ${currentLang === 'ar' ? 'لا توجد نتائج' : 'No results found'}
        </p>`;
        return;
    }
    
    videosToRender.forEach(video => {
        const card = document.createElement('div');
        card.className = 'video-card';
        
        const isFavorite = favorites.includes(video.id);
        const title = currentLang === 'ar' ? video.titleAr : video.titleEn;
        const categoryText = getCategoryText(video.category);
        
        card.innerHTML = `
            <div class="video-thumbnail">
                <div class="favorite-icon ${isFavorite ? 'active' : ''}" onclick="toggleFavorite(event, ${video.id})">
                    ${isFavorite ? '❤️' : '♡'}
                </div>
                ▶
            </div>
            <div class="video-info">
                <div class="video-title">${title}</div>
                <div class="video-meta">
                    <span>${video.year}</span>
                    <span>•</span>
                    <span>HD</span>
                    <span>•</span>
                    <span>${categoryText}</span>
                </div>
            </div>
        `;
        
        card.addEventListener('click', function(e) {
            if (!e.target.classList.contains('favorite-icon')) {
                openVideo(video);
            }
        });
        
        grid.appendChild(card);
    });
}

// Open Video Modal
async function openVideo(video) {
    currentVideoId = video.id;
    const modal = document.getElementById('videoModal');
    const player = document.getElementById('videoPlayer');
    const title = document.getElementById('modalTitle');
    const desc = document.getElementById('modalDescription');
    const year = document.getElementById('modalYear');
    const category = document.getElementById('modalCategory');
    const favoriteBtn = document.getElementById('modalFavoriteBtn');
    const serverButtons = document.getElementById('serverButtons');
    
    title.textContent = currentLang === 'ar' ? video.titleAr : video.titleEn;
    desc.textContent = currentLang === 'ar' ? video.descAr : video.descEn;
    year.textContent = video.year;
    category.textContent = getCategoryText(video.category);
    
    // Update favorite button
    const isFavorite = favorites.includes(video.id);
    favoriteBtn.classList.toggle('active', isFavorite);
    favoriteBtn.querySelector('.heart').textContent = isFavorite ? '♥' : '♡';
    
    // Load rating
    await loadRating(video.id);
    
    // Populate servers
    serverButtons.innerHTML = '';
    video.servers.forEach((server, index) => {
        const btn = document.createElement('button');
        btn.className = 'server-btn' + (index === 0 ? ' active' : '');
        btn.innerHTML = `<span>📡</span> ${server.name}`;
        btn.addEventListener('click', () => {
            document.querySelectorAll('.server-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            loadServer(server.url);
        });
        serverButtons.appendChild(btn);
    });
    
    // Load first server by default
    if (video.servers.length > 0) {
        loadServer(video.servers[0].url);
    }
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function loadServer(url) {
    const player = document.getElementById('videoPlayer');
    player.innerHTML = `
        <iframe 
            src="${url}" 
            style="width: 100%; height: 100%; border: none;"
            allowfullscreen
            allow="autoplay; fullscreen">
        </iframe>
    `;
}

async function loadRating(movieId) {
    try {
        const response = await fetch(`/api/movies?movieId=${movieId}`);
        const data = await response.json();
        
        updateRatingDisplay(data.average || 0, data.count || 0);
    } catch (error) {
        console.error('Error loading rating:', error);
        updateRatingDisplay(0, 0);
    }

    // Setup rating stars
    const stars = document.querySelectorAll('#ratingStars .star-rate');
    stars.forEach(star => {
        star.addEventListener('click', () => rateMovie(movieId, parseInt(star.dataset.rating)));
        star.addEventListener('mouseenter', () => highlightStars(star.dataset.rating));
        star.addEventListener('mouseleave', () => resetStars());
    });
}

function updateRatingDisplay(average, count) {
    const starsDisplay = document.getElementById('averageRating');
    const ratingCount = document.getElementById('ratingCount');
    
    starsDisplay.innerHTML = '';
    for (let i = 1; i <= 5; i++) {
        const star = document.createElement('span');
        star.className = i <= Math.round(average) ? 'star-filled' : 'star-empty';
        star.textContent = i <= Math.round(average) ? '★' : '☆';
        starsDisplay.appendChild(star);
    }
    
    ratingCount.textContent = `(${count})`;
}

function highlightStars(rating) {
    const stars = document.querySelectorAll('#ratingStars .star-rate');
    stars.forEach((star, index) => {
        if (index < rating) {
            star.classList.add('active');
        } else {
            star.classList.remove('active');
        }
    });
}

function resetStars() {
    const stars = document.querySelectorAll('#ratingStars .star-rate');
    stars.forEach(star => star.classList.remove('active'));
}

async function rateMovie(movieId, rating) {
    try {
        const response = await fetch('/api/movies', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'rate',
                movieId,
                rating,
                userId: currentUser.email
            })
        });

        const data = await response.json();

        if (response.ok) {
            updateRatingDisplay(data.average, data.count);
            showToast(currentLang === 'ar' ? `تم التقييم: ${rating} نجوم` : `Rated: ${rating} stars`);
        }
    } catch (error) {
        showToast(currentLang === 'ar' ? 'خطأ في إرسال التقييم' : 'Error submitting rating');
    }
}

function openMoviePage() {
    if (currentVideoId) {
        router.navigate(`/movie/${currentVideoId}`);
    }
}

// Close Modal
function closeModal() {
    const modal = document.getElementById('videoModal');
    const player = document.getElementById('videoPlayer');
    player.innerHTML = '';
    modal.classList.remove('active');
    document.body.style.overflow = 'auto';
    currentVideoId = null;
}

// Search Videos
function searchVideos() {
    const searchTerm = document.getElementById('searchBox').value.toLowerCase();
    let filtered = allVideos.filter(video => 
        video.titleAr.toLowerCase().includes(searchTerm) || 
        video.titleEn.toLowerCase().includes(searchTerm)
    );
    
    if (currentCategory !== 'all') {
        filtered = filtered.filter(v => v.category === currentCategory);
    }
    
    renderVideos(filtered);
}

// Filter Videos
function filterVideos() {
    const searchTerm = document.getElementById('searchBox').value.toLowerCase();
    let filtered = allVideos;
    
    // Apply category filter
    if (currentCategory !== 'all') {
        filtered = filtered.filter(v => v.category === currentCategory);
    }
    
    // Apply genre filter
    if (currentGenre !== 'all') {
        filtered = filtered.filter(v => v.genre === currentGenre);
    }
    
    // Apply search filter
    if (searchTerm) {
        filtered = filtered.filter(video => 
            video.titleAr.toLowerCase().includes(searchTerm) || 
            video.titleEn.toLowerCase().includes(searchTerm)
        );
    }
    
    // Apply sorting
    filtered = sortVideos(filtered, currentSort);
    
    renderVideos(filtered);
}

// Sort Videos
function sortVideos(videos, sortBy) {
    const sorted = [...videos]; // Create a copy
    
    switch(sortBy) {
        case 'recent':
            return sorted.sort((a, b) => (b.year || 0) - (a.year || 0));
        case 'rating':
            // Sort by views as a proxy for popularity (you can add actual ratings later)
            return sorted.sort((a, b) => (b.views || 0) - (a.views || 0));
        case 'name':
            return sorted.sort((a, b) => {
                const nameA = currentLang === 'ar' ? a.titleAr : a.titleEn;
                const nameB = currentLang === 'ar' ? b.titleAr : b.titleEn;
                return nameA.localeCompare(nameB);
            });
        case 'year':
            return sorted.sort((a, b) => (b.year || 0) - (a.year || 0));
        default:
            return sorted;
    }
}

// Toggle Filters
function toggleFilters() {
    const panel = document.getElementById('filterPanel');
    panel.classList.toggle('active');
}

// Toggle View
function toggleView() {
    const grid = document.getElementById('videoGrid');
    if (currentView === 'list') {
        grid.classList.add('list-view');
    } else {
        grid.classList.remove('list-view');
    }
}

// Favorites Management
function loadFavorites() {
    const stored = localStorage.getItem(`favorites_${currentUser.email}`);
    favorites = stored ? JSON.parse(stored) : [];
    updateFavoritesBadge();
}

function saveFavorites() {
    localStorage.setItem(`favorites_${currentUser.email}`, JSON.stringify(favorites));
}

function toggleFavorite(event, videoId) {
    event.stopPropagation();
    const index = favorites.indexOf(videoId);
    
    if (index > -1) {
        favorites.splice(index, 1);
        showToast(currentLang === 'ar' ? 'تم الإزالة من المفضلة' : 'Removed from favorites');
    } else {
        favorites.push(videoId);
        showToast(currentLang === 'ar' ? 'تم الإضافة إلى المفضلة' : 'Added to favorites');
    }
    
    saveFavorites();
    updateFavoritesBadge();
    renderVideos(getCurrentVideos());
    updateFavoritesPanel();
}

function toggleCurrentVideoFavorite() {
    if (currentVideoId) {
        const index = favorites.indexOf(currentVideoId);
        const favoriteBtn = document.getElementById('modalFavoriteBtn');
        
        if (index > -1) {
            favorites.splice(index, 1);
            favoriteBtn.classList.remove('active');
            favoriteBtn.querySelector('.heart').textContent = '♡';
            showToast(currentLang === 'ar' ? 'تم الإزالة من المفضلة' : 'Removed from favorites');
        } else {
            favorites.push(currentVideoId);
            favoriteBtn.classList.add('active');
            favoriteBtn.querySelector('.heart').textContent = '♥';
            showToast(currentLang === 'ar' ? 'تم الإضافة إلى المفضلة' : 'Added to favorites');
        }
        
        saveFavorites();
        updateFavoritesBadge();
        renderVideos(getCurrentVideos());
        updateFavoritesPanel();
    }
}

function updateFavoritesBadge() {
    const badge = document.getElementById('favoritesBadge');
    badge.textContent = favorites.length;
    badge.style.display = favorites.length > 0 ? 'flex' : 'none';
}

function getCurrentVideos() {
    const searchTerm = document.getElementById('searchBox').value.toLowerCase();
    let filtered = allVideos;
    
    if (currentCategory !== 'all') {
        filtered = filtered.filter(v => v.category === currentCategory);
    }
    
    if (searchTerm) {
        filtered = filtered.filter(video => 
            video.titleAr.toLowerCase().includes(searchTerm) || 
            video.titleEn.toLowerCase().includes(searchTerm)
        );
    }
    
    return filtered;
}

// Favorites Panel
function toggleFavoritesPanel() {
    const panel = document.getElementById('favoritesPanel');
    panel.classList.toggle('active');
    if (panel.classList.contains('active')) {
        updateFavoritesPanel();
    }
}

function closeFavoritesPanel() {
    document.getElementById('favoritesPanel').classList.remove('active');
}

function updateFavoritesPanel() {
    const content = document.getElementById('favoritesContent');
    const favoriteVideos = allVideos.filter(v => favorites.includes(v.id));
    
    if (favoriteVideos.length === 0) {
        content.innerHTML = `<p class="empty-message">
            ${currentLang === 'ar' ? 'لا توجد عناصر في المفضلة' : 'No items in favorites'}
        </p>`;
        return;
    }
    
    content.innerHTML = '';
    favoriteVideos.forEach(video => {
        const card = document.createElement('div');
        card.className = 'video-card';
        card.style.marginBottom = '15px';
        
        const title = currentLang === 'ar' ? video.titleAr : video.titleEn;
        
        card.innerHTML = `
            <div class="video-thumbnail" style="height: 150px; font-size: 40px;">▶</div>
            <div class="video-info">
                <div class="video-title">${title}</div>
                <div class="video-meta">
                    <span>${video.year}</span>
                    <span>•</span>
                    <span>HD</span>
                </div>
            </div>
        `;
        
        card.addEventListener('click', () => {
            openVideo(video);
            closeFavoritesPanel();
        });
        
        content.appendChild(card);
    });
}

// Mobile Menu
function toggleMobileMenu() {
    document.getElementById('mobileMenu').classList.add('active');
}

function closeMobileMenu() {
    document.getElementById('mobileMenu').classList.remove('active');
}

// Language Functions
function updateLanguage() {
    // Apply current language without toggling
    const html = document.documentElement;
    
    if (currentLang === 'en') {
        html.setAttribute('lang', 'en');
        html.setAttribute('dir', 'ltr');
        if (document.getElementById('langBtn')) {
        document.getElementById('langBtn').textContent = 'العربية';
        }
        if (document.getElementById('searchBox')) {
        document.getElementById('searchBox').placeholder = 'Search for movies and series...';
        }
    } else {
        html.setAttribute('lang', 'ar');
        html.setAttribute('dir', 'rtl');
        if (document.getElementById('langBtn')) {
        document.getElementById('langBtn').textContent = 'English';
        }
        if (document.getElementById('searchBox')) {
        document.getElementById('searchBox').placeholder = 'ابحث عن الأفلام والمسلسلات...';
        }
    }
    
    // Update all translatable elements
    document.querySelectorAll('[data-ar]').forEach(el => {
        const text = currentLang === 'ar' ? el.getAttribute('data-ar') : el.getAttribute('data-en');
        
        // Handle INPUT and BUTTON elements
        if (el.tagName === 'INPUT' || el.tagName === 'BUTTON') {
            if (el.placeholder !== undefined && el.hasAttribute('placeholder')) {
                el.placeholder = text;
            } else {
                el.textContent = text;
            }
        } 
        // Handle A (anchor/link) elements
        else if (el.tagName === 'A') {
            el.textContent = text;
        }
        // Handle elements with child links (like .auth-switch)
        else if (el.querySelector('a[data-ar]')) {
            // Skip - child links will be updated separately
            // Only update the text nodes, not the entire content
            const firstTextNode = Array.from(el.childNodes).find(node => node.nodeType === Node.TEXT_NODE);
            if (firstTextNode) {
                firstTextNode.textContent = text + ' ';
            }
        }
        // Handle all other elements
        else {
            el.textContent = text;
        }
    });
}
    
function toggleLanguage() {
    currentLang = currentLang === 'ar' ? 'en' : 'ar';
    updateLanguage();
    
    if (document.getElementById('mainApp').style.display === 'block') {
    renderVideos(getCurrentVideos());
    if (document.getElementById('favoritesPanel').classList.contains('active')) {
        updateFavoritesPanel();
        }
    }
}

// Helper Functions
function getCategoryText(category) {
    const categories = {
        'movie': { ar: 'فيلم', en: 'Movie' },
        'series': { ar: 'مسلسل', en: 'Series' },
        'documentary': { ar: 'وثائقي', en: 'Documentary' }
    };
    return categories[category] ? categories[category][currentLang] : category;
}

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

function shareVideo() {
    if (currentVideoId) {
        const video = allVideos.find(v => v.id === currentVideoId);
        const title = currentLang === 'ar' ? video.titleAr : video.titleEn;
        const text = `${currentLang === 'ar' ? 'شاهد' : 'Watch'}: ${title}`;
        const url = `${window.location.origin}/movie/${currentVideoId}`;
        
        if (navigator.share) {
            navigator.share({
                title: title,
                text: text,
                url: url
            }).then(() => {
                showToast(currentLang === 'ar' ? 'تمت المشاركة بنجاح' : 'Shared successfully');
            }).catch(() => {});
        } else {
            navigator.clipboard.writeText(url).then(() => {
                showToast(currentLang === 'ar' ? 'تم نسخ الرابط' : 'Link copied');
            });
        }
    }
}
