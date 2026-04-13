const { pool } = require("./config/db");

async function checkSchema() {
    try {
        const [rows] = await pool.execute("DESCRIBE order_requests");
        console.log("order_requests table structure:");
        console.table(rows);
    } catch (err) {
        console.error("Error:", err);
    } finally {
        process.exit(0);
    }
}
checkSchema();
