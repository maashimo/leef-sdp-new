const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
};

async function updateTable() {
    let conn;
    try {
        conn = await mysql.createConnection(dbConfig);
        console.log("Connected to database.");

        // 1. Add user_id column
        try {
            await conn.execute("ALTER TABLE notifications ADD COLUMN user_id INT DEFAULT NULL AFTER id;");
            console.log("✅ Added user_id column.");
        } catch (e) { console.log("⚠️ user_id column might already exist."); }

        // 2. Add title column
        try {
            await conn.execute("ALTER TABLE notifications ADD COLUMN title VARCHAR(255) DEFAULT 'Notification' AFTER user_id;");
            console.log("✅ Added title column.");
        } catch (e) { console.log("⚠️ title column might already exist."); }

        // 3. Modify message to TEXT for longer alerts
        try {
            await conn.execute("ALTER TABLE notifications MODIFY COLUMN message TEXT NOT NULL;");
            console.log("✅ Modified message column to TEXT.");
        } catch (e) { console.warn("⚠️ Error modifying message:", e.message); }

        // 4. Modify type to VARCHAR for more flexibility (instead of ENUM)
        try {
            await conn.execute("ALTER TABLE notifications MODIFY COLUMN type VARCHAR(50) DEFAULT 'info';");
            console.log("✅ Modified type column to VARCHAR.");
        } catch (e) { console.warn("⚠️ Error modifying type:", e.message); }

        console.log("🎉 Notifications table update complete.");
    } catch (err) {
        console.error("❌ Database script error:", err.message);
    } finally {
        if (conn) await conn.end();
    }
}
updateTable();
