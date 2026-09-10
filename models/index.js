/**
 * Database helper functions shared across controllers.
 * Since MySQL is our only store, these thin wrappers keep
 * controllers readable and queries queryable in one place.
 */
const db = require('../config/db');

// ============================================================
// GENERIC
// ============================================================

async function all(sql, params = []) {
  const [rows] = await db.query(sql, params);
  return rows;
}

async function get(sql, params = []) {
  const [rows] = await db.query(sql, params);
  return rows[0] || null;
}

async function run(sql, params = []) {
  const [result] = await db.query(sql, params);
  return result;
}

// ============================================================
// DASHBOARD COUNTS (admin)
// ============================================================

async function adminStats() {
  const [[students], [teachers], [classes], [pendingApps], [activeYear]] = await Promise.all([
    db.query(`SELECT COUNT(*) AS total FROM students WHERE deleted_at IS NULL AND status='active'`),
    db.query(`SELECT COUNT(*) AS total FROM teachers WHERE deleted_at IS NULL`),
    db.query(`SELECT COUNT(*) AS total FROM classes WHERE deleted_at IS NULL`),
    db.query(`SELECT COUNT(*) AS total FROM admission_applications WHERE status='pending'`),
    db.query(`SELECT * FROM academic_years WHERE is_active=1 ORDER BY id DESC LIMIT 1`)
  ]);
  return {
    students: students[0].total,
    teachers: teachers[0].total,
    classes: classes[0].total,
    pendingApplications: pendingApps[0].total,
    activeYear: activeYear[0] || null
  };
}

module.exports = { db, all, get, run, adminStats };
