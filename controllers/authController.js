/**
 * Auth controller - registration, login, logout, password reset.
 */
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const db = require('../config/db');
const { sendMail } = require('../config/mailer');
const { asyncHandler } = require('../middleware/helpers');

// Validation rules for registration
exports.registerValidation = [
  body('name').trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
  body('email').isEmail().withMessage('A valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('confirmPassword').custom((value, { req }) => value === req.body.password).withMessage('Passwords do not match'),
  body('phone').optional({ checkFalsy: true }).trim()
];

// GET /auth/register - show registration page
exports.showRegister = (req, res) => {
  res.render('auth/register', { title: 'Register', body: {}, errors: {} });
};

// POST /auth/register - create parent account
exports.register = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).render('auth/register', {
      title: 'Register',
      body: req.body,
      errors: errors.mapped()
    });
  }

  const { name, email, password, phone } = req.body;

  // Check unique email
  const existing = await User.findByEmail(email.toLowerCase().trim());
  if (existing) {
    return res.status(400).render('auth/register', {
      title: 'Register',
      body: req.body,
      errors: { email: { msg: 'An account with this email already exists' } }
    });
  }

  const hash = await bcrypt.hash(password, 10);
  const userId = await User.create({
    name: name.trim(),
    email: email.trim().toLowerCase(),
    password: hash,
    role: 'parent',
    phone
  });

  // Create parents profile record
  await db.query(
    'INSERT INTO parents (user_id, relationship) VALUES (?, ?)',
    [userId, req.body.relationship || 'guardian']
  );

  // Auto-login then send welcome email
  req.session.userId = userId;
  await sendMail({
    to: email,
    subject: 'Welcome to our School',
    text: `Hi ${name},\n\nYour parent account has been created. You can now apply for student admission.`
  });

  req.flash('success', 'Account created. Welcome to the School Portal!');
  res.redirect('/parent/dashboard');
});

// GET /auth/login
exports.showLogin = (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  res.render('auth/login', { title: 'Login' });
};

// POST /auth/login
exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findByEmail((email || '').trim().toLowerCase());
  if (!user) {
    req.flash('error', 'Invalid email or password.');
    return res.redirect('/auth/login');
  }
  if (user.is_active !== 1) {
    req.flash('error', 'This account has been deactivated. Contact the administrator.');
    return res.redirect('/auth/login');
  }
  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    req.flash('error', 'Invalid email or password.');
    return res.redirect('/auth/login');
  }

  req.session.userId = user.id;
  await User.update(user.id, { last_login: new Date() });

  req.flash('success', `Welcome back, ${user.name}!`);
  res.redirect('/dashboard');
});

// POST /auth/logout
exports.logout = (req, res) => {
  req.session.destroy(() => {
    res.redirect('/auth/login');
  });
};

// GET /auth/forgot-password
exports.showForgot = (req, res) => {
  res.render('auth/forgot', { title: 'Reset Password' });
};

// POST /auth/forgot-password
exports.forgot = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await User.findByEmail((email || '').trim().toLowerCase());

  // Always show the same message (don't reveal account existence)
  if (!user) {
    req.flash('success', 'If that email exists, a reset link has been sent.');
    return res.redirect('/auth/login');
  }

  // Generate one-time token
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  await db.query(
    'INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)',
    [user.id, token, expires]
  );

  const resetUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/auth/reset-password?token=${token}`;
  await sendMail({
    to: user.email,
    subject: 'Password Reset',
    text: `Hi ${user.name},\n\nClick the link below to reset your password (expires in 1 hour):\n\n${resetUrl}`
  });

  req.flash('success', 'If that email exists, a reset link has been sent.');
  res.redirect('/auth/login');
});

// GET /auth/reset-password?token=...
exports.showReset = asyncHandler(async (req, res) => {
  const { token } = req.query;
  const [rows] = await db.query(
    `SELECT pr.* FROM password_resets pr
     WHERE pr.token = ? AND pr.used = 0 AND pr.expires_at > NOW()`,
    [token]
  );
  if (!rows.length) {
    req.flash('error', 'This reset link is invalid or has expired.');
    return res.redirect('/auth/forgot-password');
  }
  res.render('auth/reset', { title: 'Set New Password', token });
});

// POST /auth/reset-password
exports.reset = asyncHandler(async (req, res) => {
  const { token, password, confirmPassword } = req.body;
  if (password !== confirmPassword) {
    req.flash('error', 'Passwords do not match.');
    return res.redirect(`/auth/reset-password?token=${token}`);
  }
  if (!password || password.length < 6) {
    req.flash('error', 'Password must be at least 6 characters.');
    return res.redirect(`/auth/reset-password?token=${token}`);
  }

  const [rows] = await db.query(
    `SELECT pr.* FROM password_resets pr
     WHERE pr.token = ? AND pr.used = 0 AND pr.expires_at > NOW()`,
    [token]
  );
  if (!rows.length) {
    req.flash('error', 'This reset link is invalid or has expired.');
    return res.redirect('/auth/forgot-password');
  }

  const hash = await bcrypt.hash(password, 10);
  await db.query('UPDATE users SET password = ? WHERE id = ?', [hash, rows[0].user_id]);
  await db.query('UPDATE password_resets SET used = 1 WHERE id = ?', [rows[0].id]);

  req.flash('success', 'Password updated. Please log in with your new password.');
  res.redirect('/auth/login');
});

// GET /dashboard - role-based redirect after login
exports.dashboard = (req, res) => {
  switch (req.user.role) {
    case 'admin': return res.redirect('/admin');
    case 'teacher': return res.redirect('/teacher');
    default: return res.redirect('/parent');
  }
};
