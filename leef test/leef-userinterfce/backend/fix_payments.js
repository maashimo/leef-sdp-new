const { pool } = require("./config/db");
async function fix() {
    try {
        await pool.execute("ALTER TABLE payments ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP");
        console.log("Column created_at added to payments.");
        process.exit(0);
    } catch (e) {
        if (e.code === 'ER_DUP_FIELDNAME') {
            console.log("Column already exists.");
            process.exit(0);
        }
        console.error(e);
        process.exit(1);
    }
}
fix();
