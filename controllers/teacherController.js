/**
 * Teacher controller - classes, attendance, marks, results.
 */
const db = require('../config/db');
const { asyncHandler, gradeFor, buildTermResults, getResultSubmission } = require('../middleware/helpers');

// ============================================================
// DASHBOARD
// ============================================================
exports.dashboard = asyncHandler(async (req, res) => {
  // Find the teacher's profile
  const [teacher] = await db.query('SELECT id FROM teachers WHERE user_id=? AND deleted_at IS NULL', [req.user.id]);
  if (!teacher.length) {
    req.flash('error', 'No teacher profile linked to your account.');
    return res.redirect('/auth/logout');
  }
  const teacherId = teacher[0].id;

  // Their classes & subjects
  const [assignments] = await db.query(
    `SELECT cta.id, c.id AS class_id, c.name AS class_name, s.id AS subject_id, s.name AS subject_name
     FROM class_teacher_assignments cta
     JOIN classes c ON c.id=cta.class_id
     LEFT JOIN subjects s ON s.id=cta.subject_id
     WHERE cta.teacher_id=? AND c.deleted_at IS NULL
       AND (s.deleted_at IS NULL OR s.id IS NULL)
     ORDER BY c.name, s.name`, [teacherId]);

  // Today's attendance count
  const today = new Date().toISOString().slice(0,10);
  const [todayAtt] = await db.query(
    `SELECT COUNT(*) AS c FROM attendance WHERE date=? AND marked_by=?`, [today, req.user.id]);

  const [classCount] = await db.query(
    `SELECT COUNT(DISTINCT cta.class_id) AS c FROM class_teacher_assignments cta WHERE cta.teacher_id=?`, [teacherId]);
  const [studentCount] = await db.query(
    `SELECT COUNT(DISTINCT sce.student_id) AS c FROM student_class_enrollments sce
     JOIN class_teacher_assignments cta ON cta.class_id=sce.class_id
     WHERE cta.teacher_id=?`, [teacherId]);

  res.render('teacher/dashboard', {
    title: 'Teacher Dashboard',
    assignments,
    stats: { classes: classCount[0].c, students: studentCount[0].c, todayAttendance: todayAtt[0].c },
    active: 'dashboard'
  });
});

// ============================================================
// MY CLASSES & STUDENTS
// ============================================================
exports.classes = asyncHandler(async (req, res) => {
  const [teacher] = await db.query('SELECT id FROM teachers WHERE user_id=? AND deleted_at IS NULL', [req.user.id]);
  if (!teacher.length) { req.flash('error', 'No teacher profile.'); return res.redirect('/auth/logout'); }
  const [rows] = await db.query(
    `SELECT DISTINCT c.id, c.name, c.section,
       (SELECT COUNT(*) FROM class_teacher_assignments cta2 WHERE cta2.class_id=c.id AND cta2.teacher_id=?) AS subj_count,
       (SELECT COUNT(DISTINCT sce.student_id) FROM student_class_enrollments sce) AS student_count
     FROM class_teacher_assignments cta
     JOIN classes c ON c.id=cta.class_id
     WHERE cta.teacher_id=? AND c.deleted_at IS NULL ORDER BY c.name`, [teacher[0].id, teacher[0].id]);
  res.render('teacher/classes', { title: 'My Classes', classes: rows, active: 'classes' });
});

// View a specific class with its student list + my subjects in it
exports.classView = asyncHandler(async (req, res) => {
  const classId = req.params.id;
  const [teacher] = await db.query('SELECT id FROM teachers WHERE user_id=? AND deleted_at IS NULL', [req.user.id]);
  if (!teacher.length) { req.flash('error', 'No teacher profile.'); return res.redirect('/teacher'); }
  const teacherId = teacher[0].id;

  // Verify this teacher teaches in this class
  const [perm] = await db.query(
    'SELECT id FROM class_teacher_assignments WHERE class_id=? AND teacher_id=?', [classId, teacherId]);
  // (assignments use JOINed tables; the deleted check is on class/subject in the join). Simplify:
  if (!perm.length) { req.flash('error', 'You are not assigned to this class.'); return res.redirect('/teacher/classes'); }

  const [cls] = await db.query('SELECT * FROM classes WHERE id=? AND deleted_at IS NULL', [classId]);
  if (!cls.length) { req.flash('error', 'Class not found.'); return res.redirect('/teacher/classes'); }

  const [subjects] = await db.query(
    `SELECT s.id, s.name FROM subjects s
     JOIN class_teacher_assignments cta ON cta.subject_id=s.id
     WHERE cta.class_id=? AND cta.teacher_id=? AND s.deleted_at IS NULL ORDER BY s.name`, [classId, teacherId]);

  const [students] = await db.query(
    `SELECT s.id, s.name, s.admission_no, s.gender FROM students s
     JOIN student_class_enrollments sce ON sce.student_id=s.id AND sce.class_id=?
     JOIN terms t ON t.id=sce.term_id JOIN academic_years ay ON ay.id=t.academic_year_id
     WHERE s.deleted_at IS NULL AND s.status='active' AND ay.is_active=1
     ORDER BY s.name`, [classId]);

  res.render('teacher/class-view', { title: `Class ${cls[0].name}`, cls: cls[0], subjects, students, active: 'classes' });
});

