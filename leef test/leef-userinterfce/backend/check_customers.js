const { pool } = require('./config/db');

async function checkSchema() {
    try {
        const [rows] = await pool.execute('DESCRIBE customers');
        console.log(JSON.stringify(rows, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

checkSchema();
