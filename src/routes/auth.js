/**
 * Seller Authentication Routes & Session Middleware
 */
const express = require('express');
const router = express.Router();
const crypto = require('crypto');

// In-memory active seller sessions (fine for hackathon / demo)
const activeSessions = new Set();

function parseCookies(req) {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return {};
  return Object.fromEntries(
    cookieHeader.split(';').map(c => {
      const [k, ...v] = c.trim().split('=');
      return [k, decodeURIComponent(v.join('='))];
    })
  );
}

function isAuthenticated(req) {
  const cookies = parseCookies(req);
  const token = cookies.seller_session;
  return Boolean(token && activeSessions.has(token));
}

// Middleware: Require authentication for protected seller endpoints
function requireSellerAuth(req, res, next) {
  if (isAuthenticated(req)) {
    return next();
  }
  // If API request, return 401
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Unauthorized. Please log in as seller.' });
  }
  // Otherwise redirect browser to login page
  res.redirect('/seller/login');
}

/**
 * POST /api/seller/login
 */
router.post('/api/seller/login', (req, res) => {
  const { username, password } = req.body;

  const expectedUser = process.env.SELLER_USERNAME || 'admin';
  const expectedPass = process.env.SELLER_PASSWORD || 'cartpilot';

  if (username === expectedUser && password === expectedPass) {
    const token = crypto.randomBytes(24).toString('hex');
    activeSessions.add(token);

    // Set cookie valid for 7 days
    res.setHeader(
      'Set-Cookie',
      `seller_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`
    );

    return res.json({ success: true });
  }

  return res.status(401).json({ error: 'Invalid username or password' });
});

/**
 * POST /api/seller/logout
 */
router.post('/api/seller/logout', (req, res) => {
  const cookies = parseCookies(req);
  if (cookies.seller_session) {
    activeSessions.delete(cookies.seller_session);
  }

  res.setHeader(
    'Set-Cookie',
    'seller_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'
  );

  res.json({ success: true });
});

/**
 * GET /api/seller/check – verify if current session is authenticated
 */
router.get('/api/seller/check', (req, res) => {
  res.json({ authenticated: isAuthenticated(req) });
});

module.exports = {
  authRouter: router,
  requireSellerAuth,
  isAuthenticated,
};
