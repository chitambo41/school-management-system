/**
 * Parent/Guardian controller - admission application, child profile, results, progress.
 */
const db = require('../config/db');
const path = require('path');
const PDFDocument = require('pdfkit');
const { asyncHandler, gradeFor, buildStudentReport } = require('../middleware/helpers');
const { writeStudentReportPdf } = require('../utils/reportPdf');

// ============================================================
// DASHBOARD
// ============================================================
exports.dashboard = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  // Their children
  const [children] = await db.query(
    `SELECT id, name, admission_no, class_name, class_teacher, class_teacher_phone FROM (
       SELECT s.id, s.name, s.admission_no,
         (SELECT c.name FROM student_class_enrollments sce
            JOIN terms t ON t.id=sce.term_id
            JOIN academic_years ay ON ay.id=t.academic_year_id
            JOIN classes c ON c.id=sce.class_id
            WHERE sce.student_id=s.id AND ay.is_active=1 ORDER BY sce.id DESC LIMIT 1) AS class_name,
         (SELECT u.name FROM student_class_enrollments sce2
            JOIN terms t2 ON t2.id=sce2.term_id
            JOIN academic_years ay2 ON ay2.id=t2.academic_year_id
            JOIN class_teacher_assignments cta2 ON cta2.class_id=sce2.class_id AND cta2.subject_id IS NULL
            JOIN teachers te2 ON te2.id=cta2.teacher_id JOIN users u ON u.id=te2.user_id
            WHERE sce2.student_id=s.id AND ay2.is_active=1 ORDER BY sce2.id DESC LIMIT 1) AS class_teacher,
         (SELECT u3.phone FROM student_class_enrollments sce3
            JOIN terms t3 ON t3.id=sce3.term_id
            JOIN academic_years ay3 ON ay3.id=t3.academic_year_id
            JOIN class_teacher_assignments cta3 ON cta3.class_id=sce3.class_id AND cta3.subject_id IS NULL
            JOIN teachers te3 ON te3.id=cta3.teacher_id JOIN users u3 ON u3.id=te3.user_id
            WHERE sce3.student_id=s.id AND ay3.is_active=1 ORDER BY sce3.id DESC LIMIT 1) AS class_teacher_phone
       FROM students s WHERE s.parent_user_id=? AND s.deleted_at IS NULL AND s.status='active'
     ) sub ORDER BY name`, [userId]);

  // Recent applications
  const [applications] = await db.query(
    'SELECT id, student_name, grade_applying, status, created_at FROM admission_applications WHERE parent_user_id=? ORDER BY created_at DESC LIMIT 5',
    [userId]);

  // Recent messages
  const [messages] = await db.query(
    `SELECT m.id, m.subject, m.body, m.created_at, m.audience, mr.is_read
     FROM message_recipients mr JOIN messages m ON m.id=mr.message_id
     WHERE mr.user_id=? ORDER BY m.created_at DESC LIMIT 5`, [userId]);

  res.render('parent/dashboard', { title: 'Parent Dashboard', children, applications, messages, active: 'dashboard' });
});

// ============================================================
// ADMISSION APPLICATION
// ============================================================
exports.applyForm = asyncHandler(async (req, res) => {
  const [classes] = await db.query('SELECT DISTINCT name FROM classes WHERE deleted_at IS NULL ORDER BY name');
  res.render('parent/apply', { title: 'Apply for Admission', body: {}, errors: {}, classes });
});

