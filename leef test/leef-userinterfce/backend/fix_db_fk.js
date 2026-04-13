const mysql = require('mysql2/promise');
const { dbConfig } = require('./config/db');

async function fix() {
    console.log("Starting DB fix...");
    const conn = await mysql.createConnection(dbConfig);
    
    try {
        console.log("Attempting to drop foreign key fk_payments_order...");
        await conn.execute("ALTER TABLE payments DROP FOREIGN KEY fk_payments_order");
        console.log("✅ Dropped foreign key constraint.");
    } catch (e) {
        console.log("⚠️ Note (Drop FK):", e.message);
    }

    try {
        console.log("Attempting to modify column order_id to allow NULL...");
        await conn.execute("ALTER TABLE payments MODIFY COLUMN order_id INT DEFAULT NULL");
        console.log("✅ Modified order_id to allow NULL.");
    } catch (e) {
        console.log("⚠️ Note (Modify Column):", e.message);
    }

    await conn.end();
    console.log("Done.");
    process.exit(0);
}

fix().catch(e => {
    console.error("Uncaught exception:", e);
    process.exit(1);
});
