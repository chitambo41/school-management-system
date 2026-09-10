/**
 * Integration-ish smoke test that mocks the MySQL pool interface.
 * It swaps require cache for config/db so queries return canned rows.
 * Then it exercises login + every route and asserts 200 (or handler redirect).
 */
const path = require('path');
const http = require('http');

// ---- Fake DB ----
const users = [
  { id: 1, name: 'System Admin', email: 'admin@school.com', password: '$2a$10$W9BTyNHMF5gueNzqcw11ZuR2qysuMCatVSP.qB8YcWV0TArn/ZuKm', role: 'admin', phone: null, avatar: null, is_active: 1 },
  { id: 2, name: 'John Smith', email: 'teacher1@school.com', password: '$2a$10$1z5ZgntCXcrtb9kAtlvAB./abeBMP/pmGxpteR1cv6OprAnqLcP0W', role: 'teacher', phone: null, avatar: null, is_active: 1 },
  { id: 5, name: 'Sarah Davis', email: 'parent1@school.com', password: '$2a$10$dP6gxo8JZjSYPXOcFo00n.d2P0IvcgcgjU5dTLQ8sH1.jq0OSSPw6', role: 'parent', phone: null, avatar: null, is_active: 1 }
];

const tables = {
  academic_years: [{ id: 1, name: '2024-2025', is_active: 1 }],
  terms: [{ id: 1, name: 'Term 1', academic_year_id: 1 }],
  classes: [{ id: 1, name: 'Grade 5', section: 'A' }],
  subjects: [{ id: 1, name: 'Mathematics', code: 'MATH' }],
  teachers: [{ id: 1, user_id: 2, employee_no: 'T-1001' }],
  students: [{ id: 1, parent_user_id: 5, admission_no: 'S-1', name: 'Emma Davis', date_of_birth: '2014-03-15', gender: 'female', status: 'active', report_approved_at: '2026-09-07 10:00:00', report_approved_by: 1 }],
  admission_applications: [{ id: 1, parent_user_id: 5, student_name: 'Sophie', status: 'pending', grade_applying: 'Grade 5' }],
  examinations: [{ id: 1, class_id: 1, term_id: 1, name: 'End of Term', max_marks: 100 }],
  marks: [{ id: 1, exam_id: 1, student_id: 1, marks_obtained: 90, grade: 'A' }],
  messages: [{ id: 1, sender_id: 1, subject: 'Hello', body: 'Welcome', audience: 'user', recipient_id: 5 }],
  message_recipients: [{ id: 1, message_id: 1, user_id: 5, is_read: 0 }],
  activity_logs: [],
  teacher_comments: [{ id: 1, student_id: 1, term_id: 1, teacher_id: 1, comment: 'Great' }],
  student_class_enrollments: [{ id: 1, student_id: 1, class_id: 1, term_id: 1 }],
  class_teacher_assignments: [{ id: 1, class_id: 1, teacher_id: 1, subject_id: 1 }],
  term_result_submissions: [{ id: 1, class_id: 1, term_id: 1, status: 'submitted', submitted_by: 2, submitted_at: '2026-09-08 10:00:00' }],
  attendance: []
};