exports.applySubmit = asyncHandler(async (req, res) => {
  const body = req.body;
  const errors = {};
  if (!body.student_name || body.student_name.trim().length < 2) errors.student_name = 'Student name is required';
  if (!body.date_of_birth) errors.date_of_birth = 'Date of birth is required';
  if (!body.gender) errors.gender = 'Gender is required';
  if (!body.grade_applying) errors.grade_applying = 'Grade is required';

  if (Object.keys(errors).length) {
    const [classes] = await db.query('SELECT DISTINCT name FROM classes WHERE deleted_at IS NULL ORDER BY name');
    return res.status(400).render('parent/apply', { title: 'Apply for Admission', body, errors, classes });
  }

  // Uploaded documents stored by multer -> JSON array of file paths
  let docs = [];
  if (req.files && req.files.length) {
    docs = req.files.map(f => '/uploads/' + f.filename);
  }

  await db.query(
    `INSERT INTO admission_applications
       (parent_user_id, student_name, date_of_birth, gender, grade_applying, previous_school, previous_grade, address, documents)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [req.user.id, body.student_name.trim(), body.date_of_birth, body.gender, body.grade_applying,
     body.previous_school || null, body.previous_grade || null, body.address || null, JSON.stringify(docs)]
  );

  req.flash('success', 'Your application has been submitted. You can track its status here.');
  res.redirect('/parent/apply');
});

// List applications with status
exports.applications = asyncHandler(async (req, res) => {
  const [rows] = await db.query(
    `SELECT a.* FROM admission_applications a
     WHERE a.parent_user_id=? ORDER BY a.created_at DESC`, [req.user.id]);
  res.render('parent/applications', { title: 'My Applications', applications: rows, active: 'applications' });
});

// ============================================================
// CHILDREN
// ============================================================
exports.children = asyncHandler(async (req, res) => {
  const [children] = await db.query(
    `SELECT s.id, s.name, s.admission_no, s.date_of_birth, s.gender, s.status, s.report_approved_at,
(SELECT c.name FROM student_class_enrollments sce
           JOIN terms t ON t.id=sce.term_id
           JOIN academic_years ay ON ay.id=t.academic_year_id
           JOIN classes c ON c.id=sce.class_id
           WHERE sce.student_id=s.id AND ay.is_active=1 ORDER BY sce.id DESC LIMIT 1) AS class_name,
       (SELECT u.name FROM student_class_enrollments sce2
          JOIN terms t2 ON t2.id=sce2.term_id
          JOIN academic_years ay2 ON ay2.id=t2.academic_year_id
          JOIN class_teacher_assignments cta2 ON cta2.class_id=sce2.class_id AND cta2.subject_id IS NULL
          JOIN teachers te2 ON te2.id=cta2.teacher_id JOIN users u ON u.id=te2.user_id
          WHERE sce2.student_id=s.id AND ay2.is_active=1 ORDER BY sce2.id DESC LIMIT 1) AS class_teacher,
       (SELECT u3.phone FROM student_class_enrollments sce3
          JOIN terms t3 ON t3.id=sce3.term_id
          JOIN academic_years ay3 ON ay3.id=t3.academic_year_id
          JOIN class_teacher_assignments cta3 ON cta3.class_id=sce3.class_id AND cta3.subject_id IS NULL
          JOIN teachers te3 ON te3.id=cta3.teacher_id JOIN users u3 ON u3.id=te3.user_id
          WHERE sce3.student_id=s.id AND ay3.is_active=1 ORDER BY sce3.id DESC LIMIT 1) AS class_teacher_phone
     FROM students s
     WHERE s.parent_user_id=? AND s.deleted_at IS NULL ORDER BY s.name`, [req.user.id]);
  res.render('parent/children', { title: 'My Children', children, active: 'children' });
});

exports.childProfile = asyncHandler(async (req, res) => {
  const childId = req.params.id;
  // Ensure ownership
  const [rows] = await db.query(
    'SELECT s.* FROM students s WHERE s.id=? AND s.parent_user_id=? AND s.deleted_at IS NULL',
    [childId, req.user.id]);
  if (!rows.length) { req.flash('error', 'Child profile not found.'); return res.redirect('/parent/children'); }
  const student = rows[0];

  // Class enrollments
  const [enrollments] = await db.query(
    `SELECT c.name AS class_name, t.name AS term_name FROM student_class_enrollments sce
     JOIN classes c ON c.id=sce.class_id JOIN terms t ON t.id=sce.term_id
     WHERE sce.student_id=? ORDER BY t.id DESC`, [childId]);

  // Current (active year) class + class teacher contact
  const [cc] = await db.query(
    `SELECT c.name AS class_name, u.name AS class_teacher, u.phone AS class_teacher_phone
     FROM student_class_enrollments sce
     JOIN terms t ON t.id=sce.term_id JOIN academic_years ay ON ay.id=t.academic_year_id
     JOIN classes c ON c.id=sce.class_id
     LEFT JOIN class_teacher_assignments cta ON cta.class_id=sce.class_id AND cta.subject_id IS NULL
     LEFT JOIN teachers te ON te.id=cta.teacher_id LEFT JOIN users u ON u.id=te.user_id
     WHERE sce.student_id=? AND ay.is_active=1 ORDER BY sce.id DESC LIMIT 1`, [childId]);
  const currentClass = cc[0] || null;

  // Results per term
  const [terms] = await db.query(
    `SELECT DISTINCT t.id, t.name, ay.name AS year FROM marks m
     JOIN examinations e ON e.id=m.exam_id
     JOIN terms t ON t.id=e.term_id
     JOIN academic_years ay ON ay.id=t.academic_year_id
     WHERE m.student_id=? ORDER BY t.id`, [childId]);

  const termResults = {};
  for (const term of terms) {
    const [marks] = await db.query(
      `SELECT m.marks_obtained, m.grade, m.remarks, e.max_marks, sub.name AS subject_name FROM marks m
       JOIN examinations e ON e.id=m.exam_id AND e.term_id=?
       JOIN subjects sub ON sub.id=m.subject_id
       WHERE m.student_id=? ORDER BY sub.name`, [term.id, childId]);
    let total = 0, max = 0;
    marks.forEach(m => {
      total += parseFloat(m.marks_obtained);
      max += m.max_marks;
      m.grade = gradeFor(m.marks_obtained, m.max_marks);
    });
    termResults[term.id] = {
      marks,
      total,
      max,
      avg: max ? Math.round((total / max) * 100 * 10) / 10 : 0
    };
  }

  // Attendance summary
  const [attendance] = await db.query(
    `SELECT status, COUNT(*) AS c FROM attendance WHERE student_id=? GROUP BY status`, [childId]);

  // Teacher comments
  const [comments] = await db.query(
    `SELECT tc.comment, u.name AS teacher_name, t.name AS term_name FROM teacher_comments tc
     JOIN teachers te ON te.id=tc.teacher_id JOIN users u ON u.id=te.user_id
     JOIN terms t ON t.id=tc.term_id WHERE tc.student_id=? ORDER BY t.id`,
    [childId]);

  res.render('parent/child-profile', { title: 'Child Profile', student, enrollments, currentClass, terms, termResults, attendance, comments, active: 'children' });
});

// ============================================================
// RESULTS (term selector)
// ============================================================
exports.results = asyncHandler(async (req, res) => {
  const [children] = await db.query(
    'SELECT id, name, report_approved_at FROM students WHERE parent_user_id=? AND deleted_at IS NULL AND status="active" ORDER BY name', [req.user.id]);
  const childId = req.query.child || (children.length ? children[0].id : null);
  const termId = req.query.term || '';

  let terms = [];
  let marks = [];
  let total = 0, max = 0;
  let reportApproved = false;

  if (childId) {
    // Ensure ownership
    const [own] = await db.query('SELECT id, report_approved_at FROM students WHERE id=? AND parent_user_id=?', [childId, req.user.id]);
    if (own.length) {
      reportApproved = !!own[0].report_approved_at;
      [terms] = await db.query(
        `SELECT DISTINCT t.id, t.name, ay.name AS year FROM marks m
         JOIN examinations e ON e.id=m.exam_id JOIN terms t ON t.id=e.term_id
         JOIN academic_years ay ON ay.id=t.academic_year_id
         WHERE m.student_id=? ORDER BY t.id`, [childId]);
      const activeTerm = termId || (terms.length ? terms[0].id : null);
      if (activeTerm) {
        [marks] = await db.query(
          `SELECT m.marks_obtained, m.grade, m.remarks, e.max_marks, e.name AS exam_name, sub.name AS subject_name
           FROM marks m JOIN examinations e ON e.id=m.exam_id AND e.term_id=?
           JOIN subjects sub ON sub.id=m.subject_id
           WHERE m.student_id=? ORDER BY sub.name`, [activeTerm, childId]);
        marks.forEach(m => {
          total += parseFloat(m.marks_obtained);
          max += m.max_marks;
          m.grade = gradeFor(m.marks_obtained, m.max_marks);
        });
      }
    }
  }

  res.render('parent/results', { title: 'Results', children, childId, termId, terms, marks, total, max, reportApproved, active: 'results' });
});

// ============================================================
// FULL REPORT PDF (only after admin approved & printed it)
// ============================================================
exports.reportDownload = asyncHandler(async (req, res) => {
  const childId = req.params.childId;
  const [rows] = await db.query(
    'SELECT id, name, report_approved_at FROM students WHERE id=? AND parent_user_id=? AND deleted_at IS NULL',
    [childId, req.user.id]);
  if (!rows.length) { req.flash('error', 'Child not found.'); return res.redirect('/parent/children'); }
  if (!rows[0].report_approved_at) {
    req.flash('error', 'This report has not been approved & printed by the school yet. Please check back later.');
    return res.redirect(`/parent/results?child=${childId}`);
  }
  const report = await buildStudentReport(childId);
  if (!report) { req.flash('error', 'Report data not available.'); return res.redirect(`/parent/results?child=${childId}`); }

  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="report-${report.student.admission_no || childId}.pdf"`);
  doc.pipe(res);
  const logoPath = path.join(__dirname, '..', 'public', 'images', 'logo.jpg');
  writeStudentReportPdf(doc, report, {
    logoPath,
    approvedLine: `Report approved & finalized by: ${report.student.report_approved_by_name || 'Admin'}`
  });
  doc.end();
});

