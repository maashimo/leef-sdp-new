const mysql = require('mysql2/promise');
require('dotenv').config({ path: './backend/.env' });

async function updateSchema() {
    let connection;
    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASS || 'root1234',
            database: process.env.DB_NAME || 'leef-db'
        });

        console.log("Connected to database.");

        const columnsToAdd = [
            { name: 'district', type: 'VARCHAR(100)' },
            { name: 'delivery_address', type: 'TEXT' },
            { name: 'locations', type: 'JSON' }
        ];

        const [existingColumns] = await connection.execute("SHOW COLUMNS FROM orders");
        const existingNames = existingColumns.map(c => c.Field);

        for (const col of columnsToAdd) {
            if (!existingNames.includes(col.name)) {
                console.log(`Adding column: ${col.name}`);
                await connection.execute(`ALTER TABLE orders ADD COLUMN ${col.name} ${col.type}`);
            } else {
                console.log(`Column ${col.name} already exists.`);
            }
        }

        console.log("Database schema updated successfully.");
    } catch (err) {
        console.error("Error updating schema:", err);
    } finally {
        if (connection) await connection.end();
    }
}

updateSchema();
