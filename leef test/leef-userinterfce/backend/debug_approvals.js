const mysql = require('mysql2/promise');

async function debug() {
    const pool = mysql.createPool({
        host: 'localhost',
        user: 'root',
        password: 'root1234',
        database: 'leef-db',
    });

    try {
        console.log("--- Most Recent Approved Seller Refunds ---");
        const [rows] = await pool.execute(`
            SELECT id, order_id, product_id, status, responsible_party, responsible_seller_id, updated_at 
            FROM refunds 
            WHERE status = 'approved' AND responsible_party = 'seller'
            ORDER BY updated_at DESC LIMIT 5
        `);
        console.log(JSON.stringify(rows, null, 2));

        console.log("\n--- Sellers ---");
        const [sellers] = await pool.execute("SELECT seller_id, name, email FROM sellers");
        console.log(JSON.stringify(sellers, null, 2));

    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

debug();
