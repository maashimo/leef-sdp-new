const mysql = require("mysql2/promise");
require("dotenv").config({ quiet: true });

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
};

async function debug() {
    let conn;
    try {
        console.log("Connecting to DB...");
        conn = await mysql.createConnection(dbConfig);
        console.log("Connected.");

        const tables = ['products', 'product_updates', 'notifications', 'sellers'];
        for (const table of tables) {
            console.log(`\n--- Schema for table: ${table} ---`);
            try {
                const [cols] = await conn.execute(`SHOW COLUMNS FROM ${table}`);
                console.log(JSON.stringify(cols, null, 2));
            } catch (e) {
                console.log(`Error showing columns for ${table}: ${e.message}`);
            }
        }

    } catch (err) {
        console.error("Debug failed:", err.message);
    } finally {
        if (conn) await conn.end();
    }
}

debug();
