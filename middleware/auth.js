/**
 * Authentication & RBAC middleware.
 * Note: This project uses express-session (stateful) for simplicity.
 * The session stores { userId, role } and `req.user` is hydrated from DB.
 */

const db = require('../config/db');

/**
 * Global middleware - hydrate req.user from session if logged in.
 * Attaches to every request so templates can check `currentUser`.
 */
async function loadUser(req, res, next) {
  // Session flag set on login: req.session.userId
  if (req.session && req.session.userId) {
    try {
      const [rows] = await db.query(
        'SELECT id, name, email, role, phone, avatar, is_active FROM users WHERE id = ? AND deleted_at IS NULL',
        [req.session.userId]
      );
      if (rows.length) {
        req.user = rows[0];
        res.locals.currentUser = rows[0]; // available in all EJS templates
      } else {
        // User no longer exists -> clear session
        req.session.destroy(() => {});
      }
    } catch (err) {
      console.error('loadUser error:', err.message);
    }
  }
  // Defaults for templates
  res.locals.currentUser = req.user || null;
  res.locals.flash = req.flash ? req.flash() : {};
  next();
}

/**
 * Require authentication.
 */
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  req.flash('error', 'Please log in to continue.');
  return res.redirect('/auth/login');
}

/**
 * Restrict a route to specific roles.
 * @param  {...string} roles - allowed roles, e.g. 'admin','teacher'
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.redirect('/auth/login');
    }
    if (!roles.includes(req.user.role)) {
      req.flash('error', 'You do not have permission to access that page.');
      // Redirect each role to their own dashboard
      if (req.user.role === 'admin') return res.redirect('/admin');
      if (req.user.role === 'teacher') return res.redirect('/teacher');
      return res.redirect('/parent');
    }
    next();
  };
}

module.exports = { loadUser, requireAuth, requireRole };
