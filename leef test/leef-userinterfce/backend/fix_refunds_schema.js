const { pool } = require('./config/db');
async function fix() {
    try {
        console.log("Altering refunds table...");
        await pool.execute("ALTER TABLE refunds MODIFY COLUMN status VARCHAR(50)");
        await pool.execute("ALTER TABLE refunds MODIFY COLUMN responsible_party VARCHAR(50)");
        console.log("Success! Schema updated.");
        process.exit(0);
    } catch (err) {
        console.error("Failed to update schema:", err);
        process.exit(1);
    }
}
fix();