// ============================================================
// ATTENDANCE
// ============================================================
exports.attendanceForm = asyncHandler(async (req, res) => {
  const classId = req.params.classId;
  const date = req.query.date || new Date().toISOString().slice(0,10);
  const [teacher] = await db.query('SELECT id FROM teachers WHERE user_id=? AND deleted_at IS NULL', [req.user.id]);
  if (!teacher.length) return res.redirect('/teacher');
  const teacherId = teacher[0].id;

  const [perm] = await db.query('SELECT id FROM class_teacher_assignments WHERE class_id=? AND teacher_id=?', [classId, teacherId]);
  if (!perm.length) { req.flash('error', 'Not assigned to this class.'); return res.redirect('/teacher/classes'); }

  const [cls] = await db.query('SELECT name FROM classes WHERE id=?', [classId]);
  const [students] = await db.query(
    `SELECT s.id, s.name, s.admission_no FROM students s
     JOIN student_class_enrollments sce ON sce.student_id=s.id AND sce.class_id=?
     JOIN terms t ON t.id=sce.term_id JOIN academic_years ay ON ay.id=t.academic_year_id
     WHERE s.deleted_at IS NULL AND s.status='active' AND ay.is_active=1 ORDER BY s.name`, [classId]);

  // Pre-fill existing attendance for that date
  const [existing] = await db.query('SELECT student_id, status, note FROM attendance WHERE date=? AND class_id=?', [date, classId]);
  const statusMap = {};
  existing.forEach(e => statusMap[e.student_id] = e);

  res.render('teacher/attendance', { title: 'Mark Attendance', classId, date, cls: cls[0], students, statusMap, active: 'classes' });
});

exports.attendanceSave = asyncHandler(async (req, res) => {
  const classId = req.params.classId;
  const { date, student_id, status, note } = req.body;
  const dateStr = date || new Date().toISOString().slice(0,10);
  const teacher = await db.query('SELECT id FROM teachers WHERE user_id=?', [req.user.id]);
  const teacherId = teacher[0][0].id;

  // Students is array (or single). Normalize.
  const ids = Array.isArray(student_id) ? student_id : student_id ? [student_id] : [];
  // status is keyed by student index: {0:'present',1:'absent',...} (kept separate per student on the form)
  const sts = status == null ? []
    : Array.isArray(status) ? status
    : Object.keys(status).sort((a, b) => Number(a) - Number(b)).map((k) => status[k]);
  const nts = note ? (Array.isArray(note) ? note : [note]) : [];

  for (let i = 0; i < ids.length; i++) {
    const sid = ids[i];
    const st = sts[i] || 'present';
    const nt = nts[i] || null;
    await db.query(
      `INSERT INTO attendance (student_id, class_id, date, status, note, marked_by) VALUES (?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE status=VALUES(status), note=VALUES(note), marked_by=VALUES(marked_by)`,
      [sid, classId, dateStr, st, nt, req.user.id]
    );
  }
  req.flash('success', 'Attendance saved for ' + dateStr);
  res.redirect(`/teacher/attendance/${classId}?date=${dateStr}`);
});

