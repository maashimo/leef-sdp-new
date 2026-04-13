const { pool } = require("./config/db");

async function checkImages() {
    try {
        const [rows] = await pool.execute(`
      SELECT r.id, r.product_id, p.name, p.image_url 
      FROM refunds r 
      LEFT JOIN products p ON r.product_id = p.id
    `);
        console.log(rows);
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}
checkImages();
