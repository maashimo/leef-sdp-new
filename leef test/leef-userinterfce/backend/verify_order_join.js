const { pool } = require("./config/db");

async function verify() {
    try {
        const [rows] = await pool.execute(`
            SELECT r.id, r.product_id, p.name as product_name, p.stock as available_qty
            FROM order_requests r
            JOIN products p ON r.product_id = p.id
            LIMIT 5
        `);
        console.log("Joined Data Sample:");
        console.table(rows);
    } catch (err) {
        console.error("Error:", err);
    } finally {
        process.exit(0);
    }
}
verify();
