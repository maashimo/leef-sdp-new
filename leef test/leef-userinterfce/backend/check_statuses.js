const mysql = require('mysql2/promise');

const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: 'root1234',
    database: 'leef-db',
};

async function checkStatuses() {
    try {
        const conn = await mysql.createConnection(dbConfig);
        const [rows] = await conn.execute("SELECT DISTINCT status FROM order_requests");
        console.log("Distinct statuses in order_requests:");
        console.table(rows);
        await conn.end();
    } catch (err) {
        console.error("Error:", err.message);
    }
}
checkStatuses();
