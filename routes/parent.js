/**
 * Parent/Guardian routes - require auth + parent role.
 */
const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const c = require('../controllers/parentController');
const { upload } = require('../middleware/upload');

router.use(requireAuth, requireRole('parent'));

// Dashboard
router.get('/dashboard', c.dashboard);

// Admission application (documents upload)
router.get('/apply', c.applyForm);
router.post('/apply', upload.array('documents', 5), c.applySubmit);
router.get('/applications', c.applications);

// Children & profiles
router.get('/children', c.children);
router.get('/children/:id', c.childProfile);

// Results & progress
router.get('/results', c.results);
router.get('/report/:childId/download', c.reportDownload);
router.get('/progress', c.progress);

// Messages
router.get('/messages', c.messages);
router.get('/messages/:id', c.messageRead);

module.exports = router;