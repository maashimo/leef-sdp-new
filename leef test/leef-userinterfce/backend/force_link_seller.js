const mysql = require('mysql2/promise');

async function fix() {
    const pool = mysql.createPool({
        host: 'localhost',
        user: 'root',
        password: 'root1234',
        database: 'leef-db',
    });

    try {
        // 1. Find leef-shop01 ID
        const [sellers] = await pool.execute("SELECT seller_id FROM sellers WHERE email = 'leef-shop01 3@gmail.com' OR shop_name = 'leef-shop01'");
        if (sellers.length === 0) {
            console.log("❌ Seller leef-shop01 not found");
            return;
        }
        const realSellerId = sellers[0].seller_id;
        console.log(`✅ Real Seller ID for leef-shop01: ${realSellerId}`);

        // 2. Update order_requests that might be wrong (dummy orders often default to 1)
        const [orderResult] = await pool.execute(
            "UPDATE order_requests SET seller_id = ? WHERE seller_id = 1 OR seller_id IS NULL",
            [realSellerId]
        );
        console.log(`✅ Updated ${orderResult.affectedRows} order_requests to seller #${realSellerId}`);

        // 3. Update refunds that might be wrong
        const [refundResult] = await pool.execute(
            "UPDATE refunds SET responsible_seller_id = ? WHERE (responsible_seller_id = 1 OR responsible_seller_id IS NULL) AND responsible_party = 'seller'",
            [realSellerId]
        );
        console.log(`✅ Updated ${refundResult.affectedRows} refunds to seller #${realSellerId}`);

    } catch (e) {
        console.error("❌ ERROR:", e);
    } finally {
        await pool.end();
    }
}

fix();
