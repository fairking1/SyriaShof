const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    if (req.body && Object.keys(req.body).length > 0) {
        console.log('Request body:', JSON.stringify(req.body, null, 2));
    }
    next();
});

// API Routes
const authRouter = require('./routes/auth');
const moviesRouter = require('./routes/movies');
const sendEmailRouter = require('./routes/send-email');
const reportRouter = require('./routes/report');
const adminRouter = require('./routes/admin');

app.use('/api/auth', authRouter);
app.use('/api/movies', moviesRouter);
app.use('/api/send-email', sendEmailRouter);
app.use('/api/report', reportRouter);
app.use('/api/admin', adminRouter);

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// Serve static files (frontend)
app.use(express.static(path.join(__dirname, 'public')));

// SPA routing - serve index.html for all non-API routes
app.get('*', (req, res) => {
    // Don't serve index.html for API routes
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API endpoint not found' });
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ 
        error: 'Internal server error',
        message: err.message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔═══════════════════════════════════════════╗
║   🇸🇾 Syria Shof Server Running! 🎬      ║
╠═══════════════════════════════════════════╣
║   Port: ${PORT}                            ║
║   Environment: ${process.env.NODE_ENV || 'development'}               ║
║   Time: ${new Date().toISOString()}       ║
╚═══════════════════════════════════════════╝
    `);
    console.log(`🌐 Server available at:`);
    console.log(`   - Local: http://localhost:${PORT}`);
    console.log(`   - Network: http://0.0.0.0:${PORT}`);
    console.log(`\n📡 API endpoints:`);
    console.log(`   - POST /api/auth`);
    console.log(`   - POST /api/movies`);
    console.log(`   - POST /api/send-email`);
    console.log(`   - POST /api/report`);
    console.log(`   - POST /api/admin/* (Admin Panel)`);
    console.log(`   - GET  /api/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
        console.log('HTTP server closed');
        process.exit(0);
    });
});

