const { pool } = require("./config/db");
async function testQuery() {
    try {
        const query = `
      SELECT p.id, p.seller_id, p.name, p.category, p.price as seller_price, p.final_price as price, 
             p.stock, p.description, p.image_url, p.coins_percent, p.sale_details, p.is_ads, p.created_at, 
             s.name as seller_name, s.shop_name,
             COALESCE(SUM(o.quantity), 0) as sold_amount,
             (SELECT GROUP_CONCAT(image_url) FROM product_images WHERE product_id = p.id) as gallery
      FROM products p
      JOIN sellers s ON p.seller_id = s.seller_id
      LEFT JOIN orders o ON p.id = o.product_id
      WHERE p.is_approved = 1
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `;
        const [rows] = await pool.execute(query);
        console.log("Success! Found:", rows.length, "products.");
        process.exit(0);
    } catch (e) {
        console.error("SQL Error:", e.message);
        process.exit(1);
    }
}
testQuery();
