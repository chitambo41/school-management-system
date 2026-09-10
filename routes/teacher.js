/**
 * Teacher routes - require autuht + teacher role.
 */
const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const c = require('../controllers/teacherController');

router.use(requireAuth, requireRole('teacher'));

// Dashboard
router.get('/', c.dashboard);

// Classes
router.get('/classes', c.classes);
router.get('/classes/:id', c.classView);

// Attendance
router.get('/attendance/:classId', c.attendanceForm);
router.post('/attendance/:classId', c.attendanceSave);
router.get('/attendance-history/:classId', c.attendanceHistory);

// Marks
router.get('/marks/:classId/:subjectId', c.marksEntry);
router.post('/marks/:classId/:subjectId', c.marksSave);

// Comments
router.get('/comments/:classId', c.comments);
router.post('/comments/:classId', c.commentsSave);

// Results
router.get('/results', c.results);
router.get('/class-results', c.classResults);
router.post('/class-results/:classId/send', c.classResultsSend);

// Messages
router.get('/messages', c.messages);
router.get('/messages/:id', c.messageRead);

module.exports = router;