const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
    try {
        const c = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        await c.query(`
            CREATE TABLE IF NOT EXISTS user_locations (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                short_name VARCHAR(100) NOT NULL,
                location_details VARCHAR(255) NOT NULL,
                status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        console.log('user_locations created');
        await c.end();
    } catch (e) {
        console.error(e);
    }
}
run();
