// Admin Panel Script for Syria Shof
let adminToken = null;
let currentPage = 1;
let currentReportId = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Check if admin is logged in
    adminToken = localStorage.getItem('adminToken');
    
    if (adminToken) {
        verifyAdminSession();
    } else {
        showLogin();
    }

    // Login form handler
    document.getElementById('loginForm').addEventListener('submit', handleAdminLogin);
});

// Show Login
function showLogin() {
    document.getElementById('admin-login').style.display = 'flex';
    document.getElementById('admin-panel').style.display = 'none';
}

// Show Admin Panel
function showAdminPanel(adminEmail) {
    document.getElementById('admin-login').style.display = 'none';
    document.getElementById('admin-panel').style.display = 'block';
    
    // Set admin info
    const firstLetter = adminEmail.charAt(0).toUpperCase();
    document.getElementById('adminAvatar').textContent = firstLetter;
    document.getElementById('adminName').textContent = 'Admin';
    document.getElementById('adminEmailDisplay').textContent = adminEmail;
    
    // Load dashboard
    showSection('dashboard');
}

// Verify Admin Session
async function verifyAdminSession() {
    try {
        const response = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'verify-session',
                sessionToken: adminToken
            })
        });

        const data = await response.json();

        if (response.ok && data.valid) {
            showAdminPanel(data.email);
        } else {
            // Session invalid, show login
            localStorage.removeItem('adminToken');
            adminToken = null;
            showLogin();
        }
    } catch (error) {
        console.error('Session verification error:', error);
        showLogin();
    }
}

// Handle Admin Login
async function handleAdminLogin(e) {
    e.preventDefault();

    const email = document.getElementById('adminEmail').value.trim();
    const password = document.getElementById('adminPassword').value;
    const errorMsg = document.getElementById('loginError');

    errorMsg.style.display = 'none';

    try {
        const response = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'login',
                email,
                password,
                recaptchaToken: 'admin-bypass' // Admins don't need reCAPTCHA
            })
        });

        const data = await response.json();

        if (response.ok && data.sessionToken) {
            // Store admin token
            adminToken = data.sessionToken;
            localStorage.setItem('adminToken', adminToken);
            
            // Show admin panel
            showAdminPanel(data.email);
            showToast('✅ تم تسجيل الدخول بنجاح!');
        } else {
            errorMsg.textContent = data.error || 'خطأ في تسجيل الدخول. تحقق من الصلاحيات.';
            errorMsg.style.display = 'block';
        }
    } catch (error) {
        console.error('Login error:', error);
        errorMsg.textContent = 'خطأ في الاتصال بالخادم';
        errorMsg.style.display = 'block';
    }
}

// Admin Logout
async function adminLogout() {
    try {
        await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'logout',
                sessionToken: adminToken
            })
        });
    } catch (error) {
        console.error('Logout error:', error);
    }

    // Clear token and show login
    localStorage.removeItem('adminToken');
    adminToken = null;
    showLogin();
    showToast('👋 تم تسجيل الخروج');
}

// Show Section
function showSection(section) {
    // Remove active class from all menu items
    document.querySelectorAll('.sidebar-menu a').forEach(link => {
        link.classList.remove('active');
    });

    // Add active class to clicked menu item
    event.target.closest('a').classList.add('active');

    // Hide all sections
    document.querySelectorAll('.admin-section').forEach(sec => {
        sec.classList.remove('active');
    });

    // Show selected section
    document.getElementById(`section-${section}`).classList.add('active');

    // Load data for the section
    switch(section) {
        case 'dashboard':
            loadDashboard();
            break;
        case 'movies':
            loadMovies();
            break;
        case 'users':
            loadUsers();
            break;
        case 'reports':
            loadReports();
            break;
        case 'logs':
            loadLogs();
            break;
    }
}

// ============================================
// DASHBOARD
// ============================================

