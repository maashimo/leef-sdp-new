const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function debug() {
    const pool = mysql.createPool({
        host: 'localhost',
        user: 'root',
        password: 'root1234',
        database: 'leef-db',
    });

    try {
        const [rows] = await pool.execute(`
            SELECT r.id, r.responsible_seller_id, r.responsible_party, r.status, p.name 
            FROM refunds r
            LEFT JOIN products p ON r.product_id = p.id
            WHERE r.status = 'approved'
        `);
        const [sellers] = await pool.execute("SELECT seller_id, name, email FROM sellers");
        const out = {
            approved_refunds: rows,
            sellers: sellers
        };
        fs.writeFileSync('C:\\Users\\User\\Desktop\\leef new\\FINAL_DEBUG.json', JSON.stringify(out, null, 2));
    } catch (e) {
        fs.writeFileSync('C:\\Users\\User\\Desktop\\leef new\\FINAL_ERROR.txt', e.stack);
    } finally {
        await pool.end();
    }
}

debug();
