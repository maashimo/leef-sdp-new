const mysql = require('mysql2/promise');
async function run() {
    const pool = mysql.createPool({ host: 'localhost', user: 'root', password: '', database: 'leef' });
    try {
        const [rows] = await pool.execute('DESCRIBE customers');
        console.log(JSON.stringify(rows.map(r => r.Field)));
    } catch (e) { console.error(e); }
    process.exit();
}
run();
