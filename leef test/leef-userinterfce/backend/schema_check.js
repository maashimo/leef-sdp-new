const { pool } = require('./config/db');
async function run() {
    try {
        const [rows] = await pool.execute('DESCRIBE orders');
        console.log("SCHEMA_START");
        console.log(JSON.stringify(rows, null, 2));
        console.log("SCHEMA_END");
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}
run();
