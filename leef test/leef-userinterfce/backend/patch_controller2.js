const fs = require('fs');
const content = fs.readFileSync('controllers/productController.js', 'utf8');

const targetStr = `            // Update product with final details
            await pool.execute(
                \`UPDATE products SET 
                 name = COALESCE(?, name),
                 stock = COALESCE(?, stock),
                 final_price = ?, 
                 image_url = COALESCE(?, image_url),
                 coins_percent = ?,
                 sale_details = ?,
                 is_ads = ?,
                 is_approved = 1 
                 WHERE id = ?\`,
                [
                    name || null, 
                    stock || null, 
                    finalPrice || null, 
                    mainImageUrl || null, 
                    coinsPercent || 0, 
                    saleDetails || null, 
                    isAds ? 1 : 0, 
                    pid || null
                ]
            );`;

const newStr = `            // Fetch existing data to safely merge updates
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

            // Update product with merged details
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
            );`;

// Handle CRLF vs LF
const t1 = targetStr.replace(/\r\n/g, '\n');
const t2 = targetStr.replace(/\n/g, '\r\n');

if (content.includes(t1)) {
    fs.writeFileSync('controllers/productController.js', content.replace(t1, newStr));
    console.log("Patched LF");
} else if (content.includes(t2)) {
    fs.writeFileSync('controllers/productController.js', content.replace(t2, newStr));
    console.log("Patched CRLF");
} else {
    // If still fails, try replacing lines based on markers
    const startIdx = content.indexOf('// Update product with final details');
    const endIdx = content.indexOf('// Update description if provided');
    if(startIdx > -1 && endIdx > -1) {
        let newContent = content.substring(0, startIdx) + newStr + '\\n\\n            ' + content.substring(endIdx);
        fs.writeFileSync('controllers/productController.js', newContent);
        console.log("Patched using index replacement");
    } else {
        console.log("Error: Target not found");
    }
}
