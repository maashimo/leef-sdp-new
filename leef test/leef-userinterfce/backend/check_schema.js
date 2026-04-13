const { pool } = require("./config/db");

async function check() {
    try {
        const [rows] = await pool.execute("DESCRIBE customers");
        console.log("CUSTOMERS TABLE:", rows.map(r => r.Field));
        
        const [rRows] = await pool.execute("DESCRIBE refunds");
        console.log("REFUNDS TABLE:", rRows.map(r => r.Field));
        
        process.exit(0);
    } catch (err) {
        console.error("Error checking columns:", err.message);
        process.exit(1);
    }
}

check();
