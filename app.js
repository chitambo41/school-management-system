/**
 * Main Express application setup.
 */
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const path = require('path');
const helmet = require('helmet');
const methodOverride = require('method-override');
const expressLayouts = require('express-ejs-layouts');

const db = require('./config/db');
const { loadUser } = require('./middleware/auth');

const app = express();

// connect-flash uses session - ensure it's present
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'dev_secret_change_me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 8 // 8 hours
  }
});
app.use(sessionMiddleware);
app.use(flash());

// Security headers (disables CSP to keep inline styles/scripts simple)
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// Body parsing
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Method override for PUT/DELETE via forms
app.use(methodOverride('_method'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layouts/main');

// Local template helpers
app.use((req, res, next) => {
  res.locals.title = 'Opportunity School Management System';
  res.locals.currentPath = req.path;
  // Convert DB date strings ('YYYY-MM-DD HH:MM:SS') to friendly output
  res.locals.fmtDate = (d) => d ? String(d).slice(0, 10) : '—';
  res.locals.fmtDateTime = (d) => d ? String(d).slice(0, 16) : '—';
  next();
});

// Session user loading (hydrates req.user + res.locals.currentUser)
app.use(loadUser);

// Active academic year + active term, shown to every logged-in user
app.use(async (req, res, next) => {
  try {
    const [yearRows] = await db.query('SELECT id, name FROM academic_years WHERE is_active=1 LIMIT 1');
    const year = yearRows[0];
    res.locals.activeYear = year ? year.name : null;
    res.locals.activeTerm = null;
    if (year) {
      const [termRows] = await db.query(
        'SELECT name FROM terms WHERE academic_year_id=? ORDER BY is_active DESC, id LIMIT 1', [year.id]);
      res.locals.activeTerm = termRows[0] ? termRows[0].name : null;
    }
  } catch { /* leave undefined if DB is unavailable */ }
  next();
});

// Routes
app.use('/auth', require('./routes/auth'));

// Role-based dashboards
const { requireAuth } = require('./middleware/auth');
app.get('/dashboard', requireAuth, (req, res) => {
  if (req.user.role === 'admin') return res.redirect('/admin');
  if (req.user.role === 'teacher') return res.redirect('/teacher');
  return res.redirect('/parent/dashboard');
});

app.use('/admin', require('./routes/admin'));
app.use('/teacher', require('./routes/teacher'));
app.use('/parent', require('./routes/parent'));

// Root route
app.get('/', (req, res) => {
  if (req.user) return res.redirect('/dashboard');
  res.render('index', { title: 'Opportunity School Management System' });
});

// 404
app.use((req, res) => {
  res.status(404).render('404', { title: 'Not Found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  if (err.message && err.message.includes('Only images')) {
    req.flash('error', err.message);
    return res.redirect('back');
  }
  res.status(500).render('500', { title: 'Server Error', message: err.message });
});

module.exports = { app, sessionMiddleware }; // sessionMiddleware exported for tests