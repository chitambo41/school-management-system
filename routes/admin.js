/**
 * Admin routes - all require authentication + admin role.
 */
const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const c = require('../controllers/adminController');

// All admin routes need an admin user
router.use(requireAuth, requireRole('admin'));

// Dashboard
router.get('/', c.dashboard);

// Admission applications
router.get('/applications', c.applications);
router.get('/applications/:id', c.applicationView);
router.post('/applications/:id/approve', c.applicationApprove);
router.post('/applications/:id/reject', c.applicationReject);

// Students
router.get('/students', c.students);
router.get('/students/new', c.studentCreateForm);
router.post('/students', c.studentCreate);
router.get('/students/:id', c.studentView);
router.get('/students/:id/edit', c.studentEditForm);
router.get('/students/:id/report', c.studentReport);
router.get('/students/:id/report/print', c.studentReportPrint);
router.post('/students/:id/report/approve', c.studentReportApprove);
router.post('/students/:id/report/unapprove', c.studentReportUnapprove);
router.post('/students/:id', c.studentUpdate);
router.post('/students/:id/delete', c.studentDelete);

// Teachers & staff
router.get('/teachers', c.teachers);
router.get('/teachers/new', c.teacherCreateForm);
router.post('/teachers', c.teacherCreate);
router.get('/teachers/:id/edit', c.teacherEditForm);
router.post('/teachers/:id', c.teacherUpdate);
router.post('/teachers/:id/delete', c.teacherDelete);

// Classes
router.get('/classes', c.classes);
router.get('/classes/new', c.classCreateForm);
router.post('/classes', c.classCreate);
router.get('/classes/:id/edit', c.classEditForm);
router.post('/classes/:id', c.classUpdate);
router.post('/classes/:id/delete', c.classDelete);

// Subjects
router.get('/subjects', c.subjects);
router.post('/subjects', c.subjectCreate);
router.post('/subjects/:id/delete', c.subjectDelete);

// Assignments (teacher <-> class <-> subject)
router.get('/assignments', c.assignments);
router.post('/assignments', c.assignmentCreate);
router.post('/assignments/:id/delete', c.assignmentDelete);

// Academic years & terms
router.get('/academic-years', c.academicYears);
router.post('/academic-years', c.academicYearCreate);
router.post('/academic-years/:id/activate', c.academicYearActivate);
router.post('/terms', c.termCreate);
router.post('/terms/:id/activate', c.termActivate);

// Exams & marks
router.get('/exams', c.examinations);
router.post('/exams', c.examCreate);
router.post('/exams/:id/delete', c.examDelete);
router.get('/attendance', c.attendanceView);
router.get('/results', c.results);
router.get('/results/print', c.resultsReport);
router.post('/results/approve', c.resultsApprove);
router.post('/results/revision', c.resultsRevision);

// Messages
router.get('/messages', c.messages);
router.post('/messages', c.messageCreate);
router.post('/messages/:id/delete', c.messageDelete);

// Reports & logs
router.get('/reports', c.reports);
router.get('/logs', c.logs);

module.exports = router;