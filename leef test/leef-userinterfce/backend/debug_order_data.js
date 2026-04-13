const { pool } = require("./config/db");

async function debugData() {
    try {
        const [rows] = await pool.execute(`
            SELECT r.id, r.product_id, r.total_qty, p.name, p.price, p.final_price, p.stock
            FROM order_requests r
            JOIN products p ON r.product_id = p.id
            LIMIT 5
        `);
        console.log("Order Data Samples:");
        console.table(rows);

        rows.forEach(r => {
            console.log(`Order #${r.id}: unit_price=${r.final_price || r.price}, total_qty=${r.total_qty}`);
            const totalPrice = (r.final_price || r.price) * r.total_qty;
            console.log(`  Calculated Total: ${totalPrice}`);
        });
    } catch (err) {
        console.error("Debug Error:", err);
    } finally {
        process.exit(0);
    }
}
debugData();