function fakeQueryHandler(sql, params = []) {
  const str = String(sql).toLowerCase();
  const s0 = String(sql);

  // SELECT 1 heartbeat
  if (/^select\s+1\b/.test(str)) return Promise.resolve([[{ 1: 1 }], []]);

  // user by id (loadUser)
  if (/\bfrom\s+users\b/.test(str) && /\bid\s*=\s*\?/.test(str) && str.includes('select')) {
    const id = Number(params[0]);
    const u = users.find((x) => x.id === id);
    return Promise.resolve([u ? [u] : [], []]);
  }
  // user by email
  if (/\bfrom\s+users\b/.test(str) && /\bemail\s*=\s*\?/.test(str) && str.includes('select')) {
    const em = String(params[0]);
    const u = users.find((x) => x.email === em);
    return Promise.resolve([u ? [u] : [], []]);
  }
  // update/delete
  if (/^(update|delete)/.test(str)) return Promise.resolve([{ affectedRows: 1, insertId: 99 }, []]);
  // insert
  if (/^insert/.test(str)) {
    // capture the 'last user id' for user inserts
    return Promise.resolve([{ affectedRows: 1, insertId: 100 }, []]);
  }
  // count
  if (/count\(/i.test(str)) return Promise.resolve([[{ c: 2, total: 2 }], []]);

  // Generic select: gather tables, combine rows.
  // The primary entity is the table of the LAST (outermost) FROM clause, so a
  // handler's rows[0] reliably matches the FROM table even when the string has
  // a subquery before it (e.g. `SELECT (SELECT ... FROM x) FROM main`).
  const m = /(?:from|join)\s+`?([a-z_]+)`?/gi;
  const tbls = [];
  let mm; while ((mm = m.exec(s0))) tbls.push(mm[1].toLowerCase());
  const fromRe = /\bfrom\s+`?([a-z_]+)`?/gi;
  let fm, lastFrom = null;
  while ((fm = fromRe.exec(s0))) lastFrom = fm[1].toLowerCase();
  let out = [];
  if (lastFrom && tables[lastFrom]) out = out.concat(tables[lastFrom]);
  for (const t of tbls) {
    if (t !== lastFrom && tables[t]) out = out.concat(tables[t]);
  }
  return Promise.resolve([out, []]);
}

const fakeDb = { query: fakeQueryHandler };
require.cache[require.resolve('./config/db')] = { id: './config/db', filename: require.resolve('./config/db'), loaded: true, exports: fakeDb };

// Work around: models/User.js re-requires config/db - same cache key, ok.
const { app } = require('./app');
app.get('/auth/debug-session', (req, res) => {
  res.send(JSON.stringify({ hasSession: !!req.session, userId: req.session ? req.session.userId : null, user: req.user ? req.user.email : null }));
});

// ---- HTTP helpers with cookie jar ----
function request(port, method, url, cookie, body) {
  return new Promise((resolvePromise) => {
    const data = body ? new URLSearchParams(body).toString() : null;
    const options = {
      host: 'localhost',
      port,
      path: url,
      method,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      followAllRedirects: false
    };
    if (cookie) options.headers.Cookie = cookie;
    if (data) options.headers['Content-Length'] = Buffer.byteLength(data);
    const req = http.request(options, (res) => {
      let buf = '';
      res.on('data', (c) => buf += c);
      res.on('end', () => {
        const setCookie = res.headers['set-cookie'] || [];
        resolvePromise({ status: res.statusCode, location: res.headers.location, body: buf, cookies: setCookie });
      });
    });
    if (data) req.write(data);
    req.end();
  });
}

async function login(port, email, password) {
  const res = await request(port, 'POST', '/auth/login', null, { email, password });
  console.log(`LOGIN ${email} -> status ${res.status}, loc ${res.location}, cookies: ${JSON.stringify(res.cookies)}`);
  const cookies = res.cookies.map((c) => c.split(';')[0]).join('; ');
  return cookies;
}

const server = app.listen(0, async () => {
  const port = server.address().port;
  const failures = [];

  async function assertPage(label, method, url, cookie, body) {
    const res = await request(port, method, url, cookie, body);
    const ok = res.status === 200 || (body && res.location);
    if (!ok) {
      failures.push(`${label} -> ${res.status} ${res.location || ''}`);
      // print first 400 chars of error page
      const snippet = res.body.replace(/\s+/g, ' ').match(/Server error:\s*[^<]*/) || '';
      console.log('   ', snippet[0] ? snippet[0].slice(0, 400) : '');
    }
    return res;
  }

  // 1) Login each role and verify redirect to their dashboard
  const dashTargets = { admin: '/admin', teacher: '/teacher', parent: '/parent/dashboard' };
  for (const [role, email, pw] of [['admin', 'admin@school.com', 'Admin@123'], ['teacher', 'teacher1@school.com', 'Teacher@123'], ['parent', 'parent1@school.com', 'Parent@123']]) {
    const cookies = await login(port, email, pw);
    if (!cookies) { failures.push(`${role} login failed`); continue; }
    const home = await request(port, 'GET', '/dashboard', cookies, null);
    if (home.status !== 302 || home.location !== dashTargets[role]) {
      failures.push(`${role} dashboard -> ${home.status} ${home.location} (expected 302 ${dashTargets[role]})`);
    }
  }

  // 2) Admin pages
  const adminCookie = await login(port, 'admin@school.com', 'Admin@123');
  const adminPages = ['/admin', '/admin/applications', '/admin/applications/1', '/admin/students', '/admin/students/1', '/admin/students/new',
    '/admin/students/1/edit', '/admin/students/1/report', '/admin/teachers', '/admin/teachers/new', '/admin/teachers/1/edit', '/admin/classes', '/admin/classes/new',
    '/admin/classes/1/edit', '/admin/subjects', '/admin/assignments', '/admin/academic-years', '/admin/exams', '/admin/attendance',
    '/admin/messages', '/admin/reports?class=1&term=1', '/admin/results?class=1&term=1', '/admin/results/print?class=1&term=1',
    '/admin/results/print?class=1&term=1&student=1', '/admin/logs'];
  for (const p of adminPages) await assertPage(`ADMIN GET ${p}`, 'GET', p, adminCookie, null);

  // 3) Teacher pages
  const teacherCookie = await login(port, 'teacher1@school.com', 'Teacher@123');
  const teacherPages = ['/teacher', '/teacher/classes', '/teacher/classes/1', '/teacher/attendance/1', '/teacher/attendance-history/1',
    '/teacher/marks/1/1?exam=1', '/teacher/comments/1?term=1', '/teacher/results?class=1&term=1', '/teacher/class-results?class=1&term=1',
    '/teacher/messages'];
  for (const p of teacherPages) await assertPage(`TEACHER GET ${p}`, 'GET', p, teacherCookie, null);

  // 4) Parent pages
  const parentCookie = await login(port, 'parent1@school.com', 'Parent@123');
  const parentPages = ['/parent/dashboard', '/parent/apply', '/parent/applications', '/parent/children', '/parent/children/1',
    '/parent/results?child=1&term=1', '/parent/report/1/download', '/parent/progress?child=1', '/parent/messages', '/parent/messages/1'];
  for (const p of parentPages) await assertPage(`PARENT GET ${p}`, 'GET', p, parentCookie, null);

  // 5) RBAC: teacher must be denied /admin (redirected to own dashboard)
  const rbac = await request(port, 'GET', '/admin', teacherCookie, null);
  if (rbac.status !== 302 || rbac.location !== '/teacher') {
    failures.push(`RBAC teacher->/admin -> ${rbac.status} ${rbac.location} (expected 302 /teacher)`);
  }

  // 6) POST flows (approve application, register parent, send message)
  await assertPage('POST approve app', 'POST', '/admin/applications/1/approve', adminCookie, {});
  await assertPage('POST create student', 'POST', '/admin/students', adminCookie, { name: 'Test', date_of_birth: '2010-01-01', gender: 'male' });
  await assertPage('POST new teacher', 'POST', '/admin/teachers', adminCookie, { name: 'T', email: 't@t.com', password: 'secret1' });
  await assertPage('POST new class', 'POST', '/admin/classes', adminCookie, { name: 'Grade 9' });
  await assertPage('POST new subject', 'POST', '/admin/subjects', adminCookie, { name: 'Art' });
  await assertPage('POST assignment', 'POST', '/admin/assignments', adminCookie, { class_id: 1, teacher_id: 1, subject_id: 1 });
  await assertPage('POST year', 'POST', '/admin/academic-years', adminCookie, { name: '2026-2027', start_date: '2026-09-01', end_date: '2027-06-30' });
  await assertPage('POST term', 'POST', '/admin/terms', adminCookie, { academic_year_id: 1, name: 'Term 2' });
  await assertPage('POST activate term', 'POST', '/admin/terms/1/activate', adminCookie, {});
  await assertPage('POST exam', 'POST', '/admin/exams', adminCookie, { class_id: 1, term_id: 1, name: 'Mid Term', date: '2025-01-01', max_marks: 100 });
  await assertPage('POST approve report', 'POST', '/admin/students/1/report/approve', adminCookie, {});
  await assertPage('POST message all', 'POST', '/admin/messages', adminCookie, { subject: 'S', body: 'B', audience: 'all_parents' });
  await assertPage('POST message user', 'POST', '/admin/messages', adminCookie, { subject: 'S2', body: 'B2', audience: 'user', recipient_id: 5 });
  await assertPage('POST attendance', 'POST', '/teacher/attendance/1', teacherCookie, { date: '2025-01-05', student_id: ['1'], status: ['present'] });
  await assertPage('POST marks', 'POST', '/teacher/marks/1/1', teacherCookie, { exam_id: 1, subject_id: 1, student_id: ['1'], marks_value: ['88'] });
  await assertPage('POST comments', 'POST', '/teacher/comments/1', teacherCookie, { term_id: 1, student_id: ['1'], comment: ['Good'] });
  await assertPage('POST send results', 'POST', '/teacher/class-results/1/send', teacherCookie, { term: 1 });
  await assertPage('POST approve results', 'POST', '/admin/results/approve', adminCookie, { class: 1, term: 1 });
  await assertPage('POST request changes results', 'POST', '/admin/results/revision', adminCookie, { class: 1, term: 1, admin_note: 'Fix the marks' });
  await assertPage('POST apply', 'POST', '/parent/apply', parentCookie, { student_name: 'Alice', date_of_birth: '2016-05-05', gender: 'female', grade_applying: 'Grade 5' });
  await assertPage('POST register', 'POST', '/auth/register', null, { name: 'New Parent', email: 'new@parent.com', password: 'secret1', confirmPassword: 'secret1', phone: '' });

  server.close();
  if (failures.length) {
    console.log('\nFAILED:');
    failures.forEach((f) => console.log(' - ' + f));
    process.exit(1);
  } else {
    console.log('\nALL PROTECTED PAGE CHECKS PASSED');
  }
});