async function loadDashboard() {
    try {
        const response = await fetch('/api/admin/dashboard', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionToken: adminToken })
        });

        const data = await response.json();

        if (response.ok) {
            // Update stats
            document.getElementById('stat-users').textContent = data.stats.totalUsers;
            document.getElementById('stat-movies').textContent = data.stats.totalMovies;
            document.getElementById('stat-reports').textContent = data.stats.pendingReports;
            document.getElementById('stat-comments').textContent = data.stats.totalComments;

            // Update top movies table
            const tbody = document.getElementById('top-movies-table');
            tbody.innerHTML = '';

            if (data.topMovies && data.topMovies.length > 0) {
                data.topMovies.forEach((movie, index) => {
                    const row = `
                        <tr>
                            <td>${index + 1}</td>
                            <td>${movie.title_ar}</td>
                            <td>⭐ ${movie.rating || 0}</td>
                            <td>👁️ ${movie.views || 0}</td>
                        </tr>
                    `;
                    tbody.innerHTML += row;
                });
            } else {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 40px;">لا توجد بيانات</td></tr>';
            }
        } else {
            showToast('❌ فشل تحميل لوحة المعلومات');
        }
    } catch (error) {
        console.error('Dashboard error:', error);
        showToast('❌ خطأ في تحميل البيانات');
    }
}

// ============================================
// MOVIES MANAGEMENT
// ============================================

async function loadMovies(page = 1, search = '') {
    try {
        const response = await fetch('/api/admin/movies/list', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionToken: adminToken,
                page,
                limit: 20,
                search
            })
        });

        const data = await response.json();

        if (response.ok) {
            renderMoviesTable(data.movies);
            renderPagination('movies', data.page, data.totalPages);
        } else {
            showToast('❌ فشل تحميل الأفلام');
        }
    } catch (error) {
        console.error('Load movies error:', error);
        showToast('❌ خطأ في تحميل الأفلام');
    }
}

function renderMoviesTable(movies) {
    const tbody = document.getElementById('movies-table');
    tbody.innerHTML = '';

    if (movies && movies.length > 0) {
        movies.forEach(movie => {
            const statusBadge = movie.status === 'active' ? 
                '<span class="badge badge-success">نشط</span>' :
                '<span class="badge badge-warning">مؤرشف</span>';

            const row = `
                <tr>
                    <td>${movie.id}</td>
                    <td>${movie.title_ar}</td>
                    <td>${movie.genre || '-'}</td>
                    <td>${movie.year || '-'}</td>
                    <td>${statusBadge}</td>
                    <td>
                        <div class="table-actions">
                            <button class="btn-icon edit" onclick="editMovie(${movie.id})">✏️</button>
                            <button class="btn-icon delete" onclick="deleteMovie(${movie.id})">🗑️</button>
                        </div>
                    </td>
                </tr>
            `;
            tbody.innerHTML += row;
        });
    } else {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px;">لا توجد أفلام</td></tr>';
    }
}

function searchMovies(query) {
    clearTimeout(window.searchTimeout);
    window.searchTimeout = setTimeout(() => {
        loadMovies(1, query);
    }, 500);
}

function openMovieModal() {
    document.getElementById('movieModal').style.display = 'flex';
    document.getElementById('movieForm').reset();
    document.getElementById('movie-id').value = '';
}

function closeMovieModal() {
    document.getElementById('movieModal').style.display = 'none';
}

async function editMovie(id) {
    // Fetch movie details and populate form
    // For now, just open the modal
    openMovieModal();
    document.getElementById('movie-id').value = id;
    showToast('⚠️ ميزة التعديل قيد التطوير');
}