exports.attendanceHistory = asyncHandler(async (req, res) => {
  const classId = req.params.classId;
  const [teacher] = await db.query('SELECT id FROM teachers WHERE user_id=?', [req.user.id]);
  const teacherId = teacher[0].id;
  const [perm] = await db.query('SELECT id FROM class_teacher_assignments WHERE class_id=? AND teacher_id=?', [classId, teacherId]);
  if (!perm.length) { req.flash('error', 'Not assigned.'); return res.redirect('/teacher/classes'); }

  const [rows] = await db.query(
    `SELECT a.date, a.status, COUNT(*) AS c FROM attendance a WHERE a.class_id=? GROUP BY a.date, a.status ORDER BY a.date DESC LIMIT 60`, [classId]);
  // re-shape into date => {present, absent, late, excused}
  const grouped = {};
  rows.forEach(r => {
    if (!grouped[r.date]) grouped[r.date] = { present:0, absent:0, late:0, excused:0 };
    grouped[r.date][r.status] = r.c;
  });
  const [cls] = await db.query('SELECT name FROM classes WHERE id=?', [classId]);
  res.render('teacher/attendance-history', { title: 'Attendance History', classId, cls: cls[0], grouped, active: 'classes' });
});

// ============================================================
// MARKS ENTRY
// ============================================================
exports.marksEntry = asyncHandler(async (req, res) => {
  const classId = req.params.classId;
  const subjectId = req.params.subjectId;
  const [teacher] = await db.query('SELECT id FROM teachers WHERE user_id=? AND deleted_at IS NULL', [req.user.id]);
  if (!teacher.length) return res.redirect('/teacher');
  const teacherId = teacher[0].id;

  // Verify assignment
  const [perm] = await db.query(
    'SELECT cta.id FROM class_teacher_assignments cta WHERE cta.class_id=? AND cta.subject_id=? AND cta.teacher_id=?',
    [classId, subjectId, teacherId]);
  if (!perm.length) { req.flash('error', 'You are not assigned to teach this subject in this class.'); return res.redirect('/teacher/classes'); }

  // Active exam for this class (latest)
  const [exams] = await db.query(
    `SELECT e.*, t.name AS term_name FROM examinations e JOIN terms t ON t.id=e.term_id
     WHERE e.class_id=? ORDER BY e.date DESC, e.id DESC LIMIT 5`, [classId]);

  const examId = req.query.exam || (exams.length ? exams[0].id : null);
  const [cls] = await db.query('SELECT name FROM classes WHERE id=?', [classId]);
  const [sub] = await db.query('SELECT name FROM subjects WHERE id=?', [subjectId]);

  // Which term's roster to show: the selected exam's term, else the active term
  let exam = null;
  let termId = null;
  let termName = '';
  if (examId) {
    [exam] = await db.query('SELECT * FROM examinations WHERE id=?', [examId]);
  }
  if (exam && exam.length) {
    termId = exam[0].term_id;
    const [tr] = await db.query('SELECT t.name, ay.name AS year FROM terms t JOIN academic_years ay ON ay.id=t.academic_year_id WHERE t.id=?', [termId]);
    termName = tr.length ? `${tr[0].name} (${tr[0].year})` : '';
  } else {
    const [ay] = await db.query('SELECT ay.id FROM academic_years ay WHERE ay.is_active=1 LIMIT 1');
    if (ay.length) {
      const [tr] = await db.query('SELECT id FROM terms WHERE academic_year_id=? ORDER BY id LIMIT 1', [ay[0].id]);
      if (tr.length) {
        termId = tr[0].id;
        const [tr2] = await db.query('SELECT t.name, ay.name AS year FROM terms t JOIN academic_years ay ON ay.id=t.academic_year_id WHERE t.id=?', [termId]);
        termName = tr2.length ? `${tr2[0].name} (${tr2[0].year})` : '';
      }
    }
  }

  // Roster = ALL students of this class for the roster term
  let students = [];
  if (termId) {
    [students] = await db.query(
      `SELECT s.id, s.name, s.admission_no FROM students s
       JOIN student_class_enrollments sce ON sce.student_id=s.id AND sce.class_id=? AND sce.term_id=?
       WHERE s.deleted_at IS NULL AND s.status='active' ORDER BY s.name`, [classId, termId]);
    // load existing marks for this exam+subject
    if (examId) {
      const [marks] = await db.query('SELECT student_id, marks_obtained, grade, remarks FROM marks WHERE exam_id=? AND subject_id=?', [examId, subjectId]);
      const markMap = {};
      marks.forEach(m => markMap[m.student_id] = m);
      students = students.map(s => ({ ...s, mark: markMap[s.id] || null }));
    }
  }

  res.render('teacher/marks-entry', { title: 'Marks Entry', classId, subjectId, exams, examId, exam, cls: cls[0], sub: sub[0], students, termId, termName, active: 'classes' });
});

