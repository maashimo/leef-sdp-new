const { mysql } = require("mysql2/promise");
require("dotenv").config({ path: __dirname + "/backend/.env" });

async function verify() {
    const dbConfig = {
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || 'root1234',
        database: process.env.DB_NAME || 'leef-db'
    };

    console.log("Connecting to database with config:", { ...dbConfig, password: "****" });
    
    let conn;
    try {
        const mysql = require("mysql2/promise");
        conn = await mysql.createConnection({
            host: dbConfig.host,
            user: dbConfig.user,
            password: 'root1234', // Hardcoded as per .env check earlier
            database: dbConfig.database
        });

        console.log("✅ Connected to database");

        // Check if orders table has total_price
        const [cols] = await conn.execute("SHOW COLUMNS FROM orders LIKE 'total_price'");
        if (cols.length > 0) {
            console.log("✅ orders table has 'total_price' column");
        } else {
            console.log("❌ orders table is missing 'total_price' column");
        }

        // Test the query from getSellerPrepSummary
        const sellerId = 1; // Assuming seller 1 exists
        const date = '2026-03-29'; // Date from the user's screenshot
        
        console.log(`Testing query for seller ${sellerId} on ${date}...`);
        
        const [rows] = await conn.execute(`
            SELECT p.id, p.name as product_name, p.image_url, p.price as price_string,
                   SUM(o.quantity) as total_qty, SUM(o.total_price) as total_amount
            FROM orders o
            JOIN products p ON o.product_id = p.id
            WHERE o.seller_id = ? AND DATE(o.created_at) = ? AND o.status != 'cancelled'
            GROUP BY p.id, p.name, p.image_url, p.price
        `, [sellerId, date]);

        console.log("Query Result Rows:", rows.length);
        if (rows.length > 0) {
            console.log("First Row Amount:", rows[0].total_amount);
            if (rows[0].total_amount !== undefined) {
                console.log("✅ total_amount is present in the result set");
            } else {
                console.log("❌ total_amount is MISSING in the result set");
            }
        } else {
            console.log("⚠️ No orders found for this seller/date to test the sum.");
        }

    } catch (err) {
        console.error("❌ Verification failed:", err.message);
    } finally {
        if (conn) await conn.end();
    }
}

verify();
