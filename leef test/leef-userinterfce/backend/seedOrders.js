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

        const [users] = await conn.execute(
            'SELECT customer_id FROM customers WHERE email = ?',
            ['madhushipanchali03@gmail.com']
        );
        if (users.length === 0) { console.log('Customer not found'); return; }
        const customerId = users[0].customer_id;
        console.log('Customer ID:', customerId);

        const [products] = await conn.execute('SELECT id, seller_id, name FROM products LIMIT 5');
        if (products.length === 0) { console.log('No products found'); return; }
        console.log('Products:', products.map(p => p.name).join(', '));

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

            const fieldNames = ['user_id', 'product_id', 'seller_id', 'total_qty', 'locations', 'status', 'admin_note', 'created_at'];
            const vals = [customerId, p.id, p.seller_id || 1, d.qty, '[]', 'approved', d.note, dateStr];

            if (hasMessage) { fieldNames.push('message'); vals.push('Test order for ' + p.name); }
            if (hasExpectedDate) { fieldNames.push('expected_date'); vals.push(date.toISOString().slice(0, 10)); }
            if (hasUpdatedAt) { fieldNames.push('updated_at'); vals.push(dateStr); }

            const sql = `INSERT INTO order_requests (${fieldNames.join(', ')}) VALUES (${vals.map(() => '?').join(', ')})`;
            await conn.execute(sql, vals);
            console.log('  Inserted order for "' + p.name + '" (' + d.daysAgo + ' days ago)');
        }

        console.log('\nDone! 4 approved test orders inserted.');
    } catch (e) {
        console.error('Error:', e.message);
        console.error(e.stack);
    } finally {
        if (conn) await conn.end();
        process.exit(0);
    }
}

seed();