exports.marksSave = asyncHandler(async (req, res) => {
  let { exam_id, term_id, subject_id, student_id, marks_value, remarks } = req.body;
  const classId = req.params.classId;

  // Only the assigned teacher may enter marks for this class+subject
  const [teacher] = await db.query('SELECT id FROM teachers WHERE user_id=? AND deleted_at IS NULL', [req.user.id]);
  if (!teacher.length) return res.redirect('/teacher');
  const teacherId = teacher[0].id;
  const [perm] = await db.query('SELECT id FROM class_teacher_assignments WHERE class_id=? AND subject_id=? AND teacher_id=?', [classId, subject_id, teacherId]);
  if (!perm.length) { req.flash('error', 'You are not assigned to teach this subject in this class.'); return res.redirect('/teacher/classes'); }

  // If no exam was chosen, auto-create a default assessment for the roster term
  if (!exam_id) {
    if (!term_id) {
      const [ay] = await db.query('SELECT id FROM academic_years WHERE is_active=1 ORDER BY id LIMIT 1');
      if (ay.length) {
        const [tr] = await db.query('SELECT id FROM terms WHERE academic_year_id=? ORDER BY id LIMIT 1', [ay[0].id]);
        term_id = tr.length ? tr[0].id : null;
      }
    }
    if (!term_id) { req.flash('error', 'No active term found.'); return res.redirect(`/teacher/classes/${classId}`); }
    const [ins] = await db.query('INSERT INTO examinations (class_id, term_id, name, date, max_marks) VALUES (?,?,?,NOW(),100)', [classId, term_id, 'Assessment']);
    exam_id = String(ins.insertId);
  }

  // Find max_marks for this exam to compute grade
  const [ex] = await db.query('SELECT max_marks FROM examinations WHERE id=?', [exam_id]);
  const maxMarks = ex.length ? ex[0].max_marks : 100;

  const ids = Array.isArray(student_id) ? student_id : [student_id];
  const vals = Array.isArray(marks_value) ? marks_value : [marks_value];
  const rms = remarks ? (Array.isArray(remarks) ? remarks : [remarks]) : [];

  for (let i = 0; i < ids.length; i++) {
    const mv = vals[i];
    if (mv === '' || mv === null || mv === undefined) continue; // skip empty
    const num = parseFloat(mv);
    const grade = gradeFor(num, maxMarks);
    const note = rms[i] || null;
    await db.query(
      `INSERT INTO marks (exam_id, student_id, subject_id, marks_obtained, grade, remarks, entered_by)
       VALUES (?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE marks_obtained=VALUES(marks_obtained), grade=VALUES(grade), remarks=VALUES(remarks), entered_by=VALUES(entered_by)`,
      [exam_id, ids[i], subject_id, num, grade, note, req.user.id]
    );
  }
  req.flash('success', 'Marks saved.');
  res.redirect(`/teacher/marks/${classId}/${req.params.subjectId}?exam=${exam_id}`);
});

// ============================================================
// TEACHER COMMENTS
// ============================================================
exports.comments = asyncHandler(async (req, res) => {
  const classId = req.params.classId;
  const [teacher] = await db.query('SELECT id FROM teachers WHERE user_id=? AND deleted_at IS NULL', [req.user.id]);
  if (!teacher.length) return res.redirect('/teacher');
  const teacherId = teacher[0].id;
  const [perm] = await db.query('SELECT id FROM class_teacher_assignments WHERE class_id=? AND teacher_id=?', [classId, teacherId]);
  if (!perm.length) { req.flash('error', 'Not assigned.'); return res.redirect('/teacher/classes'); }

  const [cls] = await db.query('SELECT name FROM classes WHERE id=?', [classId]);
  const [students] = await db.query(
    `SELECT s.id, s.name FROM students s
     JOIN student_class_enrollments sce ON sce.student_id=s.id AND sce.class_id=?
     JOIN terms t ON t.id=sce.term_id JOIN academic_years ay ON ay.id=t.academic_year_id
     WHERE s.deleted_at IS NULL AND s.status='active' AND ay.is_active=1 ORDER BY s.name`, [classId]);
  const [terms] = await db.query(`SELECT t.*, ay.name AS year FROM terms t JOIN academic_years ay ON ay.id=t.academic_year_id WHERE ay.is_active=1`);
  const termId = req.query.term || (terms.length ? terms[0].id : null);

  const [comments] = termId ? await db.query(
    'SELECT student_id, comment FROM teacher_comments WHERE term_id=? AND teacher_id=?', [termId, teacherId]) : [];
  const cMap = {};
  (comments || []).forEach(c => cMap[c.student_id] = c.comment);

  res.render('teacher/comments', { title: 'Teacher Comments', classId, cls: cls[0], students, terms, termId, cMap, active: 'classes' });
});

