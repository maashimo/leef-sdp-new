const mysql = require('mysql2/promise');
const path = require('path');

async function check() {
    const pool = mysql.createPool({
        host: 'localhost',
        user: 'root',
        password: 'root1234',
        database: 'leef-db',
    });

    try {
        const [users] = await pool.execute("SELECT id, email FROM users WHERE email = 'leef-shop01 3@gmail.com'");
        console.log("Seller User ID:", users[0] ? users[0].id : "NOT FOUND");

        const [refunds] = await pool.execute("SELECT * FROM refunds");
        console.log("All Refunds:", JSON.stringify(refunds, null, 2));

        const [prods] = await pool.execute("SELECT id, name, seller_id FROM products");
        console.log("All Products:", JSON.stringify(prods, null, 2));

    } catch (e) {
        console.error("DEBUG ERROR:", e);
    } finally {
        await pool.end();
    }
}

check();
