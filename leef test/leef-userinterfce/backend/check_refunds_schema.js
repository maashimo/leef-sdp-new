const { pool } = require('./config/db');
async function check() {
    try {
        const [rows] = await pool.execute('DESCRIBE refunds');
        console.table(rows);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
check();
