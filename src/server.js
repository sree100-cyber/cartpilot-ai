/**
 * CartPilot AI – Main Server
 */
require('dotenv').config();

const express = require('express');
const path = require('path');
const { initDb, queryOne } = require('./db/database');
const { seed } = require('./db/seed');

async function startServer() {
  // Initialize database first
  await initDb();

  const app = express();
  app.set('trust proxy', 1);
  const PORT = process.env.PORT || 3000;

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // Seed if empty
  const productCount = queryOne('SELECT COUNT(*) as count FROM products');
  if (!productCount || productCount.count === 0) {
    console.log('📦 No products found, seeding database...');
    await seed();
  }

  const { authRouter, requireSellerAuth } = require('./routes/auth');

  // Routes
  app.use(authRouter);
  app.use(require('./routes/paypal'));
  app.use(require('./routes/chat'));

  // Serve seller login page
  app.get('/seller/login', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
  });

  // Protected seller dashboard
  app.get('/seller', requireSellerAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'seller.html'));
  });

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Error handler
  app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  app.listen(PORT, () => {
    console.log(`
  ╔══════════════════════════════════════════════╗
  ║        🛒  CartPilot AI is running!          ║
  ║                                              ║
  ║   Customer Chat:    http://localhost:${PORT}      ║
  ║   Seller Dashboard: http://localhost:${PORT}/seller ║
  ╚══════════════════════════════════════════════╝
    `);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
