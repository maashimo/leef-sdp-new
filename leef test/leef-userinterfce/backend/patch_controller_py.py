import os

file_path = r'c:\Users\User\Desktop\leef new\leef test\leef-userinterfce\backend\controllers\productController.js'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Target block
target = """            // Update product with final details
            await pool.execute(
                `UPDATE products SET 
                 name = COALESCE(?, name),
                 stock = COALESCE(?, stock),
                 final_price = ?, 
                 image_url = COALESCE(?, image_url),
                 coins_percent = ?,
                 sale_details = ?,
                 is_ads = ?,
                 is_approved = 1 
                 WHERE id = ?`,
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
            );"""

# Replacement block
replacement = """            // Fetch existing data to safely merge updates
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
                `UPDATE products SET 
                 name = ?,
                 stock = ?,
                 final_price = ?, 
                 image_url = ?,
                 coins_percent = ?,
                 sale_details = ?,
                 is_ads = ?,
                 description = ?,
                 is_approved = 1 
                 WHERE id = ?`,
                [updName, updStock, updPrice, updImg, updCoins, updSale, updAds, updDesc, pid || null]
            );"""

# Normalize line endings for replacement
content_norm = content.replace('\r\n', '\n')
target_norm = target.replace('\r\n', '\n')

if target_norm in content_norm:
    new_content = content_norm.replace(target_norm, replacement)
    
    # Also need to remove the subsequent description update if it exists because I merged it
    desc_update = """
            // Update description if provided
            if (req.body.description) {
                await pool.execute("UPDATE products SET description = ? WHERE id = ?", [req.body.description, pid]);
            }"""
    desc_update_norm = desc_update.replace('\r\n', '\n')
    if desc_update_norm in new_content:
        new_content = new_content.replace(desc_update_norm, "")

    with open(file_path, 'w', encoding='utf-8', newline='') as f:
        f.write(new_content)
    print("Successfully patched productController.js")
else:
    print("Could not find TargetContent block.")
