/**
 * Database configuration & connection pool
 * Uses mysql2/promise for clean async/await code.
 */
require('dotenv').config(); // <-- Important: load .env first

const mysql = require('mysql2');

// Create a connection pool (good for concurrent requests)
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'school_management',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  // Enable date strings so dates come back as 'YYYY-MM-DD' strings
  dateStrings: true
});

// Export a promise-based version of the pool
module.exports = pool.promise();
