// Simple in-memory cache for VPS optimization
// No Redis needed - uses Node.js memory efficiently

class SimpleCache {
  constructor() {
    this.cache = new Map();
    this.ttl = new Map(); // Time to live for each key
    
    // Clean expired entries every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  /**
   * Set a value in cache with optional TTL (in seconds)
   */
  set(key, value, ttlSeconds = 300) {
    this.cache.set(key, value);
    this.ttl.set(key, Date.now() + (ttlSeconds * 1000));
    return true;
  }

  /**
   * Get a value from cache
   */
  get(key) {
    // Check if expired
    const expireTime = this.ttl.get(key);
    if (expireTime && expireTime < Date.now()) {
      this.delete(key);
      return null;
    }
    
    return this.cache.get(key) || null;
  }

  /**
   * Delete a key from cache
   */
  delete(key) {
    this.cache.delete(key);
    this.ttl.delete(key);
    return true;
  }

  /**
   * Clear all cache
   */
  clear() {
    this.cache.clear();
    this.ttl.clear();
    return true;
  }

  /**
   * Clean up expired entries
   */
  cleanup() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, expireTime] of this.ttl.entries()) {
      if (expireTime < now) {
        this.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`🧹 Cache cleanup: Removed ${cleaned} expired entries`);
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      size: this.cache.size,
      memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024, // MB
      entries: Array.from(this.cache.keys())
    };
  }

  /**
   * Cache middleware for Express
   */
  middleware(ttlSeconds = 300) {
    return (req, res, next) => {
      // Only cache GET requests
      if (req.method !== 'GET') {
        return next();
      }

      const key = `cache:${req.originalUrl}`;
      const cached = this.get(key);

      if (cached) {
        console.log(`✅ Cache HIT: ${req.originalUrl}`);
        return res.json(cached);
      }

      // Override res.json to cache the response
      const originalJson = res.json.bind(res);
      res.json = (data) => {
        this.set(key, data, ttlSeconds);
        console.log(`📦 Cache SET: ${req.originalUrl}`);
        return originalJson(data);
      };

      next();
    };
  }
}

// Create singleton instance
const cache = new SimpleCache();

module.exports = cache;

