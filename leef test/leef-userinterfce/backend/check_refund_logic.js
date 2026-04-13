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
        const [refunds] = await pool.execute("SELECT * FROM refunds ORDER BY updated_at DESC LIMIT 5");
        console.log("Recent Refunds:", JSON.stringify(refunds, null, 2));

        const [sellers] = await pool.execute("SELECT seller_id, shop_name, email FROM sellers");
        console.log("Sellers:", JSON.stringify(sellers, null, 2));

    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

debug();
