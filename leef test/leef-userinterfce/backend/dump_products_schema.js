const { pool } = require("./config/db");
const fs = require('fs');

async function dumpSchema() {
    try {
        const [rows] = await pool.execute("DESCRIBE products");
        let output = "products table structure:\n";
        rows.forEach(r => {
            output += `${r.Field} | ${r.Type} | ${r.Null} | ${r.Key} | ${r.Default} | ${r.Extra}\n`;
        });
        fs.writeFileSync('products_schema_dump.txt', output);
        console.log("Dumped schema to products_schema_dump.txt");
    } catch (err) {
        fs.writeFileSync('products_schema_dump.txt', "Error: " + err.message);
        console.error("Error:", err);
    } finally {
        process.exit(0);
    }
}
dumpSchema();
