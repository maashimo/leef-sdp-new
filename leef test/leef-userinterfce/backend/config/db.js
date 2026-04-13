require("dotenv").config();
const mysql = require("mysql2/promise");

let dbConfig;

if (process.env.DATABASE_URL) {
    // If a connection string is provided (standard for cloud DBs)
    dbConfig = process.env.DATABASE_URL;
} else {
    // Fallback to individual parameters for local development
    dbConfig = {
      host: process.env.DB_HOST || "localhost",
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASS || "root1234",
      database: process.env.DB_NAME || "leef-db",
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    };
}

// Create connection pool
const pool = mysql.createPool(dbConfig);

// Test connection (optional but useful)
async function testConnection() {
  try {
    const conn = await pool.getConnection();
    console.log("✅ Connected to MySQL database:", dbConfig.database);
    conn.release();
  } catch (err) {
    console.error("❌ Database connection failed:", err.message);
  }
}

testConnection();

module.exports = { pool, dbConfig };