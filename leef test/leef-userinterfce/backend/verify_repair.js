const mysql = require('mysql2/promise');
const fs = require('fs');

async function verify() {
    const pool = mysql.createPool({
        host: 'localhost',
        user: 'root',
        password: 'root1234',
        database: 'leef-db',
    });

    try {
        const [refunds] = await pool.execute(`
            SELECT id, order_id, product_id, status, responsible_party, responsible_seller_id 
            FROM refunds 
            WHERE status = 'approved' AND responsible_party = 'seller'
        `);
        fs.writeFileSync('verify_repair.json', JSON.stringify(refunds, null, 2));
        console.log("Verification dump saved to verify_repair.json");
    } catch (e) {
        fs.writeFileSync('verify_error.txt', e.stack);
    } finally {
        await pool.end();
    }
}

verify();
