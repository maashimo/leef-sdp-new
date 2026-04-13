const mysql = require("mysql2/promise");
require("dotenv").config();
const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
};
async function fix() {
    let conn;
    try {
        process.stdout.write("CONNECTING...\n");
        conn = await mysql.createConnection(dbConfig);
        process.stdout.write("CONNECTED.\n");
        await conn.execute("ALTER TABLE refunds MODIFY COLUMN status VARCHAR(50)");
        await conn.execute("ALTER TABLE refunds MODIFY COLUMN responsible_party VARCHAR(50)");
        process.stdout.write("SUCCESS_SCHEMA_UPDATED\n");
        await conn.end();
        process.exit(0);
    } catch (err) {
        process.stderr.write("ERROR: " + err.message + "\n");
        if (conn) await conn.end();
        process.exit(1);
    }
}
fix();
