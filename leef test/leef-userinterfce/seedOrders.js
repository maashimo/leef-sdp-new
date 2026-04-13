const mysql = require('mysql2/promise');

const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: 'root1234',
    database: 'leef-db',
};

async function seed() {
    let conn;
    try {
        conn = await mysql.createConnection(dbConfig);
        console.log('Connected to DB');

        // Look up the customer
        const [users] = await conn.execute(
            'SELECT customer_id FROM customers WHERE email = ?',
            ['madhushipanchali03@gmail.com']
        );
        if (users.length === 0) {
            console.log('Customer not found');
            return;
        }
        const customerId = users[0].customer_id;
        console.log('Customer ID:', customerId);

        // Get products
        const [products] = await conn.execute('SELECT id, seller_id, name FROM products LIMIT 5');
        if (products.length === 0) {
            console.log('No products found');
            return;
        }
        console.log('Products:', products.map(p => p.name).join(', '));

        // Check table columns
        const [cols] = await conn.execute("SHOW COLUMNS FROM order_requests");
        const colNames = cols.map(c => c.Field);
        console.log('Columns:', colNames.join(', '));

        const hasMessage = colNames.includes('message');
        const hasExpectedDate = colNames.includes('expected_date');
        const hasUpdatedAt = colNames.includes('updated_at');

        const orderInfos = [
            { daysAgo: 2, qty: 3, note: 'Fresh and well packed — delivered on time' },
            { daysAgo: 5, qty: 5, note: 'Good quality produce' },
            { daysAgo: 8, qty: 2, note: 'Order fulfilled as requested' },
            { daysAgo: 15, qty: 4, note: 'Excellent product — delivered promptly' },
        ];

        for (let i = 0; i < orderInfos.length; i++) {
            const p = products[i % products.length];
            const d = orderInfos[i];
            const date = new Date();
            date.setDate(date.getDate() - d.daysAgo);
            const dateStr = date.toISOString().slice(0, 19).replace('T', ' ');

            // 1. Insert into order_requests
            const reqCols = ['user_id', 'product_id', 'seller_id', 'total_qty', 'locations', 'status', 'admin_note', 'created_at', 'unit_price', 'total_price'];
            const unitPrice = 150.00; // Mock price
            const totalPrice = unitPrice * d.qty;
            const reqVals = [customerId, p.id, p.seller_id || 1, d.qty, '[]', 'approved', d.note, dateStr, unitPrice, totalPrice];

            if (hasMessage) { reqCols.push('message'); reqVals.push(`Test order for ${p.name}`); }
            if (hasExpectedDate) { reqCols.push('expected_date'); reqVals.push(date.toISOString().slice(0, 10)); }
            if (hasUpdatedAt) { reqCols.push('updated_at'); reqVals.push(dateStr); }

            const reqSql = `INSERT INTO order_requests (${reqCols.join(', ')}) VALUES (${reqVals.map(() => '?').join(', ')})`;
            const [reqResult] = await conn.execute(reqSql, reqVals);
            const requestId = reqResult.insertId;

            // 2. Insert into orders (Finalized Order)
            await conn.execute(
                `INSERT INTO orders (user_id, product_id, seller_id, order_type, request_id, quantity, unit_price, total_price, status, payment_status, payment_method, created_at)
                 VALUES (?, ?, ?, 'request', ?, ?, ?, ?, 'ready', 'paid', 'cod', ?)`,
                [customerId, p.id, p.seller_id || 1, requestId, d.qty, unitPrice, totalPrice, dateStr]
            );

            console.log(`  Inserted order & request for "${p.name}" (${d.daysAgo} days ago)`);
        }

        console.log('\nDone! 4 test orders inserted into both order_requests and orders tables.');
    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        if (conn) await conn.end();
        process.exit(0);
    }
}

seed();
