const mysql = require('mysql2/promise');

async function repair() {
    const pool = mysql.createPool({
        host: 'localhost',
        user: 'root',
        password: 'root1234',
        database: 'leef-db',
    });

    try {
        console.log("🛠️  Repairing existing refunds with missing seller IDs...");

        // Find approved refunds for sellers where responsible_seller_id is NULL
        const [rows] = await pool.execute(`
            SELECT r.id, r.order_id, o.seller_id as fallback_seller_id
            FROM refunds r
            JOIN order_requests o ON r.order_id = o.id
            WHERE r.status = 'approved' 
              AND r.responsible_party = 'seller' 
              AND r.responsible_seller_id IS NULL
        `);

        if (rows.length === 0) {
            console.log("✅ No records need repair.");
        } else {
            console.log(`🔍 Found ${rows.length} records to repair.`);
            for (const row of rows) {
                if (row.fallback_seller_id) {
                    await pool.execute(
                        "UPDATE refunds SET responsible_seller_id = ? WHERE id = ?",
                        [row.fallback_seller_id, row.id]
                    );
                    console.log(`   ✅ Repaired Refund #${row.id} (Linked to Seller #${row.fallback_seller_id})`);
                } else {
                    console.log(`   ⚠️  Refund #${row.id} has no seller_id in order_requests either.`);
                }
            }
            console.log("🎉 Repair complete!");
        }

    } catch (e) {
        console.error("❌ REPAIR ERROR:", e);
    } finally {
        await pool.end();
    }
}

repair();
