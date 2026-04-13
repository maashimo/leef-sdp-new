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
        const out = [];

        const [sellers] = await pool.execute("SELECT seller_id, name, email, shop_name FROM sellers");
        out.push("--- SELLERS ---");
        out.push(JSON.stringify(sellers, null, 2));

        const [refunds] = await pool.execute("SELECT * FROM refunds");
        out.push("\n--- REFUNDS ---");
        out.push(JSON.stringify(refunds, null, 2));

        const [orders] = await pool.execute("SELECT id, seller_id, product_id FROM order_requests LIMIT 10");
        out.push("\n--- ORDER_REQUESTS ---");
        out.push(JSON.stringify(orders, null, 2));

        fs.writeFileSync(path.join(__dirname, 'debug_data_final.txt'), out.join('\n'));
        console.log("Debug data written to debug_data_final.txt");
    } catch (e) {
        fs.writeFileSync(path.join(__dirname, 'debug_error_final.txt'), e.stack);
    } finally {
        await pool.end();
    }
}

debug();
