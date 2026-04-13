const { pool } = require('./config/db');
async function run() {
    try {
        console.log("Attempting to add display_order to product_images...");
        await pool.execute("ALTER TABLE product_images ADD COLUMN display_order INT DEFAULT 0");
        console.log("Done!");
    } catch (e) {
        if (e.code === 'ER_DUP_COLUMN_NAME') {
            console.log("Column already exists.");
        } else {
            console.error("Error:", e);
        }
    }
    
    try {
        console.log("Attempting to add description to products...");
        await pool.execute("ALTER TABLE products ADD COLUMN description TEXT");
        console.log("Done!");
    } catch (e) {
        if (e.code === 'ER_DUP_COLUMN_NAME') {
            console.log("Column already exists.");
        } else {
            console.error("Error:", e);
        }
    }
    process.exit(0);
}
run();
