/**
 * Centralized async error handler wrapper + helper functions.
 * Avoids repetitive try/catch blocks in controllers.
 */

/**
 * Wrap an async route handler so thrown errors go to Express error handler.
 */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

/**
 * Compute a letter grade from a percentage (0-100).
 * A(81-100), B(61-80), C(41-60), D(21-40), F(0-20)
 */
function gradeFor(marks, maxMarks = 100) {
  const pct = (marks / maxMarks) * 100;
  if (pct >= 81) return 'A';
  if (pct >= 61) return 'B';
  if (pct >= 41) return 'C';
  if (pct >= 21) return 'D';
  return 'F';
}

/**
 * Log an admin/significant action to activity_logs.
 */
async function logActivity(userId, action, description = '', ip = '') {
  const db = require('../config/db');
  try {
    await db.query(
      'INSERT INTO activity_logs (user_id, action, description, ip_address) VALUES (?, ?, ?, ?)',
      [userId, action, description, ip]
    );
  } catch (err) {
    console.error('logActivity error:', err.message);
  }
}

/**
 * Build term results for a class/term: per-student per-subject aggregates
 * with grades, overall totals and position (rank) within the class.
 */
async function buildTermResults(classId, termId) {
  const db = require('../config/db');

  const [c] = await db.query(
    `SELECT c.id, c.name, c.section,
       (SELECT u.name FROM class_teacher_assignments cta
          JOIN teachers t ON t.id=cta.teacher_id
          JOIN users u ON u.id=t.user_id
        WHERE cta.class_id=c.id AND cta.subject_id IS NULL LIMIT 1) AS teacher_name
     FROM classes c WHERE c.id=? AND c.deleted_at IS NULL`, [classId]);
  const cls = c[0] || null;

  let subjects = [];
  let rows = [];
  if (!cls) return { cls, subjects, rows };

  // Subjects taught in this class (with the teacher who enters marks)
  [subjects] = await db.query(
    `SELECT DISTINCT sub.id, sub.name, u.name AS teacher_name
     FROM subjects sub
     JOIN class_teacher_assignments cta ON cta.subject_id=sub.id AND cta.class_id=?
     JOIN teachers t ON t.id=cta.teacher_id JOIN users u ON u.id=t.user_id
     WHERE sub.deleted_at IS NULL ORDER BY sub.name`, [classId]);

  const [students] = await db.query(
    `SELECT DISTINCT s.id, s.name, s.admission_no FROM students s
     JOIN student_class_enrollments sce ON sce.student_id=s.id AND sce.class_id=? AND sce.term_id=?
     WHERE s.deleted_at IS NULL AND s.status='active' ORDER BY s.name`, [classId, termId]);

  if (!students.length) return { cls, subjects, rows };

  // All marks entered for these students in this class + term
  const [marks] = await db.query(
    `SELECT m.student_id, m.subject_id, m.marks_obtained, e.max_marks
     FROM marks m
     JOIN examinations e ON e.id=m.exam_id AND e.class_id=? AND e.term_id=?
     WHERE m.student_id IN (?) ORDER BY e.id, m.subject_id`,
    [classId, termId, students.map((s) => s.id)]);

  // Aggregate per student per subject
  const byStudentSubject = {};
  for (const st of students) byStudentSubject[st.id] = {};
  for (const m of marks) {
    if (!byStudentSubject[m.student_id]) byStudentSubject[m.student_id] = {};
    const agg = byStudentSubject[m.student_id][m.subject_id] || { subject_id: m.subject_id, obtained: 0, max: 0 };
    agg.obtained += parseFloat(m.marks_obtained);
    agg.max += parseFloat(m.max_marks || 100);
    byStudentSubject[m.student_id][m.subject_id] = agg;
  }

  rows = students.map((s) => {
    const subj = byStudentSubject[s.id];
    const subjectRows = subjects.map((su) => {
      const agg = subj[su.id];
      const pct = agg && agg.max ? (agg.obtained / agg.max) * 100 : null;
      return {
        subject_name: su.name,
        teacher_name: su.teacher_name,
        obtained: agg ? agg.obtained : null,
        max: agg ? agg.max : null,
        pct: pct !== null ? Math.round(pct * 10) / 10 : null,
        grade: pct !== null ? gradeFor(pct, 100) : null
      };
    });
    let total = 0, max = 0;
    subjectRows.forEach((r) => { if (r.obtained !== null) { total += r.obtained; max += r.max; } });
    const overallPct = max ? (total / max) * 100 : null;
    return {
      id: s.id, name: s.name, admission_no: s.admission_no,
      subjects: subjectRows,
      total: Math.round(total * 100) / 100,
      max: Math.round(max * 100) / 100,
      pct: overallPct !== null ? Math.round(overallPct * 10) / 10 : null,
      grade: overallPct !== null ? gradeFor(overallPct, 100) : null,
      hasMarks: max > 0
    };
  });

  // Position = rank by percentage (descending)
  const withMarks = rows.filter((r) => r.hasMarks).sort((a, b) => b.pct - a.pct);
  withMarks.forEach((r, i) => { r.position = i + 1; });

  return { cls, subjects, rows };
}

/**
 * Build the full academic report data for one student: every subject they
 * study (across classes/terms) with the teachers who entered the marks.
 */
