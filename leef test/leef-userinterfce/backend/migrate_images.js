const { pool } = require('./config/db');

async function migrate() {
  try {
    // Check product_images for display_order
    const [cols] = await pool.execute("SHOW COLUMNS FROM product_images");
    const hasOrder = cols.some(c => c.Field === 'display_order');
    if (!hasOrder) {
      console.log("Adding display_order to product_images...");
      await pool.execute("ALTER TABLE product_images ADD COLUMN display_order INT DEFAULT 0");
    }

    // Check products for description (already likely there)
    const [pCols] = await pool.execute("SHOW COLUMNS FROM products");
    const hasDesc = pCols.some(c => c.Field === 'description');
    if (!hasDesc) {
      console.log("Adding description to products...");
      await pool.execute("ALTER TABLE products ADD COLUMN description TEXT");
    }

    console.log("Migration successful!");
    process.exit(0);
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  }
}

migrate();
