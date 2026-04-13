const { pool } = require("./config/db");
async function check() {
    try {
        const [rows] = await pool.execute("SHOW TABLES");
        console.log("Tables:", rows);
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
check();