async function saveMovie() {
    const id = document.getElementById('movie-id').value;
    const isEdit = id !== '';

    const movieData = {
        sessionToken: adminToken,
        title_ar: document.getElementById('movie-title-ar').value,
        title_en: document.getElementById('movie-title-en').value,
        description_ar: document.getElementById('movie-desc-ar').value,
        description_en: document.getElementById('movie-desc-en').value,
        video_url: document.getElementById('movie-video-url').value,
        poster_url: document.getElementById('movie-poster-url').value,
        thumbnail_url: document.getElementById('movie-thumbnail-url').value,
        duration: document.getElementById('movie-duration').value ? parseInt(document.getElementById('movie-duration').value) : null,
        year: document.getElementById('movie-year').value ? parseInt(document.getElementById('movie-year').value) : null,
        genre: document.getElementById('movie-genre').value,
        category: document.getElementById('movie-category').value,
        trending: document.getElementById('movie-trending').checked,
        featured: document.getElementById('movie-featured').checked
    };

    if (isEdit) {
        movieData.id = parseInt(id);
    }

    try {
        const endpoint = isEdit ? '/api/admin/movies/edit' : '/api/admin/movies/add';
        
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(movieData)
        });

        const data = await response.json();

        if (response.ok) {
            showToast(`✅ تم ${isEdit ? 'تعديل' : 'إضافة'} الفيلم بنجاح`);
            closeMovieModal();
            loadMovies();
        } else {
            showToast(`❌ ${data.error || 'فشل حفظ الفيلم'}`);
        }
    } catch (error) {
        console.error('Save movie error:', error);
        showToast('❌ خطأ في حفظ الفيلم');
    }
}

async function deleteMovie(id) {
    if (!confirm('هل أنت متأكد من حذف هذا الفيلم؟')) return;

    try {
        const response = await fetch('/api/admin/movies/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionToken: adminToken,
                id
            })
        });

        const data = await response.json();

        if (response.ok) {
            showToast('✅ تم حذف الفيلم بنجاح');
            loadMovies();
        } else {
            showToast(`❌ ${data.error || 'فشل حذف الفيلم'}`);
        }
    } catch (error) {
        console.error('Delete movie error:', error);
        showToast('❌ خطأ في حذف الفيلم');
    }
}

// ============================================
// USERS MANAGEMENT
// ============================================

async function loadUsers(page = 1, search = '') {
    try {
        const response = await fetch('/api/admin/users/list', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionToken: adminToken,
                page,
                limit: 50,
                search
            })
        });

        const data = await response.json();

        if (response.ok) {
            renderUsersTable(data.users);
            renderPagination('users', data.page, data.totalPages);
        } else {
            showToast('❌ فشل تحميل المستخدمين');
        }
    } catch (error) {
        console.error('Load users error:', error);
        showToast('❌ خطأ في تحميل المستخدمين');
    }
}

function renderUsersTable(users) {
    const tbody = document.getElementById('users-table');
    tbody.innerHTML = '';

    if (users && users.length > 0) {
        users.forEach(user => {
            const statusBadge = user.is_verified ? 
                '<span class="badge badge-success">✓ موثق</span>' :
                '<span class="badge badge-warning">⚠️ غير موثق</span>';
            
            const bannedBadge = user.banned ? 
                '<span class="badge badge-danger">🚫 محظور</span>' : '';

            const date = new Date(user.created_at).toLocaleDateString('ar-EG');

            const row = `
                <tr>
                    <td>${user.id}</td>
                    <td>${user.email}</td>
                    <td>${date}</td>
                    <td>${statusBadge} ${bannedBadge}</td>
                    <td>
                        <div class="table-actions">
                            ${!user.banned ? 
                                `<button class="btn-icon delete" onclick="banUser(${user.id})">🚫 حظر</button>` :
                                `<button class="btn-icon edit" onclick="unbanUser(${user.id})">✅ إلغاء الحظر</button>`
                            }
                            <button class="btn-icon delete" onclick="deleteUser(${user.id})">🗑️</button>
                        </div>
                    </td>
                </tr>
            `;
            tbody.innerHTML += row;
        });
    } else {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 40px;">لا توجد مستخدمين</td></tr>';
    }
}

function searchUsers(query) {
    clearTimeout(window.searchTimeout);
    window.searchTimeout = setTimeout(() => {
        loadUsers(1, query);
    }, 500);
}

