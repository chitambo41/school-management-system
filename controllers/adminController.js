/**
 * Admin controller - the full privilege dashboard and CRUD operations.
 */
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const { body, validationResult } = require('express-validator');
const db = require('../config/db');
const { asyncHandler, gradeFor, buildTermResults, logActivity, buildStudentReport, getResultSubmission } = require('../middleware/helpers');
const { writeStudentReportPdf } = require('../utils/reportPdf');
const { sendMail } = require('../config/mailer');

// ============================================================
// CURRENT-CLASS ASSIGNMENT (one class per student in the active year)
// ============================================================
async function assignStudentClass(studentId, classId) {
  if (!classId) return false;
  const [yr] = await db.query('SELECT id FROM academic_years WHERE is_active=1 ORDER BY id LIMIT 1');
  if (!yr.length) return false;
  // Remove other current enrollments for the active year, then enroll in the new class
  await db.query(
    'DELETE FROM student_class_enrollments WHERE student_id=? AND term_id IN (SELECT id FROM terms WHERE academic_year_id=?)',
    [studentId, yr[0].id]);
  const [term] = await db.query('SELECT id FROM terms WHERE academic_year_id=? ORDER BY id LIMIT 1', [yr[0].id]);
  if (!term.length) return false;
  await db.query('INSERT INTO student_class_enrollments (student_id, class_id, term_id) VALUES (?,?,?)',
    [studentId, classId, term[0].id]);
  return true;
}

// ============================================================
// DASHBOARD
// ============================================================
exports.dashboard = asyncHandler(async (req, res) => {
  const [[students], [teachers], [classes], [pending], [recentApps], [recentLogs]] = await Promise.all([
    db.query(`SELECT COUNT(*) AS c FROM students WHERE deleted_at IS NULL AND status='active'`),
    db.query(`SELECT COUNT(*) AS c FROM teachers WHERE deleted_at IS NULL`),
    db.query(`SELECT COUNT(*) AS c FROM classes WHERE deleted_at IS NULL`),
    db.query(`SELECT COUNT(*) AS c FROM admission_applications WHERE status='pending'`),
    db.query(`SELECT a.*, u.name AS parent_name FROM admission_applications a JOIN users u ON u.id=a.parent_user_id ORDER BY a.created_at DESC LIMIT 5`),
    db.query(`SELECT l.*, u.name AS user_name FROM activity_logs l LEFT JOIN users u ON u.id=l.user_id ORDER BY l.created_at DESC LIMIT 8`)
  ]);

  res.render('admin/dashboard', {
    title: 'Admin Dashboard',
    stats: { students: students[0].c, teachers: teachers[0].c, classes: classes[0].c, pending: pending[0].c },
    recentApps,
    recentLogs,
    active: 'dashboard'
  });
});

// ============================================================
// ADMISSION APPLICATIONS
// ============================================================
exports.applications = asyncHandler(async (req, res) => {
  const { status = '' } = req.query;
  let sql = `SELECT a.*, u.name AS parent_name, u.email AS parent_email
             FROM admission_applications a
             JOIN users u ON u.id = a.parent_user_id`;
  const params = [];
  if (status) {
    sql += ' WHERE a.status = ?';
    params.push(status);
  }
  sql += ' ORDER BY a.created_at DESC';
  const [rows] = await db.query(sql, params);
  res.render('admin/applications', { title: 'Admission Applications', rows, status, active: 'applications' });
});

exports.applicationView = asyncHandler(async (req, res) => {
  const [rows] = await db.query(
    `SELECT a.*, u.name AS parent_name, u.email AS parent_email, u.phone AS parent_phone
     FROM admission_applications a JOIN users u ON u.id=a.parent_user_id WHERE a.id=?`,
    [req.params.id]
  );
  if (!rows.length) { req.flash('error', 'Application not found.'); return res.redirect('/admin/applications'); }
  let docs = [];
  try { docs = JSON.parse(rows[0].documents || '[]'); } catch {}
  res.render('admin/application-view', { title: 'View Application', app: rows[0], docs, active: 'applications' });
});

exports.applicationApprove = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const [rows] = await db.query('SELECT * FROM admission_applications WHERE id=?', [id]);
  if (!rows.length) { req.flash('error', 'Application not found.'); return res.redirect('/admin/applications'); }
  const app = rows[0];

  await db.query(
    'UPDATE admission_applications SET status="approved", reviewed_by=?, reviewed_at=NOW(), admin_note=? WHERE id=?',
    [req.user.id, req.body.admin_note || null, id]
  );

  // Generate admission number, create the student and link to parent
  const admNo = 'S-' + new Date().getFullYear() + '-' + String(Math.floor(1000 + Math.random()*9000));
  const [studentResult] = await db.query(
    `INSERT INTO students (parent_user_id, application_id, admission_no, name, date_of_birth, gender, address, previous_school, enrollment_date, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
    [app.parent_user_id, id, admNo, app.student_name, app.date_of_birth, app.gender, app.address, app.previous_school, new Date()]
  );

  // Enroll into the class matching grade (best effort). Get class id by name if exists.
  const [classRows] = await db.query('SELECT id FROM classes WHERE name = ? LIMIT 1', [app.grade_applying]);
  if (classRows.length) {
    const [yr] = await db.query('SELECT id FROM academic_years WHERE is_active=1 LIMIT 1');
    const termId = yr.length ? (await db.query('SELECT id FROM terms WHERE academic_year_id=? ORDER BY id LIMIT 1', [yr[0].id]))[0][0].id : null;
    if (termId) {
      await db.query('INSERT INTO student_class_enrollments (student_id, class_id, term_id) VALUES (?, ?, ?)',
        [studentResult.insertId, classRows[0].id, termId]);
    }
  }

  // Notify parent
  const [parent] = await db.query('SELECT email, name FROM users WHERE id=?', [app.parent_user_id]);
  await sendMail({
    to: parent[0].email,
    subject: 'Admission Approved',
    text: `Dear ${parent[0].name},\n\nCongratulations! The admission of ${app.student_name} has been approved.\nAdmission No: ${admNo}`
  });

  await logActivity(req.user.id, 'admission.approved', `Approved application for ${app.student_name}`, req.ip);
  req.flash('success', `Application approved. Student created with Admission No: ${admNo}`);
  res.redirect('/admin/applications');
});

exports.applicationReject = asyncHandler(async (req, res) => {
  await db.query(
    'UPDATE admission_applications SET status="rejected", reviewed_by=?, reviewed_at=NOW(), admin_note=? WHERE id=?',
    [req.user.id, req.body.admin_note || null, req.params.id]
  );
  await logActivity(req.user.id, 'admission.rejected', `Rejected application #${req.params.id}`, req.ip);
  req.flash('success', 'Application rejected.');
  res.redirect('/admin/applications');
});

