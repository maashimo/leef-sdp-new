const { pool } = require('./config/db');

async function seedDummyPrices() {
    try {
        console.log("Seeding dummy prices and quantities...");

        // 1. Update order_requests with random prices and quantities if 0
        await pool.execute(`
            UPDATE order_requests 
            SET unit_price = 1200.00, total_price = total_qty * 1200.00 
            WHERE unit_price = 0 OR unit_price IS NULL
        `);
        console.log("Updated order_requests with default prices.");

        // 2. Update existing refunds with refund_amount if 0
        // We'll try to pull from order_requests or products
        await pool.execute(`
            UPDATE refunds r
            LEFT JOIN order_requests o ON r.order_id = o.id
            LEFT JOIN products p ON r.product_id = p.id
            SET r.refund_amount = COALESCE(NULLIF(o.unit_price, 0), p.price, 1500.00)
            WHERE r.refund_amount = 0 OR r.refund_amount IS NULL
        `);
        console.log("Updated refunds with default refund amounts.");

        console.log("Seeding complete!");
        process.exit(0);
    } catch (err) {
        console.error("Error seeding dummy prices:", err);
        process.exit(1);
    }
}

seedDummyPrices();