async function banUser(userId) {
    const reason = prompt('سبب الحظر:');
    if (!reason) return;

    try {
        const response = await fetch('/api/admin/users/ban', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionToken: adminToken,
                userId,
                reason
            })
        });

        const data = await response.json();

        if (response.ok) {
            showToast('✅ تم حظر المستخدم بنجاح');
            loadUsers();
        } else {
            showToast(`❌ ${data.error || 'فشل حظر المستخدم'}`);
        }
    } catch (error) {
        console.error('Ban user error:', error);
        showToast('❌ خطأ في حظر المستخدم');
    }
}

async function unbanUser(userId) {
    try {
        const response = await fetch('/api/admin/users/unban', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionToken: adminToken,
                userId
            })
        });

        const data = await response.json();

        if (response.ok) {
            showToast('✅ تم إلغاء حظر المستخدم بنجاح');
            loadUsers();
        } else {
            showToast(`❌ ${data.error || 'فشل إلغاء الحظر'}`);
        }
    } catch (error) {
        console.error('Unban user error:', error);
        showToast('❌ خطأ في إلغاء الحظر');
    }
}

async function deleteUser(userId) {
    if (!confirm('هل أنت متأكد من حذف هذا المستخدم نهائياً؟ لا يمكن التراجع عن هذا الإجراء.')) return;

    try {
        const response = await fetch('/api/admin/users/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionToken: adminToken,
                userId
            })
        });

        const data = await response.json();

        if (response.ok) {
            showToast('✅ تم حذف المستخدم بنجاح');
            loadUsers();
        } else {
            showToast(`❌ ${data.error || 'فشل حذف المستخدم'}`);
        }
    } catch (error) {
        console.error('Delete user error:', error);
        showToast('❌ خطأ في حذف المستخدم');
    }
}

// ============================================
// REPORTS MANAGEMENT
// ============================================

async function loadReports(page = 1) {
    try {
        const response = await fetch('/api/admin/reports/list', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionToken: adminToken,
                page,
                limit: 20
            })
        });

        const data = await response.json();

        if (response.ok) {
            renderReportsTable(data.reports);
            renderPagination('reports', data.page, data.totalPages);
        } else {
            showToast('❌ فشل تحميل البلاغات');
        }
    } catch (error) {
        console.error('Load reports error:', error);
        showToast('❌ خطأ في تحميل البلاغات');
    }
}

function renderReportsTable(reports) {
    const tbody = document.getElementById('reports-table');
    tbody.innerHTML = '';

    if (reports && reports.length > 0) {
        reports.forEach(report => {
            let statusBadge;
            switch(report.status) {
                case 'pending':
                    statusBadge = '<span class="badge badge-warning">معلق</span>';
                    break;
                case 'reviewed':
                    statusBadge = '<span class="badge badge-info">تمت المراجعة</span>';
                    break;
                case 'resolved':
                    statusBadge = '<span class="badge badge-success">تم الحل</span>';
                    break;
                case 'dismissed':
                    statusBadge = '<span class="badge badge-danger">مرفوض</span>';
                    break;
                default:
                    statusBadge = '<span class="badge">غير معروف</span>';
            }

            const date = new Date(report.created_at).toLocaleDateString('ar-EG');

            const row = `
                <tr>
                    <td>${report.id}</td>
                    <td>${report.email || report.user_email || 'غير معروف'}</td>
                    <td>${report.category}</td>
                    <td>${date}</td>
                    <td>${statusBadge}</td>
                    <td>
                        <button class="btn-icon edit" onclick="viewReport(${report.id})">👁️ عرض</button>
                    </td>
                </tr>
            `;
            tbody.innerHTML += row;
        });
    } else {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px;">لا توجد بلاغات</td></tr>';
    }
}

function viewReport(reportId) {
    currentReportId = reportId;
    // In a real implementation, fetch full report details
    document.getElementById('reportModal').style.display = 'flex';
    showToast('⚠️ عرض التفاصيل الكاملة قيد التطوير');
}

function closeReportModal() {
    document.getElementById('reportModal').style.display = 'none';
    currentReportId = null;
}