// ============================================================
// STUDENTS
// ============================================================
exports.students = asyncHandler(async (req, res) => {
  const classId = req.query.class || '';
  const search = req.query.q || '';
  let sql = `SELECT s.id, s.name, s.admission_no, s.gender, s.date_of_birth, s.status,
                    u.name AS parent_name
             FROM students s
             LEFT JOIN users u ON u.id = s.parent_user_id
             WHERE s.deleted_at IS NULL`;
  const params = [];
  if (classId) { sql += ' AND s.id IN (SELECT student_id FROM student_class_enrollments WHERE class_id=?)'; params.push(classId); }
  if (search) { sql += ' AND s.name LIKE ?'; params.push(`%${search}%`); }
  sql += ' GROUP BY s.id ORDER BY s.name';
  const [students] = await db.query(sql, params);
  const [classes] = await db.query('SELECT id, name, section FROM classes WHERE deleted_at IS NULL ORDER BY name');

  // For each student, find current class assignment + its class teacher cleanly
  for (const s of students) {
    const [cc] = await db.query(`SELECT c.name AS class_name, u2.name AS class_teacher
      FROM student_class_enrollments sce
      JOIN terms t ON t.id=sce.term_id JOIN academic_years ay ON ay.id=t.academic_year_id
      JOIN classes c ON c.id=sce.class_id
      LEFT JOIN class_teacher_assignments cta ON cta.class_id=sce.class_id AND cta.subject_id IS NULL
      LEFT JOIN teachers t2 ON t2.id=cta.teacher_id LEFT JOIN users u2 ON u2.id=t2.user_id
      WHERE sce.student_id=? AND ay.is_active=1 ORDER BY t.id DESC LIMIT 1`, [s.id]);
    s.class_name = cc.length ? cc[0].class_name : null;
    s.class_teacher = cc.length ? (cc[0].class_teacher || null) : null;
  }

  res.render('admin/students', { title: 'Students', students, classes, classId, search, active: 'students' });
});

exports.studentView = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const [student] = await db.query(
    `SELECT s.*, u.name AS parent_name, u.email AS parent_email FROM students s
     LEFT JOIN users u ON u.id=s.parent_user_id WHERE s.id=? AND s.deleted_at IS NULL`, [id]);
  if (!student.length) { req.flash('error', 'Student not found.'); return res.redirect('/admin/students'); }
  const [enrollments] = await db.query(
    `SELECT sce.id, c.name AS class_name, t.name AS term_name FROM student_class_enrollments sce
     JOIN classes c ON c.id=sce.class_id JOIN terms t ON t.id=sce.term_id WHERE sce.student_id=? ORDER BY t.id DESC`, [id]);
  const [marks] = await db.query(
    `SELECT m.*, e.name AS exam_name, e.term_id, sub.name AS subject_name FROM marks m
     JOIN examinations e ON e.id=m.exam_id JOIN subjects sub ON sub.id=m.subject_id
     WHERE m.student_id=? ORDER BY e.term_id, sub.name`, [id]);
  res.render('admin/student-view', { title: 'Student Profile', student: student[0], enrollments, marks, active: 'students' });
});

exports.studentCreateForm = asyncHandler(async (req, res) => {
  const [classes] = await db.query('SELECT id, name, section FROM classes WHERE deleted_at IS NULL ORDER BY name');
  const [parents] = await db.query('SELECT id, name, email FROM users WHERE role="parent" AND deleted_at IS NULL ORDER BY name');
  res.render('admin/student-form', { title: 'Add Student', student: null, classes, parents, currentClassId: '', active: 'students' });
});