async function buildStudentReport(studentId) {
  const db = require('../config/db');

  const [student] = await db.query(
    `SELECT s.*, u.name AS parent_name, u.email AS parent_email, rb.name AS report_approved_by_name
     FROM students s
     LEFT JOIN users u ON u.id=s.parent_user_id
     LEFT JOIN users rb ON rb.id=s.report_approved_by
     WHERE s.id=? AND s.deleted_at IS NULL`, [studentId]);
  if (!student.length) return null;
  const st = student[0];

  const [ci] = await db.query(
    `SELECT c.name AS class_name, u2.name AS class_teacher FROM student_class_enrollments sce
     JOIN terms t ON t.id=sce.term_id JOIN academic_years ay ON ay.id=t.academic_year_id
     JOIN classes c ON c.id=sce.class_id
     LEFT JOIN class_teacher_assignments cta ON cta.class_id=sce.class_id AND cta.subject_id IS NULL
     LEFT JOIN teachers t2 ON t2.id=cta.teacher_id LEFT JOIN users u2 ON u2.id=t2.user_id
     WHERE sce.student_id=? AND ay.is_active=1 ORDER BY t.id DESC LIMIT 1`, [studentId]);
  const current = ci[0] || { class_name: null, class_teacher: null };

  const [terms] = await db.query(
    `SELECT DISTINCT t.id, t.name, ay.name AS year FROM marks m
     JOIN examinations e ON e.id=m.exam_id JOIN terms t ON t.id=e.term_id
     JOIN academic_years ay ON ay.id=t.academic_year_id
     WHERE m.student_id=? ORDER BY t.id`, [studentId]);

  const termResults = [];
  let grandTotal = 0, grandMax = 0;
  for (const t of terms) {
    const [sum] = await db.query(
      `SELECT m.subject_id, sub.name AS subject_name,
              COUNT(DISTINCT m.exam_id) AS exams,
              SUM(m.marks_obtained) AS obtained, SUM(e.max_marks) AS max_marks,
              GROUP_CONCAT(DISTINCT u.name ORDER BY u.name SEPARATOR ', ') AS teachers
       FROM marks m
       JOIN examinations e ON e.id=m.exam_id AND e.term_id=?
       JOIN subjects sub ON sub.id=m.subject_id
       LEFT JOIN users u ON u.id=m.entered_by
       WHERE m.student_id=? GROUP BY m.subject_id, sub.name ORDER BY sub.name`, [t.id, studentId]);

    const subjects = sum.map((s) => {
      const pct = s.max_marks ? (s.obtained / s.max_marks) * 100 : null;
      return {
        subject_name: s.subject_name, exams: s.exams, teachers: s.teachers,
        obtained: Math.round(s.obtained * 100) / 100, max: Math.round(s.max_marks * 100) / 100,
        pct: pct !== null ? Math.round(pct * 10) / 10 : null,
        grade: pct !== null ? gradeFor(pct, 100) : null
      };
    });
    let total = 0, max = 0;
    subjects.forEach((s) => { total += s.obtained; max += s.max; });
    grandTotal += total; grandMax += max;
    const termPct = max ? (total / max) * 100 : null;

    const [details] = await db.query(
      `SELECT e.name AS exam_name, c.name AS class_name, sub.name AS subject_name,
              m.marks_obtained, e.max_marks, m.remarks, u.name AS teacher
       FROM marks m
       JOIN examinations e ON e.id=m.exam_id AND e.term_id=?
       JOIN classes c ON c.id=e.class_id
       JOIN subjects sub ON sub.id=m.subject_id
       LEFT JOIN users u ON u.id=m.entered_by
       WHERE m.student_id=? ORDER BY sub.name, e.id`, [t.id, studentId]);
    details.forEach((d) => {
      const pct = d.max_marks ? (d.marks_obtained / d.max_marks) * 100 : null;
      d.pct = pct !== null ? Math.round(pct * 10) / 10 : null;
      d.grade = pct !== null ? gradeFor(pct, 100) : null;
      d.marks_obtained = Math.round(parseFloat(d.marks_obtained) * 100) / 100;
    });

    termResults.push({
      id: t.id, name: t.name, year: t.year, subjects,
      total: Math.round(total * 100) / 100, max: Math.round(max * 100) / 100,
      pct: termPct !== null ? Math.round(termPct * 10) / 10 : null,
      grade: termPct !== null ? gradeFor(termPct, 100) : null,
      details
    });
  }

  const grandPct = grandMax ? (grandTotal / grandMax) * 100 : null;
  const overall = {
    total: Math.round(grandTotal * 100) / 100, max: Math.round(grandMax * 100) / 100,
    pct: grandPct !== null ? Math.round(grandPct * 10) / 10 : null,
    grade: grandPct !== null ? gradeFor(grandPct, 100) : null
  };

  return { student: st, current, terms: termResults, overall };
}

/**
 * Fetch the review/submission status for a class + term (class teacher
 * confirms results, admin approves). Returns null when never submitted.
 */
async function getResultSubmission(classId, termId) {
  const db = require('../config/db');
  const [rows] = await db.query(
    `SELECT s.status, s.submitted_by, s.submitted_at, s.reviewed_by, s.reviewed_at, s.admin_note,
            su.name AS submitted_by_name, ru.name AS reviewed_by_name
     FROM term_result_submissions s
     LEFT JOIN users su ON su.id=s.submitted_by
     LEFT JOIN users ru ON ru.id=s.reviewed_by
     WHERE s.class_id=? AND s.term_id=?`, [classId, termId]);
  return rows[0] || null;
}

module.exports = { asyncHandler, gradeFor, buildTermResults, buildStudentReport, getResultSubmission, logActivity };