exports.commentsSave = asyncHandler(async (req, res) => {
  const { classId, term_id, student_id, comment } = req.body;
  const [teacher] = await db.query('SELECT id FROM teachers WHERE user_id=?', [req.user.id]);
  const teacherId = teacher[0].id;

  const ids = Array.isArray(student_id) ? student_id : [student_id];
  const texts = Array.isArray(comment) ? comment : [comment];
  for (let i = 0; i < ids.length; i++) {
    const t = (texts[i] || '').trim();
    if (!t) continue;
    await db.query(
      `INSERT INTO teacher_comments (student_id, term_id, teacher_id, comment) VALUES (?,?,?,?)
       ON DUPLICATE KEY UPDATE comment=VALUES(comment)`,
      [ids[i], term_id, teacherId, t]
    );
  }
  req.flash('success', 'Comments saved.');
  res.redirect(`/teacher/comments/${classId}?term=${term_id}`);
});

// ============================================================
// RESULTS / PROGRESS
// ============================================================
exports.results = asyncHandler(async (req, res) => {
  const [teacher] = await db.query('SELECT id FROM teachers WHERE user_id=? AND deleted_at IS NULL', [req.user.id]);
  if (!teacher.length) return res.redirect('/teacher');
  const teacherId = teacher[0].id;

  const [classes] = await db.query(
    'SELECT DISTINCT c.id, c.name FROM class_teacher_assignments cta JOIN classes c ON c.id=cta.class_id WHERE cta.teacher_id=? AND c.deleted_at IS NULL ORDER BY c.name', [teacherId]);

  const [terms] = await db.query(`SELECT t.id, t.name, ay.name AS year FROM terms t JOIN academic_years ay ON ay.id=t.academic_year_id ORDER BY t.id DESC`);

  const classId = req.query.class || (classes.length ? classes[0].id : null);
  const termId = req.query.term || '';

  let results = [];
  let sumMap = {};
  if (classId && termId) {
    // All students in class, with their marks for the term
    const [students] = await db.query(
      `SELECT DISTINCT s.id, s.name, s.admission_no FROM students s
       JOIN student_class_enrollments sce ON sce.student_id=s.id AND sce.class_id=?
       WHERE s.deleted_at IS NULL AND s.status='active' ORDER BY s.name`, [classId]);
    for (const st of students) {
      const [marks] = await db.query(
        `SELECT m.marks_obtained, sub.name AS subject_name FROM marks m
         JOIN examinations e ON e.id=m.exam_id AND e.term_id=?
         JOIN subjects sub ON sub.id=m.subject_id
         WHERE m.student_id=? AND e.class_id=? ORDER BY sub.name`, [termId, st.id, classId]);
      st.marks = marks;
      st.total = marks.reduce((a, m) => a + parseFloat(m.marks_obtained), 0);
      st.max = marks.length ? marks.length * 100 : 0;
      st.avg = st.max ? Math.round((st.total / st.max) * 100 * 10) / 10 : 0;
      results.push(st);
    }
    // sort by avg desc
    results.sort((a, b) => b.avg - a.avg);
    // rank
    results.forEach((r, i) => r.rank = i + 1);
  }

  res.render('teacher/results', { title: 'Results & Progress', classes, terms, classId, termId, results, active: 'results' });
});

