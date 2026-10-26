require("dotenv").config({ path: require("node:path").join(__dirname, ".env"), quiet: true });
// Read the database configuration from the .env file.

const mysql = require("mysql2/promise");
// Import the MySQL driver and use the version that supports async/await.

const db = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 5
});
// Create a database connection pool that can be reused later.

module.exports = db;
// Allow other JavaScript files to reference this database connection pool.
