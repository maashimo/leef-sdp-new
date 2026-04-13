const mysql = require('mysql2/promise');
const fs = require('fs');

async function test() {
    fs.writeFileSync('out.txt', 'Start\n');
    const pool = mysql.createPool({
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'leef_db',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });

    try {
        fs.appendFileSync('out.txt', 'Testing getConsolidatedOrders query...\n');
        const [finalized] = await pool.execute(`
            SELECT 'item' as source, i.id, i.user_id, i.product_id, i.seller_id, i.quantity, 
                   i.unit_price as price, i.total_price, i.status, i.payment_status, 
                   p.name as product_name, p.image_url, p.sale_details, s.shop_name, i.created_at, r.admin_note, NULL as rejection_reason, r.locations
            FROM orders i
            JOIN products p ON i.product_id = p.id
            LEFT JOIN sellers s ON i.seller_id = s.seller_id
            LEFT JOIN order_requests r ON i.request_id = r.id
            WHERE i.user_id = 1
        `);
        fs.appendFileSync('out.txt', 'getConsolidatedOrders items count: ' + finalized.length + '\n');
    } catch (e) {
        fs.appendFileSync('out.txt', 'Error in getConsolidatedOrders: ' + e.message + '\n');
    }

    try {
        fs.appendFileSync('out.txt', 'Testing getAllRequests query...\n');
        const [rows] = await pool.execute(`
            SELECT 'request' as source, r.id, r.user_id, r.product_id, r.seller_id, r.total_qty as quantity, 
                   r.status, r.created_at, p.name as product_name, p.image_url, p.stock as available_qty, 
                   p.price as seller_price,
                   COALESCE(p.sale_details, p.final_price, p.price) as unit_price, 
                   c.name as customer_name, c.email as customer_email, r.locations
            FROM order_requests r
            JOIN products p ON r.product_id = p.id
            JOIN customers c ON r.user_id = c.customer_id
            UNION ALL
            SELECT 'direct' as source, o.id, o.user_id, o.product_id, o.seller_id, o.quantity, 
                   o.status, o.created_at, p.name as product_name, p.image_url, p.stock as available_qty, 
                   p.price as seller_price,
                   o.unit_price as unit_price, 
                   c.name as customer_name, c.email as customer_email, NULL as locations
            FROM orders o
            JOIN products p ON o.product_id = p.id
            JOIN customers c ON o.user_id = c.customer_id
            WHERE o.request_id IS NULL
            ORDER BY created_at DESC
        `);
        fs.appendFileSync('out.txt', 'getAllRequests passed, count: ' + rows.length + '\n');
    } catch (e) {
        fs.appendFileSync('out.txt', 'Error in getAllRequests: ' + e.message + '\n');
    }

    fs.appendFileSync('out.txt', 'Done.\n');
    await pool.end();
    process.exit(0);
}

test();
