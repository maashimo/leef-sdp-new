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

        // 1. Get all customers
        const [customers] = await conn.execute('SELECT customer_id FROM customers');
        if (customers.length === 0) {
            console.log('No customers found to seed for.');
            return;
        }

        // 2. Get all products with their seller_ids
        const [products] = await conn.execute('SELECT id, seller_id, name FROM products');
        if (products.length === 0) {
            console.log('No products found to seed for.');
            return;
        }

        console.log(`Seeding for ${customers.length} customers and ${products.length} products...`);

        for (const customer of customers) {
            for (const product of products) {
                // Seed 1 order for each customer/product combination (cap it if too many)
                const date = new Date();
                date.setDate(date.getDate() - Math.floor(Math.random() * 10));
                const dateStr = date.toISOString().slice(0, 19).replace('T', ' ');
                const unitPrice = 150.00;
                const qty = Math.floor(Math.random() * 5) + 1;
                const totalPrice = unitPrice * qty;

                // Insert into orders
                await conn.execute(
                    `INSERT INTO orders (user_id, product_id, seller_id, order_type, quantity, unit_price, total_price, status, payment_status, payment_method, created_at)
                     VALUES (?, ?, ?, 'direct', ?, ?, ?, 'ready', 'paid', 'cod', ?)`,
                    [customer.customer_id, product.id, product.seller_id || 1, qty, unitPrice, totalPrice, dateStr]
                );
            }
        }

        console.log('Done! Comprehensive orders seeded.');
    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        if (conn) await conn.end();
        process.exit(0);
    }
}

seed();
