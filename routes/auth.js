/**
 * Auth routes
 */
const express = require('express');
const router = express.Router();
const auth = require('../controllers/authController');

// Public
router.get('/register', auth.showRegister);
router.post('/register', auth.registerValidation, auth.register);
router.get('/login', auth.showLogin);
router.post('/login', auth.login);
router.get('/forgot-password', auth.showForgot);
router.post('/forgot-password', auth.forgot);
router.get('/reset-password', auth.showReset);
router.post('/reset-password', auth.reset);

// Protected
router.post('/logout', auth.logout);

module.exports = router;