async function updateReport() {
    if (!currentReportId) return;

    const status = document.getElementById('report-status').value;
    const adminNotes = document.getElementById('report-admin-notes').value;

    try {
        const response = await fetch('/api/admin/reports/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionToken: adminToken,
                reportId: currentReportId,
                status,
                adminNotes
            })
        });

        const data = await response.json();

        if (response.ok) {
            showToast('✅ تم تحديث البلاغ بنجاح');
            closeReportModal();
            loadReports();
        } else {
            showToast(`❌ ${data.error || 'فشل تحديث البلاغ'}`);
        }
    } catch (error) {
        console.error('Update report error:', error);
        showToast('❌ خطأ في تحديث البلاغ');
    }
}

// ============================================
// ADMIN LOGS
// ============================================

async function loadLogs(page = 1) {
    try {
        const response = await fetch('/api/admin/logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionToken: adminToken,
                page,
                limit: 50
            })
        });

        const data = await response.json();

        if (response.ok) {
            renderLogsTable(data.logs);
            renderPagination('logs', data.page, data.totalPages);
        } else {
            showToast('❌ فشل تحميل السجلات');
        }
    } catch (error) {
        console.error('Load logs error:', error);
        showToast('❌ خطأ في تحميل السجلات');
    }
}

function renderLogsTable(logs) {
    const tbody = document.getElementById('logs-table');
    tbody.innerHTML = '';

    if (logs && logs.length > 0) {
        logs.forEach(log => {
            const date = new Date(log.created_at).toLocaleString('ar-EG');
            const details = log.details ? JSON.stringify(log.details) : '-';

            const row = `
                <tr>
                    <td>${log.id}</td>
                    <td>${log.admin_email}</td>
                    <td><span class="badge badge-info">${log.action}</span></td>
                    <td>${date}</td>
                    <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis;">${details}</td>
                </tr>
            `;
            tbody.innerHTML += row;
        });
    } else {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 40px;">لا توجد سجلات</td></tr>';
    }
}

// ============================================
// PAGINATION
// ============================================

function renderPagination(section, currentPage, totalPages) {
    const container = document.getElementById(`${section}-pagination`);
    container.innerHTML = '';

    if (totalPages <= 1) return;

    // Previous button
    const prevBtn = document.createElement('button');
    prevBtn.className = 'page-btn';
    prevBtn.textContent = '«';
    prevBtn.disabled = currentPage === 1;
    prevBtn.onclick = () => {
        switch(section) {
            case 'movies': loadMovies(currentPage - 1); break;
            case 'users': loadUsers(currentPage - 1); break;
            case 'reports': loadReports(currentPage - 1); break;
            case 'logs': loadLogs(currentPage - 1); break;
        }
    };
    container.appendChild(prevBtn);

    // Page numbers
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, currentPage + 2);

    for (let i = startPage; i <= endPage; i++) {
        const pageBtn = document.createElement('button');
        pageBtn.className = `page-btn ${i === currentPage ? 'active' : ''}`;
        pageBtn.textContent = i;
        pageBtn.onclick = () => {
            switch(section) {
                case 'movies': loadMovies(i); break;
                case 'users': loadUsers(i); break;
                case 'reports': loadReports(i); break;
                case 'logs': loadLogs(i); break;
            }
        };
        container.appendChild(pageBtn);
    }

    // Next button
    const nextBtn = document.createElement('button');
    nextBtn.className = 'page-btn';
    nextBtn.textContent = '»';
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.onclick = () => {
        switch(section) {
            case 'movies': loadMovies(currentPage + 1); break;
            case 'users': loadUsers(currentPage + 1); break;
            case 'reports': loadReports(currentPage + 1); break;
            case 'logs': loadLogs(currentPage + 1); break;
        }
    };
    container.appendChild(nextBtn);
}

// ============================================
// UTILS
// ============================================

function showToast(message) {
    const toast = document.getElementById('toast');
    document.getElementById('toast-message').textContent = message;
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

