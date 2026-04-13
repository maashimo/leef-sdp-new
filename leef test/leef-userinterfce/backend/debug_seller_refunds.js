const mysql = require('mysql2/promise');

async function debug() {
    const pool = mysql.createPool({
        host: 'localhost',
        user: 'root',
        password: 'root1234',
        database: 'leef-db',
    });

    try {
        console.log("--- Sellers ---");
        const [sellers] = await pool.execute("SELECT seller_id, name, email, shop_name FROM sellers WHERE shop_name LIKE '%leef-shop01%' OR email LIKE '%leef-shop01%'");
        console.log(JSON.stringify(sellers, null, 2));

        console.log("\n--- Refunds (Recent) ---");
        const [refunds] = await pool.execute("SELECT id, order_id, product_id, status, responsible_party, responsible_seller_id FROM refunds ORDER BY created_at DESC LIMIT 10");
        console.log(JSON.stringify(refunds, null, 2));

        console.log("\n--- Products (Recent) ---");
        const [products] = await pool.execute("SELECT id, name, seller_id FROM products LIMIT 10");
        console.log(JSON.stringify(products, null, 2));

    } catch (e) {
        console.error("DEBUG ERROR:", e);
    } finally {
        await pool.end();
    }
}

debug();