// ============================================================
// PROGRESS
// ============================================================
exports.progress = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const [children] = await db.query(
    'SELECT id, name FROM students WHERE parent_user_id=? AND deleted_at IS NULL AND status="active" ORDER BY name', [userId]);
  const childId = req.query.child || (children.length ? children[0].id : null);

  let attendance = [];
  let comments = [];
  if (childId) {
    const [own] = await db.query('SELECT id FROM students WHERE id=? AND parent_user_id=?', [childId, userId]);
    if (own.length) {
      [attendance] = await db.query(
        `SELECT status, COUNT(*) AS c FROM attendance WHERE student_id=? GROUP BY status`, [childId]);
      [comments] = await db.query(
        `SELECT tc.comment, u.name AS teacher_name, t.name AS term_name FROM teacher_comments tc
         JOIN teachers te ON te.id=tc.teacher_id JOIN users u ON u.id=te.user_id
         JOIN terms t ON t.id=tc.term_id WHERE tc.student_id=? ORDER BY t.id`, [childId]);
    }
  }
  res.render('parent/progress', { title: 'Academic Progress', children, childId, attendance, comments, active: 'progress' });
});

// ============================================================
// MESSAGES (inbox)
// ============================================================
exports.messages = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const [rows] = await db.query(
    `SELECT m.id, m.subject, m.body, m.created_at, m.audience, mr.is_read, s.name AS sender_name
     FROM message_recipients mr JOIN messages m ON m.id=mr.message_id LEFT JOIN users s ON s.id=m.sender_id
     WHERE mr.user_id=? ORDER BY m.created_at DESC LIMIT 50`, [userId]);
  res.render('parent/messages', { title: 'Messages', messages: rows, active: 'messages' });
});

exports.messageRead = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const [rows] = await db.query(
    `SELECT m.*, s.name AS sender_name FROM messages m
     JOIN message_recipients mr ON mr.message_id=m.id AND mr.user_id=?
     LEFT JOIN users s ON s.id=m.sender_id WHERE m.id=?`, [userId, req.params.id]);
  if (!rows.length) { req.flash('error', 'Message not found.'); return res.redirect('/parent/messages'); }
  await db.query(
    'UPDATE message_recipients SET is_read=1, read_at=NOW() WHERE message_id=? AND user_id=?', [req.params.id, userId]);
  res.render('parent/message-view', { title: 'Message', msg: rows[0] });
});