const { pool } = require('./config/db');
async function fix() {
    try {
        process.stdout.write("STARTING ALTER...\n");
        await pool.query("ALTER TABLE refunds MODIFY COLUMN status VARCHAR(50)");
        await pool.query("ALTER TABLE refunds MODIFY COLUMN responsible_party VARCHAR(50)");
        process.stdout.write("SUCCESS_SCHEMA_UPDATED\n");
        process.exit(0);
    } catch (err) {
        process.stderr.write("ERROR: " + err.message + "\n");
        process.exit(1);
    }
}
fix();
