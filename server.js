/**
 * Server entry point.
 * Starts the HTTP server and verifies DB connectivity on boot.
 */
require('dotenv').config();
const { app } = require('./app');
const db = require('./config/db');

const PORT = process.env.PORT || 3000;

// Quick DB connectivity check on startup
db.query('SELECT 1')
  .then(() => {
    console.log('[db] MySQL connection OK.');
    app.listen(PORT, () => {
      console.log(`[server] Opportunity School Management System running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('[db] Could not connect to MySQL:', err.message);
    console.error('Check your .env DB_* settings and that MySQL is running.');
    process.exit(1);
  });