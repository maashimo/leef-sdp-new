const mysql = require('mysql2/promise');

const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: 'root1234',
    database: 'leef-db',
};

async function debug() {
    try {
        const conn = await mysql.createConnection(dbConfig);
        console.log("Connected to leef-db");

        const [rows] = await conn.execute(`
            SELECT r.id, r.product_id, r.total_qty, p.name, p.price, p.final_price, p.stock
            FROM order_requests r
            JOIN products p ON r.product_id = p.id
            ORDER BY r.created_at DESC
            LIMIT 5
        `);

        console.log("Latest Order Requests:");
        rows.forEach(r => {
            console.log(`ID: ${r.id} | Product: ${r.name} | Unit Price: ${r.final_price || r.price} | Total Qty: ${r.total_qty} | Stock: ${r.stock}`);
            console.log(`  Calculated Full Price: ${(r.final_price || r.price) * r.total_qty}`);
        });

        await conn.end();
    } catch (err) {
        console.error("Debug Error:", err.message);
    }
}
debug();
