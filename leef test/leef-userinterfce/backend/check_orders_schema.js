const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
};

async function check() {
    const conn = await mysql.createConnection(dbConfig);
    const [cols] = await conn.execute('SHOW COLUMNS FROM orders');
    console.log(JSON.stringify(cols, null, 2));
    await conn.end();
}
check();
