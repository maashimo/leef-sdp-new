const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const logFile = path.join(__dirname, 'migration_log.txt');
function log(msg) {
    console.log(msg);
    fs.appendFileSync(logFile, msg + '\n');
}

async function updateSchema() {
    let connection;
    try {
        fs.writeFileSync(logFile, 'Starting schema update...\n');
        log("DB Config: " + JSON.stringify({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            database: process.env.DB_NAME
        }));

        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASS || 'root1234',
            database: process.env.DB_NAME || 'leef-db'
        });

        log("Connected to database.");

        const columnsToAdd = [
            { name: 'district', type: 'VARCHAR(100)' },
            { name: 'delivery_address', type: 'TEXT' },
            { name: 'locations', type: 'JSON' }
        ];

        const [existingColumns] = await connection.execute("SHOW COLUMNS FROM orders");
        const existingNames = existingColumns.map(c => c.Field);

        for (const col of columnsToAdd) {
            if (!existingNames.includes(col.name)) {
                log(`Adding column: ${col.name}`);
                await connection.execute(`ALTER TABLE orders ADD COLUMN ${col.name} ${col.type}`);
            } else {
                log(`Column ${col.name} already exists.`);
            }
        }

        log("Database schema updated successfully.");
    } catch (err) {
        log("Error updating schema: " + err.message);
    } finally {
        if (connection) await connection.end();
        log("Connection closed.");
    }
}

updateSchema();
