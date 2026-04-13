const mysql = require('mysql2/promise');
const fs = require('fs');

async function debug() {
    const pool = mysql.createPool({
        host: 'localhost',
        user: 'root',
        password: 'root1234',
        database: 'leef-db',
    });

    try {
        const [sellers] = await pool.execute("SELECT seller_id, name, email FROM sellers");
        const [refunds] = await pool.execute("SELECT id, order_id, product_id, status, responsible_party, responsible_seller_id FROM refunds");

        const data = { sellers, refunds };
        fs.writeFileSync('v3_debug.json', JSON.stringify(data, null, 2));
        console.log("Written to v3_debug.json");
    } catch (e) {
        fs.writeFileSync('v3_error.txt', e.stack);
    } finally {
        await pool.end();
    }
}

debug();
