const mysql = require('mysql2/promise');
const fs = require('fs');

async function check() {
    const pool = mysql.createPool({
        host: 'localhost',
        user: 'root',
        password: 'root1234',
        database: 'leef-db',
    });

    try {
        const [refunds] = await pool.execute("SELECT * FROM refunds");
        const [products] = await pool.execute("SELECT id, seller_id, name FROM products");
        const [sellers] = await pool.execute("SELECT seller_id, email FROM sellers");

        const output = {
            refunds,
            products,
            sellers
        };

        fs.writeFileSync('db_dump.json', JSON.stringify(output, null, 2));
        console.log("Dumped to db_dump.json");
    } catch (e) {
        fs.writeFileSync('db_error.txt', e.stack);
    } finally {
        await pool.end();
    }
}

check();