exports.studentCreate = asyncHandler(async (req, res) => {
  const admNo = 'S-' + new Date().getFullYear() + '-' + String(Math.floor(1000 + Math.random()*9000));
  const [r] = await db.query(
    `INSERT INTO students (parent_user_id, admission_no, name, date_of_birth, gender, address, previous_school, enrollment_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.body.parent_user_id || null, admNo, req.body.name, req.body.date_of_birth, req.body.gender, req.body.address || null, req.body.previous_school || null, req.body.enrollment_date || new Date()]
  );
  if (req.body.class_id) {
    const added = await assignStudentClass(r.insertId, req.body.class_id);
    if (!added) req.flash('error', 'Could not enroll: no active academic year/term.');
  }
  await logActivity(req.user.id, 'student.create', `Created student ${req.body.name}`, req.ip);
  req.flash('success', 'Student created. Admission No: ' + admNo);
  res.redirect('/admin/students');
});

exports.studentEditForm = asyncHandler(async (req, res) => {
  const [student] = await db.query('SELECT * FROM students WHERE id=? AND deleted_at IS NULL', [req.params.id]);
  if (!student.length) { req.flash('error', 'Student not found.'); return res.redirect('/admin/students'); }
  const [classes] = await db.query('SELECT id, name, section FROM classes WHERE deleted_at IS NULL ORDER BY name');
  const [parents] = await db.query('SELECT id, name, email FROM users WHERE role="parent" AND deleted_at IS NULL ORDER BY name');
  // Current class (most recent assignment in the active year) for prefill
  const [enr] = await db.query(
    `SELECT sce.class_id FROM student_class_enrollments sce
     JOIN terms t ON t.id=sce.term_id JOIN academic_years ay ON ay.id=t.academic_year_id
     WHERE sce.student_id=? AND ay.is_active=1 ORDER BY sce.id DESC LIMIT 1`, [req.params.id]);
  res.render('admin/student-form', { title: 'Edit Student', student: student[0], classes, parents, currentClassId: enr.length ? enr[0].class_id : '', active: 'students' });
});

exports.studentUpdate = asyncHandler(async (req, res) => {
  await db.query(
    `UPDATE students SET parent_user_id=?, name=?, date_of_birth=?, gender=?, address=?, previous_school=?, status=? WHERE id=?`,
    [req.body.parent_user_id || null, req.body.name, req.body.date_of_birth, req.body.gender, req.body.address || null, req.body.previous_school || null, req.body.status || 'active', req.params.id]
  );
  // Assign / move the student to the selected class (parent sees it immediately)
  const classId = req.body.class_id || null;
  if (classId) {
    const done = await assignStudentClass(req.params.id, classId);
    if (!done) req.flash('error', 'Could not assign class: no active academic year/term.');
  }
  await logActivity(req.user.id, 'student.update', `Updated student #${req.params.id}${classId ? ' (class ' + classId + ')' : ''}`, req.ip);
  req.flash('success', 'Student updated.');
  res.redirect('/admin/students');
});

exports.studentDelete = asyncHandler(async (req, res) => {
  await db.query('UPDATE students SET deleted_at=NOW() WHERE id=?', [req.params.id]);
  await logActivity(req.user.id, 'student.delete', `Deleted student #${req.params.id}`, req.ip);
  req.flash('success', 'Student deleted (soft).');
  res.redirect('/admin/students');
});

// ============================================================
// TEACHERS / STAFF
// ============================================================
exports.teachers = asyncHandler(async (req, res) => {
  const [rows] = await db.query(
    `SELECT t.id, t.employee_no, t.qualification, t.experience_years, t.hire_date,
            u.name, u.email, u.phone, u.is_active
     FROM teachers t JOIN users u ON u.id=t.user_id WHERE t.deleted_at IS NULL ORDER BY u.name`);
  res.render('admin/teachers', { title: 'Teachers & Staff', teachers: rows, active: 'teachers' });
});

exports.teacherCreateForm = asyncHandler(async (req, res) => {
  res.render('admin/teacher-form', { title: 'Add Teacher', teacher: null, active: 'teachers' });
});

exports.teacherCreate = asyncHandler(async (req, res) => {
  const errors = [];
  const existing = await db.query('SELECT id FROM users WHERE email=?', [req.body.email.trim().toLowerCase()]);
  if (existing[0].length) errors.push('A user with this email already exists.');
  if (errors.length) { req.flash('error', errors[0]); return res.redirect('/admin/teachers/new'); }

  const hash = await bcrypt.hash(req.body.password, 10);
  const [u] = await db.query(
    'INSERT INTO users (name,email,password,role,phone) VALUES (?,?,?,?,?)',
    [req.body.name, req.body.email.trim().toLowerCase(), hash, 'teacher', req.body.phone || null]
  );
  const empNo = 'T-' + String(Math.floor(1000 + Math.random()*9000));
  await db.query(
    'INSERT INTO teachers (user_id,employee_no,qualification,experience_years,hire_date) VALUES (?,?,?,?,?)',
    [u.insertId, empNo, req.body.qualification || null, req.body.experience_years || 0, req.body.hire_date || null]
  );
  await logActivity(req.user.id, 'teacher.create', `Created teacher ${req.body.name}`, req.ip);
  req.flash('success', 'Teacher created.');
  res.redirect('/admin/teachers');
});

exports.teacherEditForm = asyncHandler(async (req, res) => {
  const [t] = await db.query(
    `SELECT t.*, u.name, u.email, u.phone FROM teachers t JOIN users u ON u.id=t.user_id WHERE t.id=? AND t.deleted_at IS NULL`,
    [req.params.id]);
  if (!t.length) { req.flash('error', 'Teacher not found.'); return res.redirect('/admin/teachers'); }
  res.render('admin/teacher-form', { title: 'Edit Teacher', teacher: t[0], active: 'teachers' });
});

exports.teacherUpdate = asyncHandler(async (req, res) => {
  const [t] = await db.query('SELECT user_id FROM teachers WHERE id=?', [req.params.id]);
  await db.query('UPDATE users SET name=?, phone=? WHERE id=?', [req.body.name, req.body.phone || null, t[0].user_id]);
  await db.query(
    'UPDATE teachers SET qualification=?, experience_years=?, hire_date=? WHERE id=?',
    [req.body.qualification || null, req.body.experience_years || 0, req.body.hire_date || null, req.params.id]);
  await logActivity(req.user.id, 'teacher.update', `Updated teacher #${req.params.id}`, req.ip);
  req.flash('success', 'Teacher updated.');
  res.redirect('/admin/teachers');
});

exports.teacherDelete = asyncHandler(async (req, res) => {
  const [t] = await db.query('SELECT user_id FROM teachers WHERE id=?', [req.params.id]);
  if (t.length) {
    await db.query('UPDATE teachers SET deleted_at=NOW() WHERE id=?', [req.params.id]);
    await db.query('UPDATE users SET deleted_at=NOW() WHERE id=?', [t[0].user_id]);
  }
  await logActivity(req.user.id, 'teacher.delete', `Deleted teacher #${req.params.id}`, req.ip);
  req.flash('success', 'Teacher deleted (soft).');
  res.redirect('/admin/teachers');
});

// ============================================================
// CLASSES
// ============================================================
exports.classes = asyncHandler(async (req, res) => {
  const [rows] = await db.query(
    `SELECT c.*,
       (SELECT u.name FROM class_teacher_assignments cta
         JOIN teachers t ON t.id=cta.teacher_id
         JOIN users u ON u.id=t.user_id
        WHERE cta.class_id=c.id AND cta.subject_id IS NULL LIMIT 1) AS teacher_name
     FROM classes c WHERE c.deleted_at IS NULL ORDER BY c.name`);
  for (const c of rows) {
    const [cnt] = await db.query(`SELECT COUNT(DISTINCT sce.student_id) AS c FROM student_class_enrollments sce
      JOIN terms t ON t.id=sce.term_id JOIN academic_years ay ON ay.id=t.academic_year_id
      WHERE sce.class_id=? AND ay.is_active=1`, [c.id]);
    c.student_count = cnt[0].c;
  }
  res.render('admin/classes', { title: 'Classes', classes: rows, active: 'classes' });
});

exports.classCreateForm = asyncHandler(async (req, res) => {
  const [teachers] = await db.query('SELECT t.id, u.name FROM teachers t JOIN users u ON u.id=t.user_id WHERE t.deleted_at IS NULL ORDER BY u.name');
  const [students] = await db.query('SELECT id, name, admission_no FROM students WHERE deleted_at IS NULL AND status="active" ORDER BY name');
  const [subjects] = await db.query('SELECT id, name FROM subjects WHERE deleted_at IS NULL ORDER BY name');
  res.render('admin/class-form', { title: 'Add Class', cls: null, teachers, students, subjects, assignments: [], teacherId: null, enrolled: [], active: 'classes' });
});

exports.classCreate = asyncHandler(async (req, res) => {
  const [dup] = await db.query(
    'SELECT id FROM classes WHERE name=? AND (section <=> ?) AND deleted_at IS NULL',
    [req.body.name, req.body.section || null]);
  if (dup.length) {
    req.flash('error', `Class "${req.body.name}" already exists.`);
    return res.redirect('/admin/classes/new');
  }
  const [r] = await db.query('INSERT INTO classes (name, section, description) VALUES (?,?,?)',
    [req.body.name, req.body.section || null, req.body.description || null]);
  const classId = r.insertId;

  // Assign class teacher (homeroom, subject_id NULL)
  if (req.body.teacher_id) {
    await db.query('INSERT INTO class_teacher_assignments (class_id, teacher_id, subject_id) VALUES (?,?,NULL)',
      [classId, req.body.teacher_id]);
  }

  // Assign subject teachers for this class (subject_id set)
  const subjIds = req.body.subject_id;
  const subjTeach = req.body.subject_teacher_id;
  if (subjIds) {
    const sArr = Array.isArray(subjIds) ? subjIds : [subjIds];
    const tArr = Array.isArray(subjTeach) ? subjTeach : subjTeach ? [subjTeach] : [];
    for (let i = 0; i < sArr.length; i++) {
      const sid = sArr[i], tid = tArr[i];
      if (!sid || !tid) continue;
      await db.query(
        'INSERT INTO class_teacher_assignments (class_id, teacher_id, subject_id) VALUES (?,?,?) ON DUPLICATE KEY UPDATE teacher_id=VALUES(teacher_id)',
        [classId, tid, sid]
      );
    }
  }

  // Enroll selected students into the class (current class for the active year)
  const ids = req.body.student_ids;
  if (ids) {
    const arr = Array.isArray(ids) ? ids : [ids];
    for (const sid of arr) {
      await assignStudentClass(sid, classId);
    }
  }
  await logActivity(req.user.id, 'class.create', `Created class ${req.body.name}`, req.ip);
  req.flash('success', 'Class created.');
  res.redirect('/admin/classes');
});

exports.classEditForm = asyncHandler(async (req, res) => {
  const [c] = await db.query('SELECT * FROM classes WHERE id=? AND deleted_at IS NULL', [req.params.id]);
  if (!c.length) { req.flash('error', 'Class not found.'); return res.redirect('/admin/classes'); }
  const [teachers] = await db.query('SELECT t.id, u.name FROM teachers t JOIN users u ON u.id=t.user_id WHERE t.deleted_at IS NULL ORDER BY u.name');
  const [students] = await db.query('SELECT id, name, admission_no FROM students WHERE deleted_at IS NULL AND status="active" ORDER BY name');
  const [subjects] = await db.query('SELECT id, name FROM subjects WHERE deleted_at IS NULL ORDER BY name');
  const [ct] = await db.query('SELECT teacher_id FROM class_teacher_assignments WHERE class_id=? AND subject_id IS NULL LIMIT 1', [req.params.id]);
  const [enr] = await db.query('SELECT student_id FROM student_class_enrollments WHERE class_id=?', [req.params.id]);
  const [assigned] = await db.query(
    `SELECT cta.subject_id, cta.teacher_id FROM class_teacher_assignments cta
     JOIN subjects s ON s.id=cta.subject_id
     WHERE cta.class_id=? AND cta.subject_id IS NOT NULL ORDER BY s.name`, [req.params.id]);
  res.render('admin/class-form', {
    title: 'Edit Class', cls: c[0], teachers, students, subjects, assignments: assigned,
    teacherId: ct.length ? ct[0].teacher_id : null,
    enrolled: enr.map(e => e.student_id),
    active: 'classes'
  });
});

exports.classUpdate = asyncHandler(async (req, res) => {
  const [dup] = await db.query(
    'SELECT id FROM classes WHERE name=? AND (section <=> ?) AND deleted_at IS NULL AND id<>?',
    [req.body.name, req.body.section || null, req.params.id]);
  if (dup.length) {
    req.flash('error', `Class "${req.body.name}" already exists.`);
    return res.redirect('/admin/classes/' + req.params.id + '/edit');
  }
  await db.query('UPDATE classes SET name=?, section=?, description=? WHERE id=?',
    [req.body.name, req.body.section || null, req.body.description || null, req.params.id]);

  // Replace subject teachers (subject_id set) for this class
  await db.query('DELETE FROM class_teacher_assignments WHERE class_id=? AND subject_id IS NOT NULL', [req.params.id]);
  const subjIds = req.body.subject_id;
  const subjTeach = req.body.subject_teacher_id;
  if (subjIds) {
    const sArr = Array.isArray(subjIds) ? subjIds : [subjIds];
    const tArr = Array.isArray(subjTeach) ? subjTeach : subjTeach ? [subjTeach] : [];
    for (let i = 0; i < sArr.length; i++) {
      const sid = sArr[i], tid = tArr[i];
      if (!sid || !tid) continue;
      await db.query(
        'INSERT INTO class_teacher_assignments (class_id, teacher_id, subject_id) VALUES (?,?,?) ON DUPLICATE KEY UPDATE teacher_id=VALUES(teacher_id)',
        [req.params.id, tid, sid]
      );
    }
  }

  // Replace class teacher (homeroom)
  await db.query('DELETE FROM class_teacher_assignments WHERE class_id=? AND subject_id IS NULL', [req.params.id]);
  if (req.body.teacher_id) {
    await db.query('INSERT INTO class_teacher_assignments (class_id, teacher_id, subject_id) VALUES (?,?,NULL)',
      [req.params.id, req.body.teacher_id]);
  }

  // Add newly selected students (moves them to this class for the active year)
  const ids = req.body.student_ids;
  if (ids) {
    const arr = Array.isArray(ids) ? ids : [ids];
    for (const sid of arr) {
      await assignStudentClass(sid, req.params.id);
    }
  }
  req.flash('success', 'Class updated.');
  res.redirect('/admin/classes');
});

exports.classDelete = asyncHandler(async (req, res) => {
  await db.query('UPDATE classes SET deleted_at=NOW() WHERE id=?', [req.params.id]);
  req.flash('success', 'Class deleted (soft).');
  res.redirect('/admin/classes');
});

// ============================================================
// SUBJECTS
// ============================================================
exports.subjects = asyncHandler(async (req, res) => {
  const [rows] = await db.query('SELECT * FROM subjects WHERE deleted_at IS NULL ORDER BY name');
  res.render('admin/subjects', { title: 'Subjects', subjects: rows, active: 'subjects' });
});

exports.subjectCreate = asyncHandler(async (req, res) => {
  await db.query('INSERT INTO subjects (name, code) VALUES (?,?)', [req.body.name, req.body.code || null]);
  req.flash('success', 'Subject added.');
  res.redirect('/admin/subjects');
});

exports.subjectDelete = asyncHandler(async (req, res) => {
  await db.query('UPDATE subjects SET deleted_at=NOW() WHERE id=?', [req.params.id]);
  req.flash('success', 'Subject deleted (soft).');
  res.redirect('/admin/subjects');
});

// ============================================================
// ASSIGNMENTS (teacher -> class -> subject)
// ============================================================
exports.assignments = asyncHandler(async (req, res) => {
  const [rows] = await db.query(
    `SELECT cta.id, c.name AS class_name, COALESCE(s.name, 'Class Teacher') AS subject_name, u.name AS teacher_name
     FROM class_teacher_assignments cta
     JOIN classes c ON c.id=cta.class_id
     LEFT JOIN subjects s ON s.id=cta.subject_id
     JOIN teachers t ON t.id=cta.teacher_id
     JOIN users u ON u.id=t.user_id
     ORDER BY c.name, s.name`);
  const [classes] = await db.query('SELECT id,name,section FROM classes WHERE deleted_at IS NULL ORDER BY name');
  const [subjects] = await db.query('SELECT id,name FROM subjects WHERE deleted_at IS NULL ORDER BY name');
  const [teachers] = await db.query('SELECT t.id, u.name FROM teachers t JOIN users u ON u.id=t.user_id WHERE t.deleted_at IS NULL ORDER BY u.name');
  res.render('admin/assignments', { title: 'Assignments', rows, classes, subjects, teachers, active: 'assignments' });
});

exports.assignmentCreate = asyncHandler(async (req, res) => {
  await db.query('INSERT INTO class_teacher_assignments (class_id,teacher_id,subject_id) VALUES (?,?,?)',
    [req.body.class_id, req.body.teacher_id, req.body.subject_id]);
  await logActivity(req.user.id, 'assignment.create', 'Assigned teacher to class/subject', req.ip);
  req.flash('success', 'Assignment created.');
  res.redirect('/admin/assignments');
});

exports.assignmentDelete = asyncHandler(async (req, res) => {
  await db.query('DELETE FROM class_teacher_assignments WHERE id=?', [req.params.id]);
  req.flash('success', 'Assignment removed.');
  res.redirect('/admin/assignments');
});

// ============================================================
// ATTENDANCE (view what teachers recorded)
// ============================================================
exports.attendanceView = asyncHandler(async (req, res) => {
  const [classes] = await db.query(
    `SELECT c.id, c.name, c.section FROM classes c WHERE c.deleted_at IS NULL ORDER BY c.name`);
  const classId = req.query.class || (classes.length ? classes[0].id : null);

  let date = req.query.date || null;
  if (classId && !date) {
    const [last] = await db.query('SELECT MAX(date) AS d FROM attendance WHERE class_id=?', [classId]);
    date = (last[0] && last[0].d) || new Date().toISOString().slice(0, 10);
  }

  let cls = null;
  let students = [];
  let statusMap = {};
  let summary = { present: 0, absent: 0, late: 0, excused: 0 };
  if (classId) {
    const [c] = await db.query('SELECT id, name, section FROM classes WHERE id=? AND deleted_at IS NULL', [classId]);
    cls = c[0] || null;
    if (cls && date) {
      [students] = await db.query(
        `SELECT s.id, s.name, s.admission_no, s.gender FROM students s
         JOIN student_class_enrollments sce ON sce.student_id=s.id AND sce.class_id=?
         JOIN terms t ON t.id=sce.term_id JOIN academic_years ay ON ay.id=t.academic_year_id
         WHERE s.deleted_at IS NULL AND s.status='active' AND ay.is_active=1 ORDER BY s.name`, [classId]);
      const [records] = await db.query(
        `SELECT a.student_id, a.status, a.note, u.name AS marked_by
         FROM attendance a LEFT JOIN users u ON u.id=a.marked_by
         WHERE a.class_id=? AND a.date=?`, [classId, date]);
      records.forEach(r => { statusMap[r.student_id] = r; });
      records.forEach(r => { if (summary[r.status] !== undefined) summary[r.status] += 1; });
    }
  }

  res.render('admin/attendance', {
    title: 'Attendance', classes, classId, date, cls, students, statusMap, summary, active: 'attendance'
  });
});

// ============================================================
// ACADEMIC YEARS & TERMS
// ============================================================
exports.academicYears = asyncHandler(async (req, res) => {
  const [years] = await db.query('SELECT * FROM academic_years ORDER BY id DESC');
  for (const y of years) {
    const [terms] = await db.query('SELECT * FROM terms WHERE academic_year_id=? ORDER BY id', [y.id]);
    y.terms = terms;
  }
  res.render('admin/academic', { title: 'Academic Years & Terms', years, active: 'academic' });
});

exports.academicYearCreate = asyncHandler(async (req, res) => {
  await db.query('INSERT INTO academic_years (name, start_date, end_date) VALUES (?,?,?)',
    [req.body.name, req.body.start_date, req.body.end_date]);
  req.flash('success', 'Academic year created.');
  res.redirect('/admin/academic-years');
});

exports.academicYearActivate = asyncHandler(async (req, res) => {
  await db.query('UPDATE academic_years SET is_active=0');
  await db.query('UPDATE academic_years SET is_active=1 WHERE id=?', [req.params.id]);
  // auto-activate the earliest term of the newly active year
  await db.query(`UPDATE terms SET is_active=0`);
  await db.query(`UPDATE terms SET is_active=1 WHERE id=(
    SELECT id FROM (SELECT id FROM terms WHERE academic_year_id=? ORDER BY id LIMIT 1) AS first
  )`, [req.params.id]);
  req.flash('success', 'Academic year activated (its Term 1 is now the active term).');
  res.redirect('/admin/academic-years');
});

exports.termActivate = asyncHandler(async (req, res) => {
  await db.query('UPDATE terms SET is_active=0');
  await db.query('UPDATE terms SET is_active=1 WHERE id=?', [req.params.id]);
  req.flash('success', 'Term activated.');
  res.redirect('/admin/academic-years');
});

exports.termCreate = asyncHandler(async (req, res) => {
  await db.query('INSERT INTO terms (academic_year_id, name, start_date, end_date) VALUES (?,?,?,?)',
    [req.body.academic_year_id, req.body.name, req.body.start_date || null, req.body.end_date || null]);
  req.flash('success', 'Term created.');
  res.redirect('/admin/academic-years');
});

// ============================================================
// EXAMINATIONS & MARKS
// ============================================================
exports.examinations = asyncHandler(async (req, res) => {
  const [rows] = await db.query(
    `SELECT e.*, c.name AS class_name, t.name AS term_name
     FROM examinations e JOIN classes c ON c.id=e.class_id JOIN terms t ON t.id=e.term_id
     ORDER BY e.date DESC`);
  const [classes] = await db.query('SELECT id,name,section FROM classes WHERE deleted_at IS NULL ORDER BY name');
  const [terms] = await db.query(`SELECT t.id, t.name, ay.name AS year FROM terms t JOIN academic_years ay ON ay.id=t.academic_year_id WHERE ay.is_active=1 ORDER BY t.id`);
  res.render('admin/exams', { title: 'Examinations', exams: rows, classes, terms, active: 'exams' });
});

exports.examCreate = asyncHandler(async (req, res) => {
  await db.query('INSERT INTO examinations (class_id,term_id,name,date,max_marks) VALUES (?,?,?,?,?)',
    [req.body.class_id, req.body.term_id, req.body.name, req.body.date || null, req.body.max_marks || 100]);
  req.flash('success', 'Examination created.');
  res.redirect('/admin/exams');
});

exports.examDelete = asyncHandler(async (req, res) => {
  await db.query('DELETE FROM examinations WHERE id=?', [req.params.id]);
  req.flash('success', 'Examination deleted.');
  res.redirect('/admin/exams');
});

exports.results = asyncHandler(async (req, res) => {
  const [classes] = await db.query(
    `SELECT c.id, c.name, c.section,
       (SELECT u.name FROM class_teacher_assignments cta
          JOIN teachers t ON t.id=cta.teacher_id
          JOIN users u ON u.id=t.user_id
        WHERE cta.class_id=c.id AND cta.subject_id IS NULL LIMIT 1) AS teacher_name
     FROM classes c WHERE c.deleted_at IS NULL ORDER BY c.name`);
  const [terms] = await db.query(
    `SELECT t.id, t.name, ay.name AS year FROM terms t
     JOIN academic_years ay ON ay.id=t.academic_year_id ORDER BY t.id DESC`);

  const classId = req.query.class || (classes.length ? classes[0].id : null);
  const termId = req.query.term || (terms.length ? terms[0].id : '');
  const studentId = req.query.student || '';

  const { cls, subjects, rows } = classId && termId
    ? await buildTermResults(classId, termId)
    : { cls: null, subjects: [], rows: [] };
  const displayRows = studentId ? rows.filter((r) => String(r.id) === studentId) : rows;
  const submission = classId && termId ? await getResultSubmission(classId, termId) : null;

  res.render('admin/results', {
    title: 'Results', classes, terms, classId, termId, studentId, rows, displayRows, cls, subjects, submission, active: 'marks'
  });
});

// Admin reviews submitted term results: approve for print / publication
exports.resultsApprove = asyncHandler(async (req, res) => {
  const { class: classId, term: termId } = req.body;
  if (!classId || !termId) {
    req.flash('error', 'Select a class and term.');
    return res.redirect('/admin/results');
  }
  await db.query(
    `INSERT INTO term_result_submissions (class_id, term_id, status, reviewed_by, reviewed_at)
     VALUES (?,?, 'approved', ?, NOW())
     ON DUPLICATE KEY UPDATE status='approved', reviewed_by=VALUES(reviewed_by), reviewed_at=VALUES(reviewed_at), admin_note=NULL`,
    [classId, termId, req.user.id]
  );
  // Publish to parents: all students of this class/term can now see their report
  await db.query(
    `UPDATE students s
     JOIN student_class_enrollments sce ON sce.student_id=s.id AND sce.class_id=? AND sce.term_id=?
     SET s.report_approved_at=NOW(), s.report_approved_by=?
     WHERE s.deleted_at IS NULL`,
    [classId, termId, req.user.id]
  );
  await logActivity(req.user.id, 'results.approved', `Approved results for class/term ${classId}/${termId}`, req.ip);
  req.flash('success', 'Results approved, published to parents and ready to print.');
  res.redirect(`/admin/results?class=${classId}&term=${termId}`);
});

// Admin sends results back to the class teacher for changes
exports.resultsRevision = asyncHandler(async (req, res) => {
  const { class: classId, term: termId, admin_note } = req.body;
  if (!classId || !termId) {
    req.flash('error', 'Select a class and term.');
    return res.redirect('/admin/results');
  }
  await db.query(
    `INSERT INTO term_result_submissions (class_id, term_id, status, reviewed_by, reviewed_at, admin_note)
     VALUES (?,?, 'revision', ?, NOW(), ?)
     ON DUPLICATE KEY UPDATE status='revision', reviewed_by=VALUES(reviewed_by), reviewed_at=VALUES(reviewed_at), admin_note=VALUES(admin_note)`,
    [classId, termId, req.user.id, req.body.admin_note || null]
  );
  // Hide from parents again until the revised results are approved
  await db.query(
    `UPDATE students s
     JOIN student_class_enrollments sce ON sce.student_id=s.id AND sce.class_id=? AND sce.term_id=?
     SET s.report_approved_at=NULL, s.report_approved_by=NULL
     WHERE s.deleted_at IS NULL`,
    [classId, termId]
  );
  await logActivity(req.user.id, 'results.revision', `Requested changes to results for class/term ${classId}/${termId}`, req.ip);
  req.flash('success', 'Results sent back to the class teacher for changes.');
  res.redirect(`/admin/results?class=${classId}&term=${termId}`);
});

exports.resultsReport = asyncHandler(async (req, res) => {
  const classId = req.query.class;
  const termId = req.query.term;
  const studentId = req.query.student ? String(req.query.student) : null;
  if (!classId || !termId) {
    req.flash('error', 'Select a class and term to print.');
    return res.redirect('/admin/results');
  }

  const { cls, subjects, rows } = await buildTermResults(classId, termId);
  if (!cls) {
    req.flash('error', 'Class not found.');
    return res.redirect('/admin/results');
  }

  const [termRows] = await db.query(
    'SELECT t.name, ay.name AS year FROM terms t JOIN academic_years ay ON ay.id=t.academic_year_id WHERE t.id=?', [termId]);
  const term = termRows[0] || { name: 'Term', year: '' };

  const logoPath = path.join(__dirname, '..', 'public', 'images', 'logo.jpg');

  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  const suffix = studentId ? `-student-${studentId}` : '';
  res.setHeader('Content-Disposition', `attachment; filename="results-${cls.name.replace(/\s+/g, '-')}-term-${termId}${suffix}.pdf"`);
  doc.pipe(res);

  const ranked = rows.slice().sort((a, b) => (a.position || 9999) - (b.position || 9999));
  const only = studentId ? ranked.find((r) => String(r.id) === studentId) : null;

  const drawHeader = (subtitle) => {
    try {
      if (fs.existsSync(logoPath)) doc.image(logoPath, 50, 40, { width: 55, height: 55 });
    } catch { /* ignore logo errors */ }
    doc.font('Helvetica-Bold').fontSize(20).fillColor('#1a3a5c').text('OPPORTUNITY SCHOOL', 118, 52, { align: 'left' });
    doc.font('Helvetica').fontSize(11).fillColor('#333333').text(subtitle, 118, 78);
    doc.font('Helvetica').fontSize(9).fillColor('#888888').text('P.O. Box 0000, Dar es Salaam, Tanzania | info@opportunityschool.com | www.opportunityschool.com', 50, 785, { align: 'center' });
    doc.strokeColor('#1a3a5c').lineWidth(2).moveTo(50, 78).lineTo(545, 78).stroke();
  };

  // ---- one student's report card ----
  const drawStudentCard = (r, firstPage) => {
    if (!firstPage) doc.addPage();
    drawHeader('Student Report Card');
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#1a3a5c').text('Student Details', 50, 100);
    doc.rect(50, 112, 495, 78).strokeColor('#cccccc').stroke();
    doc.font('Helvetica').fontSize(10).fillColor('#333333');
    doc.text(`Name: ${r.name}`, 60, 122);
    doc.text(`Admission No: ${r.admission_no || '—'}`, 60, 138);
    doc.text(`Class: ${cls.name} ${cls.section || ''}`, 60, 154);
    doc.text(`Term: ${term.name} (${term.year})`, 310, 122);
    const gradedCount = ranked.filter((x) => x.hasMarks).length;
    doc.text(`Position in Class: ${r.position ? `#${r.position}${gradedCount ? ` of ${gradedCount}` : ''}` : '—'}`, 310, 138);
    doc.text(`Class Teacher: ${cls.teacher_name || '—'}`, 310, 154);

    doc.font('Helvetica-Bold').fontSize(11).fillColor('#1a3a5c').text('Marks', 50, 200);
    doc.rect(50, 212, 495, 20).fill('#1a3a5c');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9);
    doc.text('Subject', 60, 218);
    doc.text('Obtained', 360, 218, { width: 60, align: 'right' });
    doc.text('Max', 420, 218, { width: 40, align: 'right' });
    doc.text('%', 468, 218, { width: 38, align: 'right' });
    doc.text('Grade', 510, 218, { width: 30, align: 'right' });

    let my = 234;
    r.subjects.forEach((sub, si) => {
      if (si % 2 === 1) doc.rect(50, my - 2, 495, 18).fill('#eef2f7');
      doc.fillColor('#333333').font('Helvetica').fontSize(10);
      doc.text(sub.subject_name, 60, my);
      doc.text(sub.obtained !== null ? String(sub.obtained) : '—', 360, my, { width: 60, align: 'right' });
      doc.text(sub.obtained !== null ? String(sub.max) : '—', 420, my, { width: 40, align: 'right' });
      doc.text(sub.pct !== null ? String(sub.pct) : '—', 468, my, { width: 38, align: 'right' });
      doc.text(sub.grade || '—', 510, my, { width: 30, align: 'right' });
      my += 18;
    });
    doc.strokeColor('#cccccc').moveTo(50, my).lineTo(545, my).stroke();
    my += 4;
    doc.font('Helvetica-Bold').fontSize(10);
    doc.fillColor('#333333').text(`Total: ${r.total} / ${r.max}`, 60, my);
    doc.text(`Overall: ${r.pct}%  Grade: `, 380, my, { continued: true });
    doc.fillColor(r.grade === 'A' || r.grade === 'B' ? '#1a8a3c' : '#c0392b')
      .text(r.grade).fillColor('#333333');

    doc.font('Helvetica').fontSize(9).fillColor('#888888')
      .text('Class Teacher Signature: ______________________      Parent Signature: ______________________', 60, 745);
  };

  if (only) {
    if (only.hasMarks) drawStudentCard(only, true);
    return doc.end();
  }

  // ---------- Page 1: class summary ----------
  drawHeader('End of Term Results Summary');
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#1a3a5c')
    .text(`${cls.name} ${cls.section || ''}`, 50, 100, { continued: true })
    .font('Helvetica').fontSize(10).fillColor('#333333').text(`  •  ${term.name} (${term.year})`);
  if (cls.teacher_name) {
    doc.font('Helvetica').fontSize(10).fillColor('#333333').text(`Class Teacher: ${cls.teacher_name}`, 50, 118);
  }

  const colX = { pos: 50, student: 90, total: 440, pct: 480, grade: 520 };
  const headerY = 150;
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#ffffff');
  doc.rect(50, headerY, 495, 20).fill('#1a3a5c');
  doc.fillColor('#ffffff');
  doc.text('Pos', colX.pos + 8, headerY + 6);
  doc.text('Student', colX.student + 8, headerY + 6);
  doc.text('Total', colX.total, headerY + 6, { width: 40, align: 'right' });
  doc.text('%', colX.pct, headerY + 6, { width: 40, align: 'right' });
  doc.text('Grade', colX.grade, headerY + 6, { width: 30, align: 'right' });

  let y = headerY + 24;
  const graded = ranked.filter((r) => r.hasMarks);
  const rowH = 18;
  graded.forEach((r, idx) => {
    if (y > 760) { doc.addPage(); y = 60; drawHeader('End of Term Results Summary (continued)'); }
    if (idx % 2 === 1) { doc.rect(50, y - 2, 495, rowH).fill('#eef2f7'); }
    doc.fillColor('#333333');
    doc.font('Helvetica').fontSize(10);
    doc.text(String(r.position), colX.pos + 8, y);
    doc.text(r.name, colX.student + 8, y);
    doc.text(String(r.total), colX.total, y, { width: 40, align: 'right' });
    doc.text(`${r.pct}`, colX.pct, y, { width: 40, align: 'right' });
    doc.font('Helvetica-Bold').text(r.grade, colX.grade, y, { width: 30, align: 'right' });
    y += rowH;
  });

  ranked.filter((r) => !r.hasMarks).forEach((r) => {
    if (y > 760) { doc.addPage(); y = 60; drawHeader('End of Term Results Summary (continued)'); }
    doc.font('Helvetica').fontSize(10).fillColor('#999999');
    doc.text('-', colX.pos + 8, y);
    doc.text(`${r.name} (no results yet)`, colX.student + 8, y);
    y += rowH;
  });

  doc.font('Helvetica').fontSize(9).fillColor('#888888')
    .text(`Grading: A (81-100) • B (61-80) • C (41-60) • D (21-40) • F (0-20)`, 50, y + 6);

  // ---------- Report card per student ----------
  for (const r of ranked) {
    if (!r.hasMarks) continue;
    drawStudentCard(r, false);
  }

  doc.end();
});

// ============================================================
// MESSAGES
// ============================================================
exports.messages = asyncHandler(async (req, res) => {
  const [rows] = await db.query(
    `SELECT m.*, s.name AS sender_name FROM messages m LEFT JOIN users s ON s.id=m.sender_id ORDER BY m.created_at DESC LIMIT 30`);
  const [users] = await db.query('SELECT id, name, role FROM users WHERE deleted_at IS NULL ORDER BY name');
  res.render('admin/messages', { title: 'Messages', messages: rows, users, active: 'messages' });
});

exports.messageCreate = asyncHandler(async (req, res) => {
  const { subject, body, audience, recipient_id } = req.body;
  const [r] = await db.query(
    'INSERT INTO messages (sender_id, subject, body, audience, recipient_id) VALUES (?,?,?,?,?)',
    [req.user.id, subject, body, audience, audience === 'user' ? recipient_id : null]
  );

  // Fan-out to message_recipients
  if (audience === 'user') {
    await db.query('INSERT INTO message_recipients (message_id, user_id) VALUES (?,?)', [r.insertId, recipient_id]);
  } else {
    let role = null;
    if (audience === 'all_teachers') role = 'teacher';
    if (audience === 'all_parents') role = 'parent';
    if (audience === 'all_users') role = null;
    const [users] = role
      ? await db.query('SELECT id FROM users WHERE role=? AND deleted_at IS NULL', [role])
      : await db.query('SELECT id FROM users WHERE deleted_at IS NULL');
    for (const u of users) {
      await db.query('INSERT IGNORE INTO message_recipients (message_id, user_id) VALUES (?,?)', [r.insertId, u.id]);
    }
  }
  await logActivity(req.user.id, 'message.send', `Sent "${subject}"`, req.ip);
  req.flash('success', 'Message sent.');
  res.redirect('/admin/messages');
});

exports.messageDelete = asyncHandler(async (req, res) => {
  await db.query('DELETE FROM messages WHERE id=?', [req.params.id]);
  req.flash('success', 'Message deleted.');
  res.redirect('/admin/messages');
});

// ============================================================
// REPORTS
// ============================================================
exports.reports = asyncHandler(async (req, res) => {
  const [classes] = await db.query('SELECT id,name,section FROM classes WHERE deleted_at IS NULL ORDER BY name');
  const [terms] = await db.query(`SELECT t.id, t.name, ay.name AS year FROM terms t JOIN academic_years ay ON ay.id=t.academic_year_id ORDER BY t.id DESC`);
  const [subjects] = await db.query('SELECT id,name FROM subjects WHERE deleted_at IS NULL ORDER BY name');

  const cls = req.query.class || '';
  const tm = req.query.term || '';
  let attendanceSummary = null;
  let resultSummary = null;

  if (cls) {
    // Attendance summary (always show all statuses, fill zeros)
    const [att] = await db.query(
      `SELECT a.status, COUNT(*) AS c FROM attendance a WHERE a.class_id=? GROUP BY a.status`, [cls]);
    const full = { present: 0, absent: 0, late: 0, excused: 0 };
    att.forEach(a => { if (full[a.status] !== undefined) full[a.status] = a.c; });
    attendanceSummary = Object.keys(full).map(k => ({ status: k, c: full[k] }));

    // Results overview
    let sql = `SELECT sub.name AS subject_name, COUNT(*) AS entries, ROUND(AVG(m.marks_obtained),2) AS avg_marks
               FROM marks m JOIN subjects sub ON sub.id=m.subject_id JOIN examinations e ON e.id=m.exam_id
               WHERE e.class_id=?`;
    const params = [cls];
    if (tm) { sql += ' AND e.term_id=?'; params.push(tm); }
    sql += ' GROUP BY sub.name ORDER BY sub.name';
    const [res] = await db.query(sql, params);
    resultSummary = res;
  }

  res.render('admin/reports', { title: 'Reports', classes, terms, subjects, cls, tm, attendanceSummary, resultSummary, active: 'reports' });
});

// ============================================================
// STUDENT REPORT (all subjects the student studies, filled by
// different teachers across classes/terms) + PDF print.
// Admin approves & prints the report; the parent may only then
// download it.
// ============================================================
exports.studentReport = asyncHandler(async (req, res) => {
  const report = await buildStudentReport(req.params.id);
  if (!report) { req.flash('error', 'Student not found.'); return res.redirect('/admin/students'); }
  res.render('admin/student-report', {
    title: `${report.student.name} — Report`, report, active: 'students'
  });
});

exports.studentReportPrint = asyncHandler(async (req, res) => {
  const report = await buildStudentReport(req.params.id);
  if (!report) { req.flash('error', 'Student not found.'); return res.redirect('/admin/students'); }
  const { student } = report;
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="report-${student.admission_no || student.id}.pdf"`);
  doc.pipe(res);
  const logoPath = path.join(__dirname, '..', 'public', 'images', 'logo.jpg');
  writeStudentReportPdf(doc, report, { logoPath, approvedLine: `Report approved & finalized by: ${student.report_approved_by_name || 'Admin'}` });
  doc.end();
});

exports.studentReportApprove = asyncHandler(async (req, res) => {
  const [row] = await db.query(`SELECT id FROM students WHERE id=? AND deleted_at IS NULL`, [req.params.id]);
  if (!row.length) { req.flash('error', 'Student not found.'); return res.redirect('/admin/students'); }
  await db.query('UPDATE students SET report_approved_at=NOW(), report_approved_by=? WHERE id=?', [req.user.id, req.params.id]);
  await logActivity(req.user.id, 'report_approve', `Approved & printed report for student #${req.params.id}`);
  req.flash('success', 'Report approved & finalized. The parent can now download the PDF.');
  res.redirect(`/admin/students/${req.params.id}/report`);
});

exports.studentReportUnapprove = asyncHandler(async (req, res) => {
  await db.query('UPDATE students SET report_approved_at=NULL, report_approved_by=NULL WHERE id=?', [req.params.id]);
  await logActivity(req.user.id, 'report_unapprove', `Removed approval of report for student #${req.params.id}`);
  req.flash('success', 'Report approval removed. The parent can no longer download it.');
  res.redirect(`/admin/students/${req.params.id}/report`);
});

// ============================================================
// ACTIVITY LOGS
// ============================================================
exports.logs = asyncHandler(async (req, res) => {
  const [rows] = await db.query(
    `SELECT l.*, u.name AS user_name FROM activity_logs l LEFT JOIN users u ON u.id=l.user_id ORDER BY l.created_at DESC LIMIT 100`);
  res.render('admin/logs', { title: 'Activity Logs', logs: rows, active: 'logs' });
});
