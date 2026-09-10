/**
 * Database initializer: creates the schema and loads seed data.
 * Usage: npm run db:init
 * Prerequisite: MySQL running, and DB_USER/DB_PASSWORD correct in .env
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2');

const host = process.env.DB_HOST || 'localhost';
const port = Number(process.env.DB_PORT) || 3306;
const user = process.env.DB_USER || 'root';
const password = process.env.DB_PASSWORD || '';
const database = process.env.DB_NAME || 'school_management';

async function main() {
  // Connect without database first (schema.sql creates it)
  const conn = mysql.createConnection({ host, port, user, password, multipleStatements: true });

  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  const seed = fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf8');

  await promisifyConnect(conn);
  console.log('[init] Connected to MySQL.');

  console.log('[init] Applying schema.sql ...');
  await promisifyQuery(conn, schema);

  console.log('[init] Loading seed.sql ...');
  await promisifyQuery(conn, seed);

  console.log('[init] Done. Database "' + database + '" is ready.');
  console.log('[init] Logins: admin@school.com/Admin@123, teacher1@school.com/Teacher@123, parent1@school.com/Parent@123');
  conn.end();
}

function promisifyConnect(conn) {
  return new Promise((resolve, reject) => conn.connect(err => err ? reject(err) : resolve()));
}
function promisifyQuery(conn, sql) {
  return new Promise((resolve, reject) => conn.query(sql, err => err ? reject(err) : resolve()));
}

main().catch((err) => {
  console.error('[init] Failed:', err.message);
  process.exit(1);
});