const { pool } = require('./config/db');
async function list() {
  try {
    const [rows] = await pool.execute("SHOW COLUMNS FROM product_images");
    console.log(JSON.stringify(rows));
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
list();
