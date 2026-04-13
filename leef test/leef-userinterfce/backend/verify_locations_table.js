const mysql = require('mysql2/promise');
require('dotenv').config();
(async () => {
    try {
        const c = await mysql.createConnection({host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME});
        const [cols] = await c.query('DESCRIBE user_locations');
        console.log("TABLE EXISTS. COLUMNS:", cols.map(c => c.Field).join(', '));
        process.exit(0);
    } catch(err) {
        console.error("ERROR:", err.message);
        process.exit(1);
    }
})();
