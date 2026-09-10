/**
 * User model - common database operations for users.
 */
const db = require('../config/db');

/**
 * Find a single user by id (active only).
 */
async function findById(id) {
  const [rows] = await db.query(
    `SELECT id, name, email, password, role, phone, avatar, is_active, last_login, created_at
     FROM users WHERE id = ? AND deleted_at IS NULL`,
    [id]
  );
  return rows[0] || null;
}

/**
 * Find a single user by email (including for login).
 */
async function findByEmail(email) {
  const [rows] = await db.query(
    'SELECT * FROM users WHERE email = ? AND deleted_at IS NULL',
    [email]
  );
  return rows[0] || null;
}

/**
 * Create a new user. Returns the inserted id.
 */
async function create({ name, email, password, role, phone }) {
  const [result] = await db.query(
    'INSERT INTO users (name, email, password, role, phone) VALUES (?, ?, ?, ?, ?)',
    [name, email, password, role, phone || null]
  );
  return result.insertId;
}

/**
 * Update a user's basic fields.
 */
async function update(id, fields) {
  const allowed = ['name', 'email', 'phone', 'avatar', 'is_active', 'last_login'];
  const sets = [];
  const vals = [];
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      sets.push(`${key} = ?`);
      vals.push(fields[key]);
    }
  }
  if (!sets.length) return 0;
  vals.push(id);
  const [result] = await db.query(
    `UPDATE users SET ${sets.join(', ')} WHERE id = ?`,
    vals
  );
  return result.affectedRows;
}

/**
 * Soft delete a user.
 */
async function softDelete(id) {
  const [result] = await db.query(
    'UPDATE users SET deleted_at = NOW() WHERE id = ?',
    [id]
  );
  return result.affectedRows;
}

/**
 * List users by role (active only).
 */
async function listByRole(role) {
  const [rows] = await db.query(
    'SELECT id, name, email, role, phone, is_active, created_at FROM users WHERE role = ? AND deleted_at IS NULL ORDER BY name',
    [role]
  );
  return rows;
}

/**
 * Count users by role.
 */
async function countByRole(role) {
  const [rows] = await db.query(
    'SELECT COUNT(*) AS c FROM users WHERE role = ? AND deleted_at IS NULL',
    [role]
  );
  return rows[0].c;
}

module.exports = { findById, findByEmail, create, update, softDelete, listByRole, countByRole };
