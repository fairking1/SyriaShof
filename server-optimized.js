const cluster = require('cluster');
const os = require('os');
const express = require('express');
const cors = require('cors');
const path = require('path');
const compression = require('compression');
require('dotenv').config();

// Import cache
const cache = require('./config/cache');

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'production';

// For 2-core VPS, use 2 workers
const numCPUs = Math.min(os.cpus().length, 2);

if (cluster.isPrimary && NODE_ENV === 'production') {
  console.log(`🚀 Master process ${process.pid} is running`);
  console.log(`🔥 Starting ${numCPUs} workers for ${numCPUs} CPU cores`);

  // Fork workers
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.log(`❌ Worker ${worker.process.pid} died. Starting new worker...`);
    cluster.fork();
  });

  // Memory monitoring
  setInterval(() => {
    const used = process.memoryUsage();
    console.log(`💾 Memory Usage: ${Math.round(used.heapUsed / 1024 / 1024)}MB / ${Math.round(used.heapTotal / 1024 / 1024)}MB`);
    
    // If memory usage > 500MB, trigger garbage collection
    if (global.gc && used.heapUsed > 500 * 1024 * 1024) {
      global.gc();
      console.log('🧹 Garbage collection triggered');
    }
  }, 60000); // Every minute

} else {
  // Worker processes
  const app = express();

  // Trust proxy (for Coolify/reverse proxy)
  app.set('trust proxy', 1);

  // Gzip compression
  app.use(compression());

  // CORS
  app.use(cors());

  // Body parsers with limits
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Request logging (only in development)
  if (NODE_ENV === 'development') {
    app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
      if (req.body && Object.keys(req.body).length > 0) {
        console.log('Request body:', JSON.stringify(req.body, null, 2));
      }
      next();
    });
  }

  // Static files with aggressive caching
  app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: '7d', // Cache for 7 days
    etag: true,
    lastModified: true
  }));

  // API Routes
  const authRouter = require('./routes/auth');
  const moviesRouter = require('./routes/movies');
  const sendEmailRouter = require('./routes/send-email');
  const reportRouter = require('./routes/report');
  const adminRouter = require('./routes/admin');
  const commentsRouter = require('./routes/comments');
  const watchlistRouter = require('./routes/watchlist');
  const historyRouter = require('./routes/history');
  const streamRouter = require('./routes/stream');
  const profileRouter = require('./routes/profile');

  app.use('/api/auth', authRouter);
  app.use('/api/movies', moviesRouter);
  app.use('/api/send-email', sendEmailRouter);
  app.use('/api/report', reportRouter);
  app.use('/api/comments', commentsRouter);
  app.use('/api/watchlist', watchlistRouter);
  app.use('/api/history', historyRouter);
  app.use('/api/stream', streamRouter);
  app.use('/api/profile', profileRouter);
  app.use('/api/admin', adminRouter);

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    const uptime = process.uptime();
    const memUsage = process.memoryUsage();
    
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: NODE_ENV,
      uptime: `${Math.floor(uptime / 60)} minutes`,
      memory: {
        used: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
        total: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`
      },
      cache: cache.getStats(),
      pid: process.pid
    });
  });

  // Cache stats endpoint (admin only)
  app.get('/api/cache/stats', (req, res) => {
    res.json(cache.getStats());
  });

  // Clear cache endpoint (admin only)
  app.post('/api/cache/clear', (req, res) => {
    cache.clear();
    res.json({ success: true, message: 'Cache cleared' });
  });

  // SPA Fallback
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  // Error handler
  app.use((err, req, res, next) => {
    console.error('❌ Server error:', err);
    res.status(500).json({
      error: 'Internal server error',
      message: NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
  });

  // Start server
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔═══════════════════════════════════════════╗
║   🇸🇾 Syria Shof Worker ${process.pid} Running! 🎬 ║
╠═══════════════════════════════════════════╣
║   Port: ${PORT}                            ║
║   Environment: ${NODE_ENV}               ║
║   Worker: ${cluster.worker ? cluster.worker.id : 'Single'}                              ║
║   Time: ${new Date().toISOString()}       ║
╚═══════════════════════════════════════════╝

🌐 Server available at:
   - Local: http://localhost:${PORT}
   - Network: http://0.0.0.0:${PORT}

📡 API endpoints:
   - POST /api/auth
   - POST /api/movies
   - POST /api/send-email
   - POST /api/report
   - POST /api/admin/* (Admin Panel)
   - GET  /api/health
   - GET  /api/cache/stats

⚡ Performance Mode: ${numCPUs}-core clustering
💾 Cache: Enabled
🗜️  Gzip: Enabled
    `);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
      console.log('HTTP server closed');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    console.log('SIGINT signal received: closing HTTP server');
    server.close(() => {
      console.log('HTTP server closed');
      process.exit(0);
    });
  });
}

