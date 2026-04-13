const mysql = require('mysql2/promise');

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
        console.log("Approved Refunds:", JSON.stringify(rows, null, 2));

        const [sellers] = await pool.execute("SELECT seller_id, name, email FROM sellers");
        console.log("All Sellers:", JSON.stringify(sellers, null, 2));

    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

debug();