// ============================================================
// CLASS TEACHER VERIFICATION (confirm full results & send to admin)
// ============================================================
exports.classResults = asyncHandler(async (req, res) => {
  // Only teachers who are the class teacher (homeroom) of a class can confirm
  const [teacher] = await db.query('SELECT id FROM teachers WHERE user_id=? AND deleted_at IS NULL', [req.user.id]);
  if (!teacher.length) return res.redirect('/teacher');
  const teacherId = teacher[0].id;

  const [homerooms] = await db.query(
    `SELECT DISTINCT c.id, c.name, c.section
     FROM class_teacher_assignments cta
     JOIN classes c ON c.id=cta.class_id
     WHERE cta.teacher_id=? AND cta.subject_id IS NULL AND c.deleted_at IS NULL
     ORDER BY c.name`, [teacherId]);
  if (!homerooms.length) {
    return res.render('teacher/class-results', {
      title: 'Confirm Results', classes: [], terms: [], classId: null, termId: null,
      cls: null, subjects: [], rows: [], submission: null, active: 'confirm'
    });
  }

  const [terms] = await db.query(
    `SELECT t.id, t.name, ay.name AS year FROM terms t
     JOIN academic_years ay ON ay.id=t.academic_year_id ORDER BY t.id DESC`);

  const classId = req.query.class || homerooms[0].id;
  const termId = req.query.term || (terms.length ? terms[0].id : '');

  // Verify the teacher really is the class teacher of the selected class
  const [isHomeroom] = await db.query(
    'SELECT id FROM class_teacher_assignments WHERE class_id=? AND teacher_id=? AND subject_id IS NULL',
    [classId, teacherId]);
  if (!isHomeroom.length) {
    req.flash('error', 'You are only the class teacher of your own classes.');
    return res.redirect(`/teacher/class-results?class=${homerooms[0].id}${termId ? '&term=' + termId : ''}`);
  }

  const [cls] = await db.query('SELECT name, section FROM classes WHERE id=? AND deleted_at IS NULL', [classId]);
  const { subjects, rows } = termId
    ? await buildTermResults(classId, termId)
    : { subjects: [], rows: [] };
  const submission = termId ? await getResultSubmission(classId, termId) : null;

  res.render('teacher/class-results', {
    title: 'Confirm Results', classes: homerooms, terms, classId, termId,
    cls: cls[0] || null, subjects, rows, submission, active: 'confirm'
  });
});

exports.classResultsSend = asyncHandler(async (req, res) => {
  const classId = req.params.classId;
  const termId = req.body.term;
  if (!termId) {
    req.flash('error', 'Select a term to confirm.');
    return res.redirect(`/teacher/class-results?class=${classId}`);
  }

  const [teacher] = await db.query('SELECT id FROM teachers WHERE user_id=? AND deleted_at IS NULL', [req.user.id]);
  if (!teacher.length) return res.redirect('/teacher');
  const teacherId = teacher[0].id;

  // Must be the homeroom/class teacher
  const [isHomeroom] = await db.query(
    'SELECT id FROM class_teacher_assignments WHERE class_id=? AND teacher_id=? AND subject_id IS NULL',
    [classId, teacherId]);
  if (!isHomeroom.length) {
    req.flash('error', 'You are not the class teacher of this class.');
    return res.redirect('/teacher/class-results');
  }

  const existing = await getResultSubmission(classId, termId);
  if (existing && (existing.status === 'submitted' || existing.status === 'approved')) {
    req.flash('error', 'These results are already sent to the admin.');
    return res.redirect(`/teacher/class-results?class=${classId}&term=${termId}`);
  }

  await db.query(
    `INSERT INTO term_result_submissions (class_id, term_id, status, submitted_by, submitted_at)
     VALUES (?,?, 'submitted', ?, NOW())
     ON DUPLICATE KEY UPDATE status='submitted', submitted_by=VALUES(submitted_by), submitted_at=VALUES(submitted_at)`,
    [classId, termId, req.user.id]
  );
  req.flash('success', 'Results confirmed and sent to the admin for review.');
  res.redirect(`/teacher/class-results?class=${classId}&term=${termId}`);
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
  res.render('teacher/messages', { title: 'Messages', messages: rows, active: 'messages' });
});

exports.messageRead = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const [rows] = await db.query(
    `SELECT m.*, s.name AS sender_name FROM messages m
     JOIN message_recipients mr ON mr.message_id=m.id AND mr.user_id=?
     LEFT JOIN users s ON s.id=m.sender_id WHERE m.id=?`, [userId, req.params.id]);
  if (!rows.length) { req.flash('error', 'Message not found.'); return res.redirect('/teacher/messages'); }
  await db.query(
    'UPDATE message_recipients SET is_read=1, read_at=NOW() WHERE message_id=? AND user_id=?', [req.params.id, userId]);
  res.render('teacher/message-view', { title: 'Message', msg: rows[0], active: 'messages' });
});