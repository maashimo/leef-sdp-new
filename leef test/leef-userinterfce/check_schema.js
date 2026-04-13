const mysql = require('mysql2/promise');
require('dotenv').config({ path: './backend/.env' });

async function checkSchema() {
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'leef_db'
        });

        console.log("Checking 'orders' table columns:");
        const [columns] = await connection.execute("SHOW COLUMNS FROM orders");
        console.table(columns);

        await connection.end();
    } catch (err) {
        console.error("Error:", err);
    }
}

checkSchema();
