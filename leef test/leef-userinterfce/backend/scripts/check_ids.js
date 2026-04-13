const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { dbConfig } = require('../config/db');

async function checkOverlaps() {
    let conn;
    try {
        conn = await mysql.createConnection(dbConfig);
        console.log('--- Checking for ID overlaps between Customers and Sellers ---');

        const [sharedIds] = await conn.execute(`
            SELECT c.customer_id as id, c.email as customer_email, s.email as seller_email
            FROM customers c
            JOIN sellers s ON c.customer_id = s.seller_id
        `);

        if (sharedIds.length > 0) {
            console.log(`Found ${sharedIds.length} shared IDs:`);
            sharedIds.forEach(row => {
                console.log(`ID ${row.id}: Customer(${row.customer_email}) / Seller(${row.seller_email})`);
            });
        } else {
            console.log('No direct ID overlaps found (where customer_id == seller_id).');
        }

        console.log('\n--- Checking for Orders with suspicious user_id ---');
        const [suspiciousOrders] = await conn.execute(`
            SELECT o.id, o.user_id, c.email as customer_email, s.email as seller_email
            FROM orders o
            LEFT JOIN customers c ON o.user_id = c.customer_id
            LEFT JOIN sellers s ON o.user_id = s.seller_id
            WHERE o.user_id = 3
        `);
        console.log(`Orders for user_id 3: ${suspiciousOrders.length}`);
        suspiciousOrders.forEach(o => {
            console.log(`Order ${o.id}: user_id=${o.user_id}, CustomerEmail=${o.customer_email}, SellerEmail=${o.seller_email}`);
        });

    } catch (err) {
        console.error(err);
    } finally {
        if (conn) await conn.end();
    }
}

checkOverlaps();
