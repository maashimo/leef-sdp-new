const fs = require('fs');
const content = fs.readFileSync('controllers/productController.js', 'utf8');

const regex = /\/\/ Update product with final details([\s\S]*?)\/\/ Update description if provided([\s\S]*?)\}\r?\n/m;

const match = content.match(regex);
if (match) {
    const newCode = `            // Fetch existing product data so we don't wipe out fields on partial inline saves
            const [ex] = await pool.execute("SELECT name, stock, final_price, image_url, coins_percent, sale_details, is_ads, description FROM products WHERE id = ?", [pid || null]);
            if (ex.length === 0) return res.status(404).json({ message: "Product not found" });
            const p = ex[0];

            const updName = name !== undefined ? name : p.name;
            const updStock = stock !== undefined ? stock : p.stock;
            const updPrice = finalPrice !== undefined ? finalPrice : p.final_price;
            const updImg = mainImageUrl !== null ? mainImageUrl : p.image_url;
            const updCoins = coinsPercent !== undefined ? coinsPercent : p.coins_percent;
            const updSale = saleDetails !== undefined ? saleDetails : p.sale_details;
            const updAds = isAds !== undefined ? (isAds ? 1 : 0) : p.is_ads;
            const updDesc = req.body.description !== undefined ? req.body.description : p.description;

            // Update product with precise details
            await pool.execute(
                \`UPDATE products SET 
                 name = ?,
                 stock = ?,
                 final_price = ?, 
                 image_url = ?,
                 coins_percent = ?,
                 sale_details = ?,
                 is_ads = ?,
                 description = ?,
                 is_approved = 1 
                 WHERE id = ?\`,
                [updName, updStock, updPrice, updImg, updCoins, updSale, updAds, updDesc, pid || null]
            );\n`;

    const updated = content.replace(regex, newCode);
    fs.writeFileSync('controllers/productController.js', updated);
    console.log("Successfully patched productController.js");
} else {
    console.log("Could not find TargetContent block.");
}
